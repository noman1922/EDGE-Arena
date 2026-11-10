"use server";

import { prisma } from "@/lib/prisma";
import { ContestStatus, PhaseStatus } from "@prisma/client";
import { requireRole } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import { revalidatePath } from "next/cache";

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Runner environment fallback
  }
}
import {
  getAuthoritativeContestDeadline,
  isContestActive,
  isContestConcluded,
  normalizeContestStatus,
} from "@/lib/contest-lifecycle";

export interface ParticipantContestCard {
  id: string;
  slug: string;
  title: string;
  track: string;
  description: string | null;
  status: "LIVE" | "UPCOMING" | "COMPLETED";
  stageTitle: string;
  startDateFormatted: string;
  endDateFormatted: string;
  deadlineIso: string;
  deadlineFormatted: string;
  submissionStatus: "NOT_STARTED" | "IN_PROGRESS" | "SUBMITTED" | "GRADED";
  isPublished: boolean;
  canStartOrContinue: boolean;
}

export async function getParticipantContests(): Promise<{
  live: ParticipantContestCard[];
  upcoming: ParticipantContestCard[];
  completed: ParticipantContestCard[];
}> {
  try {
    const session = await requireRole(["PARTICIPANT"]);
    const now = new Date();

    const enrollments = await prisma.contestParticipant.findMany({
      where: {
        userId: session.userId,
        status: { in: ["ACTIVE", "ENROLLED"] },
      },
      include: {
        contest: {
          include: {
            phases: {
              orderBy: { phaseNumber: "asc" },
              include: {
                tasks: {
                  include: {
                    submissions: {
                      where: { userId: session.userId },
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { enrolledAt: "desc" },
    });

    const live: ParticipantContestCard[] = [];
    const upcoming: ParticipantContestCard[] = [];
    const completed: ParticipantContestCard[] = [];

    for (const enrollment of enrollments) {
      const c = enrollment.contest;

      // Disallow drafts
      if (normalizeContestStatus(c.status) === ContestStatus.DRAFT) {
        continue;
      }

      const activePhase = c.phases.find((p) => p.status === PhaseStatus.OPEN) || c.phases[0];
      const stageTitle = activePhase ? `Phase ${activePhase.phaseNumber}: ${activePhase.title}` : "Diagnostic Stage";
      const { effectiveDeadline, isConcluded: isEnded } = getAuthoritativeContestDeadline(c, activePhase, now);
      const isLiveTime = isContestActive(c, now);

      const task = activePhase?.tasks[0];
      const existingSubmission = task?.submissions[0];
      let submissionStatus: "NOT_STARTED" | "IN_PROGRESS" | "SUBMITTED" | "GRADED" = "NOT_STARTED";

      if (existingSubmission) {
        if (existingSubmission.status === "GRADED" || existingSubmission.status === "PUBLISHED") {
          submissionStatus = "GRADED";
        } else if (existingSubmission.status === "SUBMITTED") {
          submissionStatus = "SUBMITTED";
        } else {
          submissionStatus = "IN_PROGRESS";
        }
      }

      let lifecycleState: "LIVE" | "UPCOMING" | "COMPLETED" = "UPCOMING";
      if (isEnded) lifecycleState = "COMPLETED";
      else if (isLiveTime) lifecycleState = "LIVE";

      const card: ParticipantContestCard = {
        id: c.id,
        slug: c.slug,
        title: c.title,
        track: c.track,
        description: c.description,
        status: lifecycleState,
        stageTitle,
        startDateFormatted: c.startDate.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "Asia/Dhaka" }),
        endDateFormatted: c.endDate.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "Asia/Dhaka" }),
        deadlineIso: effectiveDeadline.toISOString(),
        deadlineFormatted:
          effectiveDeadline.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Asia/Dhaka",
          }) + " (BST)",
        submissionStatus,
        isPublished: c.isPublished,
        canStartOrContinue: lifecycleState === "LIVE" && submissionStatus !== "SUBMITTED" && submissionStatus !== "GRADED",
      };

      if (lifecycleState === "LIVE") live.push(card);
      else if (lifecycleState === "UPCOMING") upcoming.push(card);
      else completed.push(card);
    }

    return { live, upcoming, completed };
  } catch (error) {
    console.error("Error fetching participant contests:", error);
    return { live: [], upcoming: [], completed: [] };
  }
}

export interface ParticipantLeaderboardRow {
  userId?: string;
  candidateName?: string;
  candidateId: string;
  rank: number;
  finalScore: number;
  isCurrentUser: boolean;
  isCertified: boolean;
}

export interface ParticipantLeaderboardData {
  contestTitle: string;
  isPublished: boolean;
  currentUserRank: number | null;
  rows: ParticipantLeaderboardRow[];
  contestsList: Array<{ id: string; title: string }>;
}

export async function getParticipantLeaderboard(
  contestId?: string
): Promise<ParticipantLeaderboardData> {
  try {
    const session = await requireRole(["PARTICIPANT"]);

    // Find enrolled contests
    const enrollments = await prisma.contestParticipant.findMany({
      where: { userId: session.userId },
      include: { contest: true },
    });

    const enrolledContests = enrollments.map((e) => ({
      id: e.contest.id,
      title: e.contest.title,
    }));

    if (enrolledContests.length === 0) {
      return {
        contestTitle: "No Enrolled Contests",
        isPublished: false,
        currentUserRank: null,
        rows: [],
        contestsList: [],
      };
    }

    const targetContestId = contestId || enrolledContests[0].id;
    const contest = await prisma.contest.findUnique({
      where: { id: targetContestId },
      include: {
        results: {
          include: {
            user: true,
          },
          orderBy: { rank: "asc" },
        },
        submissions: {
          where: { status: { in: ["GRADED", "PUBLISHED"] } },
          include: { user: true },
          orderBy: { finalScore: "desc" },
        },
      },
    });

    if (!contest) {
      return {
        contestTitle: "Contest not found",
        isPublished: false,
        currentUserRank: null,
        rows: [],
        contestsList: enrolledContests,
      };
    }

    // If published, read certified CohortResult rows
    if (contest.isPublished && contest.results.length > 0) {
      let userRank: number | null = null;
      const rows: ParticipantLeaderboardRow[] = contest.results.map((r) => {
        const isCurrent = r.userId === session.userId;
        if (isCurrent) userRank = r.rank;

        return {
          userId: r.userId,
          candidateName: r.user.name,
          candidateId: isCurrent
            ? `${r.user.candidateId || "YOU"} (You)`
            : r.user.candidateId || `ACI-CAND-${r.userId.slice(0, 4).toUpperCase()}`,
          rank: r.rank,
          finalScore: Number(r.totalScore),
          isCurrentUser: isCurrent,
          isCertified: r.isCertified,
        };
      });

      return {
        contestTitle: contest.title,
        isPublished: true,
        currentUserRank: userRank,
        rows,
        contestsList: enrolledContests,
      };
    }

    // If results are not certified/published yet, return empty rows and currentUserRank: null.
    // In strict adherence to assessment integrity protocol: do not expose unpublished scores or rankings.
    return {
      contestTitle: contest.title,
      isPublished: false,
      currentUserRank: null,
      rows: [],
      contestsList: enrolledContests,
    };
  } catch (error) {
    console.error("Error fetching participant leaderboard:", error);
    return {
      contestTitle: "",
      isPublished: false,
      currentUserRank: null,
      rows: [],
      contestsList: [],
    };
  }
}

export interface ParticipantQuestionReviewItem {
  id: string;
  questionNumber: number;
  type: string;
  prompt: string;
  instructions: string | null;
  points: number;
  earnedScore: number | null;
  status: "CORRECT" | "INCORRECT" | "UNANSWERED" | "MANUAL_EVALUATED" | "PENDING_EVALUATION";
  selectedOption: string | null;
  correctOptionKey: string | null;
  explanation: string | null;
  options: Array<{
    id: string;
    optionKey: string;
    text: string;
  }>;
  writtenText: string | null;
  wordCount: number | null;
  fileName: string | null;
  fileKey: string | null;
  evaluatorFeedback: string | null;
  taskTitle: string;
  taskNumber: number;
  phaseTitle: string;
  phaseNumber: number;
}

export interface ParticipantScorecardData {
  contestTitle: string;
  track: string;
  isPublished: boolean;
  submissionStatus: string;
  submittedAt: string | null;
  totalScore: number;
  maxScore: number;
  rank: number | null;
  percentile: number | null;
  isCertified: boolean;
  rubrics: Array<{
    name: string;
    weight: number;
    maxPoints: number;
    scoreAwarded: number;
    comments: string | null;
  }>;
  questionReviews: ParticipantQuestionReviewItem[];
}

export async function getParticipantScorecard(
  contestId?: string
): Promise<ParticipantScorecardData | null> {
  try {
    const session = await requireRole(["PARTICIPANT"]);

    // Find all submissions for this user in this contest
    const submissions = await prisma.submission.findMany({
      where: {
        userId: session.userId,
        ...(contestId ? { contestId } : {}),
      },
      include: {
        contest: {
          include: {
            results: {
              where: { userId: session.userId },
            },
          },
        },
        phase: true,
        task: {
          include: {
            rubrics: true,
            questions: {
              orderBy: { questionNumber: "asc" },
              include: {
                options: {
                  orderBy: { optionKey: "asc" },
                },
                answerKey: true,
              },
            },
          },
        },
        answers: true,
        evaluations: true,
      },
      orderBy: [{ phase: { phaseNumber: "asc" } }, { task: { taskNumber: "asc" } }],
    });

    if (submissions.length === 0) {
      return null;
    }

    const primarySub = submissions[0];
    const contest = primarySub.contest;
    const cohortResult = contest.results[0];
    const isPublished = contest.isPublished;

    // Strict security: if contest results are not published or this participant's result has not been certified, do not expose scores
    if (!isPublished || !cohortResult) {
      return {
        contestTitle: contest.title,
        track: contest.track,
        isPublished: false,
        submissionStatus: primarySub.status,
        submittedAt: primarySub.submittedAt?.toISOString() || null,
        totalScore: 0,
        maxScore: 100,
        rank: null,
        percentile: null,
        isCertified: false,
        rubrics: [],
        questionReviews: [],
      };
    }

    // Map all rubrics across all candidate tasks
    const allRubrics: ParticipantScorecardData["rubrics"] = [];
    const questionReviews: ParticipantQuestionReviewItem[] = [];
    let totalMaxPossible = 0;

    for (const sub of submissions) {
      totalMaxPossible += sub.task.totalPoints;

      for (const r of sub.task.rubrics) {
        const evaluation = sub.evaluations.find((e) => e.rubricId === r.id);
        allRubrics.push({
          name: r.name,
          weight: Number(r.weightPercentage),
          maxPoints: Number(r.maxPoints),
          scoreAwarded: evaluation ? Number(evaluation.scoreAwarded) : 0,
          comments: evaluation?.comments || null,
        });
      }

      // Parse question-level evaluator feedback from feedbackSummary
      const questionsFeedbackMap: Record<string, string> = {};
      if (sub.feedbackSummary) {
        try {
          const parsed = JSON.parse(sub.feedbackSummary);
          if (parsed && typeof parsed === "object" && parsed.questions) {
            Object.assign(questionsFeedbackMap, parsed.questions);
          }
        } catch {
          // Plain text fallback
        }
      }

      // Map questions and candidate answers
      for (const q of sub.task.questions) {
        const ans = sub.answers.find((a) => a.questionId === q.id);

        let status: ParticipantQuestionReviewItem["status"] = "UNANSWERED";
        let earnedScore: number | null = null;

        if (q.type === "MCQ") {
          if (!ans || !ans.selectedOption) {
            status = "UNANSWERED";
            earnedScore = 0;
          } else if (ans.isCorrect === true) {
            status = "CORRECT";
            earnedScore = ans.score !== null ? Number(ans.score) : q.points;
          } else {
            status = "INCORRECT";
            earnedScore = 0;
          }
        } else if (q.type === "WRITTEN") {
          if (!ans || !ans.writtenText?.trim()) {
            status = "UNANSWERED";
            earnedScore = 0;
          } else if (ans.score !== null && ans.score !== undefined) {
            status = "MANUAL_EVALUATED";
            earnedScore = Number(ans.score);
          } else {
            status = "PENDING_EVALUATION";
            earnedScore = null;
          }
        } else {
          // FILE_UPLOAD / PDF / FILE
          if (!ans || (!ans.fileKey && !ans.fileName)) {
            status = "UNANSWERED";
            earnedScore = 0;
          } else if (ans.score !== null && ans.score !== undefined) {
            status = "MANUAL_EVALUATED";
            earnedScore = Number(ans.score);
          } else {
            status = "PENDING_EVALUATION";
            earnedScore = null;
          }
        }

        questionReviews.push({
          id: q.id,
          questionNumber: q.questionNumber,
          type: q.type,
          prompt: q.prompt,
          instructions: q.instructions,
          points: q.points,
          earnedScore,
          status,
          selectedOption: ans?.selectedOption || null,
          correctOptionKey: q.answerKey?.correctOptionKey || null,
          explanation: q.answerKey?.explanation || null,
          options: q.options.map((o) => ({
            id: o.id,
            optionKey: o.optionKey,
            text: o.text,
          })),
          writtenText: ans?.writtenText || null,
          wordCount: ans?.wordCount || null,
          fileName: ans?.fileName || null,
          fileKey: ans?.fileKey || null,
          evaluatorFeedback: questionsFeedbackMap[q.id] || null,
          taskTitle: sub.task.title,
          taskNumber: sub.task.taskNumber,
          phaseTitle: sub.phase.title,
          phaseNumber: sub.phase.phaseNumber,
        });
      }
    }

    const totalScore = cohortResult
      ? Number(cohortResult.totalScore)
      : submissions.reduce((sum, s) => sum + (s.finalScore ? Number(s.finalScore) : 0), 0);

    return {
      contestTitle: contest.title,
      track: contest.track,
      isPublished: true,
      submissionStatus: primarySub.status,
      submittedAt: primarySub.submittedAt?.toISOString() || null,
      totalScore,
      maxScore: totalMaxPossible || 100,
      rank: cohortResult?.rank || null,
      percentile: cohortResult ? Number(cohortResult.percentile) : null,
      isCertified: cohortResult?.isCertified || false,
      rubrics: allRubrics,
      questionReviews,
    };
  } catch (error) {
    console.error("Error fetching participant scorecard:", error);
    return null;
  }
}

export interface ParticipantProfileData {
  id: string;
  name: string;
  email: string;
  candidateId: string;
  institution: string;
  cohort: string;
  enrolledContestsCount: number;
  completedSubmissionsCount: number;
  joinedDate: string;
}

export async function getParticipantProfile(): Promise<ParticipantProfileData | null> {
  try {
    const session = await requireRole(["PARTICIPANT"]);

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: {
        cohort: true,
        participants: true,
        submissions: {
          where: { status: { in: ["SUBMITTED", "GRADED", "PUBLISHED"] } },
        },
      },
    });

    if (!user) return null;

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      candidateId: user.candidateId || `ACI-${user.id.slice(0, 4).toUpperCase()}`,
      institution: user.institution || "National Campus Cluster",
      cohort: user.cohort?.name || "Campus Leadership Programme 2025",
      enrolledContestsCount: user.participants.length,
      completedSubmissionsCount: user.submissions.length,
      joinedDate: user.createdAt.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
    };
  } catch (error) {
    console.error("Error fetching participant profile:", error);
    return null;
  }
}

export interface UpdateParticipantProfileInput {
  name: string;
  institution?: string | null;
}

export async function updateParticipantProfileAction(
  input: UpdateParticipantProfileInput
): Promise<{
  success: boolean;
  error?: string;
  name?: string;
  institution?: string | null;
  user?: { id: string; name: string; institution: string | null };
}> {
  try {
    const session = await requireRole(["PARTICIPANT"]);

    if (!input || typeof input.name !== "string") {
      return { success: false, error: "Full name is required." };
    }

    const trimmedName = input.name.trim();
    if (trimmedName.length < 2) {
      return { success: false, error: "Full name must be at least 2 characters long." };
    }
    if (trimmedName.length > 100) {
      return { success: false, error: "Full name cannot exceed 100 characters." };
    }

    let trimmedInstitution: string | null = null;
    if (input.institution !== undefined && input.institution !== null) {
      if (typeof input.institution !== "string") {
        return { success: false, error: "Invalid institution format." };
      }
      const inst = input.institution.trim();
      if (inst.length > 150) {
        return { success: false, error: "Affiliation / institution cannot exceed 150 characters." };
      }
      trimmedInstitution = inst.length > 0 ? inst : null;
    }

    const existingUser = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, name: true, institution: true, email: true },
    });

    if (!existingUser) {
      return { success: false, error: "Participant account not found." };
    }

    const updated = await prisma.user.update({
      where: { id: session.userId },
      data: {
        name: trimmedName,
        institution: trimmedInstitution,
      },
      select: {
        id: true,
        name: true,
        institution: true,
      },
    });

    await recordAuditLog({
      actorId: session.userId,
      action: "UPDATE_PROFILE",
      targetType: "USER",
      targetId: session.userId,
      metadata: {
        oldName: existingUser.name,
        newName: updated.name,
        oldInstitution: existingUser.institution,
        newInstitution: updated.institution,
      },
    });

    safeRevalidatePath("/dashboard/profile");
    safeRevalidatePath("/dashboard");
    safeRevalidatePath("/admin/participants");

    return {
      success: true,
      name: updated.name,
      institution: updated.institution,
      user: updated,
    };
  } catch (error) {
    console.error("Error updating participant profile:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update profile",
    };
  }
}
