"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { getContestPenalties, calculateCandidateFinalScore } from "@/lib/monitoring";
import { isFreedomContest, getFreedomSelectionStatus } from "@/lib/freedom-contest";
import {
  getContestPublicationSettings,
  saveContestPublicationSettings,
} from "@/lib/auto-publish";
import { revalidatePath } from "next/cache";

function safeRevalidatePath(path: string, type?: "layout" | "page") {
  try {
    if (type) {
      revalidatePath(path, type);
    } else {
      revalidatePath(path);
    }
  } catch {
    // Fallback for runner environments
  }
}

export interface AdminLeaderboardRow {
  userId: string;
  candidateName: string;
  candidateEmail: string;
  candidateId: string;
  institution: string;
  submissionId: string | null;
  submissionStatus: string;
  submittedAt: string | null;
  autoGradeScore: number | null;
  manualGradeScore: number | null;
  rawScore: number;
  penalties: number;
  finalScore: number;
  rank: number;
  percentile: number;
  isCertified: boolean;
  publishedAt: string | null;
  selectionStatus?: "SELECTED" | "PROVISIONAL" | null;
}

export interface AdminResultsOverview {
  contestId: string;
  contestTitle: string;
  contestTrack: string;
  isPublished: boolean;
  autoPublish?: boolean;
  isFreedomContest?: boolean;
  totalEnrolled: number;
  totalSubmissions: number;
  unsubmittedCount: number;
  pendingEvaluationCount: number;
  gradedCount: number;
  finalizedCount: number;
  rows: AdminLeaderboardRow[];
}

async function fetchContestLeaderboardData(contestId: string) {
  return prisma.contest.findUnique({
    where: { id: contestId },
    select: {
      id: true,
      title: true,
      track: true,
      isPublished: true,
      _count: {
        select: {
          participants: true,
        },
      },
      submissions: {
        select: {
          id: true,
          userId: true,
          status: true,
          autoGradeScore: true,
          manualGradeScore: true,
          finalScore: true,
          submittedAt: true,
          task: {
            select: {
              questions: { select: { type: true } },
              rubrics: { select: { id: true } },
            },
          },
          user: {
            select: {
              name: true,
              email: true,
              candidateId: true,
              institution: true,
            },
          },
        },
      },
      results: {
        select: {
          userId: true,
          totalScore: true,
          rank: true,
          percentile: true,
          isCertified: true,
          publishedAt: true,
        },
      },
    },
  });
}

type ContestLeaderboardData = NonNullable<Awaited<ReturnType<typeof fetchContestLeaderboardData>>>;

export async function getAdminLeaderboardAndResults(
  contestId?: string
): Promise<{ contests: Array<{ id: string; title: string }>; current: AdminResultsOverview | null }> {
  try {
    await requireRole(["ADMIN"]);

    const isAll = contestId === "ALL";
    const knownTargetId = isAll ? undefined : (contestId && contestId !== "ALL" ? contestId : undefined);

    const contestsPromise = prisma.contest.findMany({
      select: { id: true, title: true },
      orderBy: { createdAt: "desc" },
    });

    let contests: Array<{ id: string; title: string }>;
    let contest: ContestLeaderboardData | null = null;
    let contestPenalties: any[] = [];

    if (knownTargetId) {
      const [cList, cTarget, cPenalties] = await Promise.all([
        contestsPromise,
        fetchContestLeaderboardData(knownTargetId),
        getContestPenalties(knownTargetId),
      ]);

      contests = cList;
      contest = cTarget;
      contestPenalties = cPenalties;
    } else {
      contests = await contestsPromise;
      if (contests.length === 0) {
        return { contests: [], current: null };
      }
      const selectedContestId = contests[0].id;
      const [cTarget, cPenalties] = await Promise.all([
        fetchContestLeaderboardData(selectedContestId),
        getContestPenalties(selectedContestId),
      ]);
      contest = cTarget;
      contestPenalties = cPenalties;
    }

    if (!contest) {
      return { contests, current: null };
    }

    // Group penalties by candidate
    const penaltiesByUser: Record<string, number> = {};
    for (const p of contestPenalties) {
      penaltiesByUser[p.userId] = (penaltiesByUser[p.userId] || 0) + p.points;
    }

    // Group submissions by candidate (userId)
    const candidateMap = new Map<string, typeof contest.submissions>();
    for (const sub of contest.submissions) {
      if (sub.status === "DRAFT") continue;
      if (!candidateMap.has(sub.userId)) {
        candidateMap.set(sub.userId, []);
      }
      candidateMap.get(sub.userId)!.push(sub);
    }

    const totalEnrolled = contest._count.participants;
    const totalCandidatesWithSubmissions = candidateMap.size;
    let gradedCandidateCount = 0;
    let pendingEvaluationCount = 0;

    const candidateRows: Array<{
      userId: string;
      user: (typeof contest.submissions)[0]["user"];
      primarySubId: string;
      status: string;
      submittedAt: Date | null;
      autoGradeScore: number;
      manualGradeScore: number;
      rawScore: number;
      penalties: number;
      finalScore: number;
    }> = [];

    for (const [userId, userSubs] of candidateMap.entries()) {
      const primary = userSubs[0];
      let autoSum = 0;
      let manualSum = 0;
      let allGraded = true;
      let hasGradingInProgress = false;
      let latestSubmittedAt: Date | null = null;

      for (const s of userSubs) {
        const requiresManualGrading =
          (s.task?.questions || []).some((q) => q.type === "WRITTEN" || q.type === "FILE_UPLOAD") ||
          (s.task?.rubrics || []).length > 0;

        if (s.status === "GRADING_IN_PROGRESS") {
          hasGradingInProgress = true;
          allGraded = false;
        } else if (requiresManualGrading) {
          if (s.status !== "GRADED" && s.status !== "PUBLISHED") {
            allGraded = false;
          }
        } else {
          // MCQ-only task: auto-graded upon submission
          if (s.status !== "GRADED" && s.status !== "PUBLISHED" && s.status !== "SUBMITTED") {
            allGraded = false;
          }
        }

        if (s.autoGradeScore !== null) autoSum += Number(s.autoGradeScore);
        if (s.manualGradeScore !== null) manualSum += Number(s.manualGradeScore);

        if (s.submittedAt && (!latestSubmittedAt || s.submittedAt > latestSubmittedAt)) {
          latestSubmittedAt = s.submittedAt;
        }
      }

      const overallStatus = hasGradingInProgress
        ? "GRADING_IN_PROGRESS"
        : allGraded && userSubs.length > 0
        ? "GRADED"
        : "SUBMITTED";

      if (overallStatus === "GRADED" || userSubs.some((s) => s.status === "PUBLISHED")) {
        gradedCandidateCount++;
      } else {
        pendingEvaluationCount++;
      }

      const rawScore = autoSum + manualSum;
      const userPenalties = penaltiesByUser[userId] || 0;
      const computedFinal = calculateCandidateFinalScore(rawScore, userPenalties);

      candidateRows.push({
        userId,
        user: primary.user,
        primarySubId: primary.id,
        status: overallStatus,
        submittedAt: latestSubmittedAt,
        autoGradeScore: autoSum,
        manualGradeScore: manualSum,
        rawScore,
        penalties: userPenalties,
        finalScore: computedFinal,
      });
    }

    const unsubmittedCount = Math.max(0, totalEnrolled - totalCandidatesWithSubmissions);
    const finalizedCount = gradedCandidateCount;

    // Map results by userId for O(1) lookup during sorting and projection
    const resultByUserId = new Map(contest.results.map((r) => [r.userId, r]));

    // Sort candidate attempts by finalScore DESC, submittedAt ASC for tie-breaking
    candidateRows.sort((a, b) => {
      const cohortA = resultByUserId.get(a.userId);
      const cohortB = resultByUserId.get(b.userId);
      const scoreA = cohortA ? Number(cohortA.totalScore) : a.finalScore;
      const scoreB = cohortB ? Number(cohortB.totalScore) : b.finalScore;

      if (scoreB !== scoreA) return scoreB - scoreA;
      return (a.submittedAt?.getTime() ?? 0) - (b.submittedAt?.getTime() ?? 0);
    });

    const publicationSettings = await getContestPublicationSettings(contest.id);
    const isFreedom = isFreedomContest(contest);

    const rows: AdminLeaderboardRow[] = candidateRows.map((cand, index) => {
      const cohortRes = resultByUserId.get(cand.userId);
      const provisionalRank = index + 1;
      const rank = cohortRes ? cohortRes.rank : provisionalRank;
      const totalCount = totalCandidatesWithSubmissions;
      const percentile = cohortRes
        ? Number(cohortRes.percentile)
        : totalCount > 1
        ? Math.round(((totalCount - provisionalRank) / (totalCount - 1)) * 100 * 10) / 10
        : 100.0;
      const finalScore = cohortRes ? Number(cohortRes.totalScore) : cand.finalScore;

      const isPub = contest.isPublished || Boolean(cohortRes?.publishedAt);
      const selectionStatus = isFreedom ? getFreedomSelectionStatus(finalScore) : null;

      return {
        userId: cand.userId,
        candidateName: cand.user.name,
        candidateEmail: cand.user.email,
        candidateId: cand.user.candidateId || `ACI-${cand.userId.substring(0, 4).toUpperCase()}`,
        institution: cand.user.institution || "National Campus Cluster",
        submissionId: cand.primarySubId,
        submissionStatus: cand.status,
        submittedAt: cand.submittedAt ? cand.submittedAt.toISOString() : null,
        autoGradeScore: cand.autoGradeScore,
        manualGradeScore: cand.manualGradeScore,
        rawScore: cand.rawScore,
        penalties: cand.penalties,
        finalScore,
        rank,
        percentile,
        isCertified: cohortRes ? cohortRes.isCertified : false,
        publishedAt: cohortRes?.publishedAt ? cohortRes.publishedAt.toISOString() : null,
        selectionStatus,
      };
    });

    return {
      contests,
      current: {
        contestId: contest.id,
        contestTitle: contest.title,
        contestTrack: contest.track,
        isPublished: contest.isPublished,
        autoPublish: publicationSettings.autoPublish,
        isFreedomContest: isFreedom,
        totalEnrolled,
        totalSubmissions: totalCandidatesWithSubmissions,
        unsubmittedCount,
        pendingEvaluationCount,
        gradedCount: gradedCandidateCount,
        finalizedCount,
        rows,
      },
    };
  } catch (error) {
    console.error("Error fetching leaderboard and results:", error);
    return { contests: [], current: null };
  }
}

export async function getContestAutoPublishSettingAction(
  contestId: string
): Promise<{ success: boolean; autoPublish: boolean; error?: string }> {
  try {
    await requireRole(["ADMIN"]);
    const settings = await getContestPublicationSettings(contestId);
    return { success: true, autoPublish: settings.autoPublish };
  } catch (err) {
    return {
      success: false,
      autoPublish: false,
      error: err instanceof Error ? err.message : "Failed to load auto-publish setting.",
    };
  }
}

export async function setContestAutoPublishSettingAction(
  contestId: string,
  autoPublish: boolean
): Promise<{ success: boolean; autoPublish: boolean; error?: string }> {
  try {
    const session = await requireRole(["ADMIN"]);
    const settings = await saveContestPublicationSettings(contestId, autoPublish, session.userId);
    safeRevalidatePath("/admin/results");
    return { success: true, autoPublish: settings.autoPublish };
  } catch (err) {
    return {
      success: false,
      autoPublish: false,
      error: err instanceof Error ? err.message : "Failed to update auto-publish setting.",
    };
  }
}

export interface AdminAuditLogRow {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata: any;
  createdAt: string;
  actorId: string | null;
}

export async function getAdminAuditLogs(limit: number = 50): Promise<AdminAuditLogRow[]> {
  try {
    await requireRole(["ADMIN"]);

    const logs = await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return logs.map((l) => ({
      id: l.id,
      action: l.action,
      targetType: l.targetType,
      targetId: l.targetId,
      metadata: l.metadata,
      createdAt: l.createdAt.toISOString(),
      actorId: l.actorId,
    }));
  } catch (error) {
    console.error("Error loading audit logs:", error);
    return [];
  }
}

export interface AdminSubmissionDetail {
  id: string;
  contestId: string;
  contestTitle: string;
  taskId: string;
  taskTitle: string;
  taskPoints?: number;
  userId: string;
  candidateName: string;
  candidateEmail: string;
  candidateId: string;
  institution: string;
  status: string;
  submittedAt: string | null;
  autoGradeScore: number | null;
  manualGradeScore: number | null;
  finalScore: number | null;
  isLate: boolean;
  overallFeedback?: string | null;
  answers: Array<{
    id: string;
    questionId: string;
    questionNumber: number;
    questionPrompt: string;
    questionType: string;
    points: number;
    selectedOption: string | null;
    writtenText: string | null;
    wordCount: number | null;
    fileName: string | null;
    fileKey: string | null;
    score: number | null;
    isCorrect?: boolean | null;
    feedback?: string | null;
    taskTitle?: string;
  }>;
  evaluations: Array<{
    rubricId: string;
    rubricName: string;
    maxPoints: number;
    weightPercentage: number;
    scoreAwarded: number;
    comments: string | null;
    taskTitle?: string;
  }>;
  unitSubmissions?: Array<{
    id: string;
    taskId: string;
    taskTitle: string;
    taskNumber?: number;
    phaseTitle?: string;
    status: string;
    submittedAt: string | null;
    autoGradeScore: number | null;
    manualGradeScore: number | null;
    finalScore: number | null;
  }>;
}

export interface AdminSubmissionsOverview {
  contests: Array<{ id: string; title: string }>;
  selectedContestId: string;
  contestTitle: string;
  metrics: {
    totalSubmissions: number;
    inReview: number;
    graded: number;
    averageScore: number;
  };
  submissions: AdminSubmissionDetail[];
}

export async function getAdminSubmissionsList(
  contestId?: string
): Promise<AdminSubmissionsOverview> {
  try {
    await requireRole(["ADMIN"]);

    const isAll = contestId === "ALL";
    const knownActiveId = isAll ? undefined : (contestId && contestId !== "ALL" ? contestId : undefined);

    const contestsPromise = prisma.contest.findMany({
      select: { id: true, title: true },
      orderBy: { createdAt: "desc" },
    });

    let contests: Array<{ id: string; title: string }>;
    let activeContestId: string | undefined;

    if (knownActiveId) {
      activeContestId = knownActiveId;
      contests = await contestsPromise;
    } else {
      contests = await contestsPromise;
      if (contests.length === 0) {
        return {
          contests: [],
          selectedContestId: "",
          contestTitle: "No Contests Available",
          metrics: { totalSubmissions: 0, inReview: 0, graded: 0, averageScore: 0 },
          submissions: [],
        };
      }
      activeContestId = isAll ? undefined : contests[0]?.id;
    }

    if (contests.length === 0) {
      return {
        contests: [],
        selectedContestId: "",
        contestTitle: "No Contests Available",
        metrics: { totalSubmissions: 0, inReview: 0, graded: 0, averageScore: 0 },
        submissions: [],
      };
    }

    const selectedContest = isAll
      ? null
      : contests.find((c) => c.id === activeContestId) || contests[0];

    const submissions = await prisma.submission.findMany({
      where: {
        ...(activeContestId ? { contestId: activeContestId } : {}),
        status: { not: "DRAFT" },
      },
      select: {
        id: true,
        contestId: true,
        contest: {
          select: {
            title: true,
          },
        },
        taskId: true,
        phase: {
          select: {
            title: true,
          },
        },
        userId: true,
        status: true,
        submittedAt: true,
        autoGradeScore: true,
        manualGradeScore: true,
        finalScore: true,
        feedbackSummary: true,
        isLate: true,
        user: {
          select: {
            name: true,
            email: true,
            candidateId: true,
            institution: true,
          },
        },
        task: {
          select: {
            id: true,
            title: true,
            totalPoints: true,
            questions: {
              select: {
                id: true,
                questionNumber: true,
                prompt: true,
                type: true,
                points: true,
              },
            },
            rubrics: {
              select: {
                id: true,
                name: true,
                maxPoints: true,
                weightPercentage: true,
              },
            },
          },
        },
        answers: {
          select: {
            id: true,
            questionId: true,
            selectedOption: true,
            writtenText: true,
            wordCount: true,
            fileName: true,
            fileKey: true,
            score: true,
            isCorrect: true,
          },
        },
        evaluations: {
          select: {
            rubricId: true,
            scoreAwarded: true,
            comments: true,
          },
        },
      },
      orderBy: { submittedAt: "desc" },
    });

    // Group submissions by candidate (userId) so 1 candidate has 1 entry
    const candidateMap = new Map<string, typeof submissions>();
    for (const sub of submissions) {
      if (!candidateMap.has(sub.userId)) {
        candidateMap.set(sub.userId, []);
      }
      candidateMap.get(sub.userId)!.push(sub);
    }

    const mappedSubmissions: AdminSubmissionDetail[] = [];

    for (const [, userSubs] of candidateMap.entries()) {
      const primary = userSubs[0];
      let totalAuto = 0;
      let totalManual = 0;
      let totalFinal = 0;
      let totalPoints = 0;
      let hasGradingInProgress = false;
      let allGraded = true;
      let latestSubmittedAt: Date | null = null;
      let overallFeedback: string | null = null;
      const questionsFeedbackMap: Record<string, string> = {};

      const allAnswers: AdminSubmissionDetail["answers"] = [];
      const allEvaluations: AdminSubmissionDetail["evaluations"] = [];

      for (const sub of userSubs) {
        const requiresManualGrading =
          (sub.task?.questions || []).some((q) => q.type === "WRITTEN" || q.type === "FILE_UPLOAD") ||
          (sub.task?.rubrics || []).length > 0;

        if (sub.status === "GRADING_IN_PROGRESS") {
          hasGradingInProgress = true;
          allGraded = false;
        } else if (requiresManualGrading) {
          if (sub.status !== "GRADED" && sub.status !== "PUBLISHED") {
            allGraded = false;
          }
        } else {
          if (sub.status !== "GRADED" && sub.status !== "PUBLISHED" && sub.status !== "SUBMITTED") {
            allGraded = false;
          }
        }

        if (sub.autoGradeScore !== null) totalAuto += Number(sub.autoGradeScore);
        if (sub.manualGradeScore !== null) totalManual += Number(sub.manualGradeScore);
        if (sub.finalScore !== null) totalFinal += Number(sub.finalScore);
        totalPoints += sub.task.totalPoints;

        if (sub.submittedAt && (!latestSubmittedAt || sub.submittedAt > latestSubmittedAt)) {
          latestSubmittedAt = sub.submittedAt;
        }

        if (sub.feedbackSummary) {
          try {
            const parsed = JSON.parse(sub.feedbackSummary);
            if (parsed && typeof parsed === "object") {
              if (parsed.overall && !overallFeedback) overallFeedback = parsed.overall;
              if (parsed.questions) Object.assign(questionsFeedbackMap, parsed.questions);
            }
          } catch {
            if (!overallFeedback) overallFeedback = sub.feedbackSummary;
          }
        }

        const questionsMap = new Map((sub.task?.questions || []).map((q) => [q.id, q]));
        for (const ans of sub.answers) {
          const q = questionsMap.get(ans.questionId);
          allAnswers.push({
            id: ans.id,
            questionId: ans.questionId,
            questionNumber: q?.questionNumber ?? 1,
            questionPrompt: q?.prompt ?? "",
            questionType: q?.type ?? "MCQ",
            points: q?.points ?? 1,
            selectedOption: ans.selectedOption,
            writtenText: ans.writtenText,
            wordCount: ans.wordCount,
            fileName: ans.fileName,
            fileKey: ans.fileKey,
            score: ans.score !== null ? Number(ans.score) : null,
            isCorrect: ans.isCorrect,
            feedback: questionsFeedbackMap[ans.questionId] || null,
            taskTitle: sub.task.title,
          });
        }

        for (const r of sub.task.rubrics) {
          const ev = sub.evaluations.find((e) => e.rubricId === r.id);
          allEvaluations.push({
            rubricId: r.id,
            rubricName: r.name,
            maxPoints: Number(r.maxPoints),
            weightPercentage: Number(r.weightPercentage),
            scoreAwarded: ev ? Number(ev.scoreAwarded) : 0,
            comments: ev?.comments || null,
            taskTitle: sub.task.title,
          });
        }
      }

      const attemptStatus = hasGradingInProgress
        ? "GRADING_IN_PROGRESS"
        : allGraded && userSubs.length > 0
        ? "GRADED"
        : "SUBMITTED";

      mappedSubmissions.push({
        id: primary.id,
        contestId: primary.contestId,
        contestTitle: primary.contest?.title || selectedContest?.title || "Contest",
        taskId: primary.taskId,
        taskTitle: userSubs.length > 1 ? `${userSubs.length} Assessment Modules` : primary.task.title,
        taskPoints: totalPoints,
        userId: primary.userId,
        candidateName: primary.user.name,
        candidateEmail: primary.user.email,
        candidateId: primary.user.candidateId || `ACI-${primary.userId.substring(0, 4).toUpperCase()}`,
        institution: primary.user.institution || "National Campus Cluster",
        status: attemptStatus,
        submittedAt: latestSubmittedAt ? latestSubmittedAt.toISOString() : null,
        autoGradeScore: totalAuto,
        manualGradeScore: totalManual,
        finalScore: totalFinal,
        isLate: userSubs.some((s) => s.isLate),
        overallFeedback,
        answers: allAnswers,
        evaluations: allEvaluations,
        unitSubmissions: userSubs.map((sub) => ({
          id: sub.id,
          taskId: sub.taskId,
          taskTitle: sub.task.title,
          phaseTitle: sub.phase?.title,
          status: sub.status,
          submittedAt: sub.submittedAt ? sub.submittedAt.toISOString() : null,
          autoGradeScore: sub.autoGradeScore !== null ? Number(sub.autoGradeScore) : null,
          manualGradeScore: sub.manualGradeScore !== null ? Number(sub.manualGradeScore) : null,
          finalScore: sub.finalScore !== null ? Number(sub.finalScore) : null,
        })),
      });
    }

    const totalSubmissions = mappedSubmissions.length;
    const inReview = mappedSubmissions.filter((s) => s.status === "SUBMITTED" || s.status === "GRADING_IN_PROGRESS").length;
    const graded = mappedSubmissions.filter((s) => s.status === "GRADED" || s.status === "PUBLISHED").length;
    const scores = mappedSubmissions
      .filter((s) => s.finalScore !== null)
      .map((s) => s.finalScore as number);
    const averageScore = scores.length > 0
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
      : 0;

    return {
      contests,
      selectedContestId: isAll ? "ALL" : (selectedContest?.id || ""),
      contestTitle: isAll ? "All Contests (Global Scope)" : (selectedContest?.title || "Contest Submissions"),
      metrics: { totalSubmissions, inReview, graded, averageScore },
      submissions: mappedSubmissions,
    };
  } catch (error) {
    console.error("Error loading admin submissions:", error);
    return {
      contests: [],
      selectedContestId: "",
      contestTitle: "Error Loading Submissions",
      metrics: { totalSubmissions: 0, inReview: 0, graded: 0, averageScore: 0 },
      submissions: [],
    };
  }
}

export const getAdminSubmissionsAction = getAdminSubmissionsList;

export interface ResetSubmissionInput {
  submissionId: string;
  reason?: string;
  clearDraftAnswers?: boolean;
}

/**
 * Resets a submitted assessment back to DRAFT so the participant can attempt it again.
 * - Reverts Submission status to DRAFT
 * - Clears submittedAt, autoGradeScore, manualGradeScore, finalScore, and isLate
 * - If clearDraftAnswers is false (default), preserves saved answer text while clearing scores
 * - If clearDraftAnswers is true, erases draft answers for a blank slate
 * - Removes stale CohortResult from leaderboard
 * - Deletes associated rubric evaluation scores
 * - Logs an immutable AuditLog entry
 */
export async function resetParticipantSubmissionAction(
  input: ResetSubmissionInput
): Promise<{
  success: boolean;
  error?: string;
  submission?: { id: string; status: string };
}> {
  try {
    const session = await requireRole(["ADMIN"]);

    if (!input || !input.submissionId) {
      return { success: false, error: "Submission ID is required for reset." };
    }

    const submission = await prisma.submission.findUnique({
      where: { id: input.submissionId },
      include: {
        user: {
          select: { id: true, name: true, email: true, candidateId: true },
        },
        contest: true,
        task: true,
        phase: true,
      },
    });

    if (!submission) {
      return { success: false, error: "Target submission record not found." };
    }

    if (submission.status === "DRAFT") {
      return {
        success: false,
        error: "This assessment attempt is already in DRAFT state.",
      };
    }

    // Atomic Database Transaction for complete all-or-nothing reset with row-level locking
    let lastError: unknown;
    for (let attemptNum = 1; attemptNum <= 3; attemptNum++) {
      try {
        await prisma.$transaction(async (tx) => {
          // 1. Consistent Row-Level Locking Order:
          // A. Lock Parent PhaseAttempt row first
          const lockedAttempts = await tx.$queryRaw<Array<{
            id: string;
            status: string;
            startedAt: Date;
            expiresAt: Date | null;
          }>>`
            SELECT "id", "status", "startedAt", "expiresAt"
            FROM "PhaseAttempt"
            WHERE "phaseId" = ${submission.phaseId} AND "userId" = ${submission.userId}
            FOR UPDATE
          `;

          // B. Lock Child Submission row second
          const lockedSubmissions = await tx.$queryRaw<Array<{ id: string; status: string }>>`
            SELECT "id", "status"
            FROM "Submission"
            WHERE "id" = ${submission.id}
            FOR UPDATE
          `;

          if (!lockedSubmissions || lockedSubmissions.length === 0) {
            throw new Error("Target submission record not found.");
          }

          if (lockedSubmissions[0].status === "DRAFT") {
            throw new Error("This assessment attempt is already in DRAFT state.");
          }

          // 2. Validate PhaseAttempt state and boundaries if PhaseAttempt exists
          if (lockedAttempts && lockedAttempts.length > 0) {
            const attempt = lockedAttempts[0];
            const nowMs = Date.now();
            const phaseDeadlineMs = new Date(submission.phase.deadline).getTime();
            const contestEndMs = new Date(submission.contest.endDate).getTime();
            const storedExpiryMs = attempt.expiresAt ? new Date(attempt.expiresAt).getTime() : phaseDeadlineMs;
            const effectiveDeadlineMs = Math.min(storedExpiryMs, phaseDeadlineMs, contestEndMs);

            // If effective deadline has passed or status is EXPIRED, block reset until Admin Phase Extension
            if (nowMs >= effectiveDeadlineMs || attempt.status === "EXPIRED") {
              throw new Error(
                `Cannot reset submission: The participant's Phase deadline expired at ${new Date(effectiveDeadlineMs).toISOString()}. An authorized Admin Phase Extension must be performed first to establish a valid future deadline.`
              );
            }

            // If COMPLETED with future deadline, transition back to IN_PROGRESS
            if (attempt.status === "COMPLETED") {
              await tx.phaseAttempt.update({
                where: { id: attempt.id },
                data: {
                  status: "IN_PROGRESS",
                  completedAt: null,
                },
              });
            }
            // If IN_PROGRESS with future deadline, PhaseAttempt.expiresAt is strictly preserved (never silently extended)
          }

          // 3. Remove existing evaluator rubric scores
          await tx.evaluationScore.deleteMany({
            where: { submissionId: submission.id },
          });

          // 4. Handle answers: preserve participant text/selections while clearing scored indicators
          if (input.clearDraftAnswers) {
            await tx.submissionAnswer.deleteMany({
              where: { submissionId: submission.id },
            });
          } else {
            const existingAnswers = await tx.submissionAnswer.findMany({
              where: { submissionId: submission.id },
            });

            await tx.submissionAnswer.deleteMany({
              where: { submissionId: submission.id },
            });

            if (existingAnswers.length > 0) {
              await tx.submissionAnswer.createMany({
                data: existingAnswers.map((ans) => ({
                  id: ans.id,
                  submissionId: ans.submissionId,
                  questionId: ans.questionId,
                  selectedOption: ans.selectedOption,
                  writtenText: ans.writtenText,
                  wordCount: ans.wordCount,
                  fileKey: ans.fileKey,
                  fileName: ans.fileName,
                  fileSizeBytes: ans.fileSizeBytes,
                  fileSha256: ans.fileSha256,
                  score: null,
                  isCorrect: null,
                })),
              });
            }
          }

          // 5. Reset the submission record back to DRAFT state with fresh task attempt timer
          await tx.submission.update({
            where: { id: submission.id },
            data: {
              status: "DRAFT",
              submittedAt: null,
              autoGradeScore: null,
              manualGradeScore: null,
              finalScore: null,
              isLate: false,
              feedbackSummary: null,
              autoSavedAt: new Date(),
              startedAt: null, // Cleared so task timer starts afresh upon re-entry
              expiresAt: null, // Capped by phaseAttempt.expiresAt when candidate re-enters
            },
          });

          // 6. Invalidate stale certified/published leaderboard entry for this participant in this contest
          await tx.cohortResult.deleteMany({
            where: {
              contestId: submission.contestId,
              userId: submission.userId,
            },
          });

          // 7. Write persistent administrative AuditLog entry
          await tx.auditLog.create({
            data: {
              id: crypto.randomUUID(),
              actorId: session.userId,
              action: "SUBMISSION_RESET",
              targetType: "SUBMISSION",
              targetId: submission.id,
              metadata: {
                adminEmail: session.email,
                participantId: submission.userId,
                participantEmail: submission.user?.email,
                participantName: submission.user?.name,
                candidateId: submission.user?.candidateId,
                contestId: submission.contestId,
                contestTitle: submission.contest?.title,
                phaseId: submission.phaseId,
                phaseTitle: submission.phase?.title,
                taskId: submission.taskId,
                taskTitle: submission.task?.title,
                reason: input.reason?.trim() || "Administrative submission reset",
                clearDraftAnswers: Boolean(input.clearDraftAnswers),
                previousStatus: submission.status,
                previousSubmittedAt: submission.submittedAt ? submission.submittedAt.toISOString() : null,
                previousScores: {
                  autoGradeScore: submission.autoGradeScore,
                  manualGradeScore: submission.manualGradeScore,
                  finalScore: submission.finalScore,
                },
                resetAt: new Date().toISOString(),
              },
            },
          });
        }, { timeout: 10000 });

        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        const errMsg = err instanceof Error ? err.message : String(err);
        if (
          errMsg.includes("expired") ||
          errMsg.includes("already in DRAFT") ||
          errMsg.includes("not found")
        ) {
          return { success: false, error: errMsg };
        }
        if (attemptNum < 3) {
          await new Promise((resolve) => setTimeout(resolve, 100 * Math.pow(2, attemptNum)));
        }
      }
    }

    if (lastError) {
      return {
        success: false,
        error: lastError instanceof Error ? lastError.message : "Failed to reset submission.",
      };
    }

    safeRevalidatePath("/admin/submissions");
    safeRevalidatePath("/dashboard/leaderboard");
    safeRevalidatePath(`/assessment/${submission.contestId}/${submission.phaseId}/${submission.taskId}`);
    safeRevalidatePath(`/dashboard/contests/${submission.contestId}`);

    return {
      success: true,
      submission: {
        id: submission.id,
        status: "DRAFT",
      },
    };
  } catch (error) {
    console.error("Error resetting participant submission:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to reset submission attempt.",
    };
  }
}
