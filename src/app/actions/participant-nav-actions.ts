"use server";

import { prisma } from "@/lib/prisma";
import { ContestStatus, PhaseStatus } from "@prisma/client";
import { requireRole } from "@/lib/auth";

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

      // Disallow drafts or contests before start time
      if (c.status === ContestStatus.DRAFT) {
        continue;
      }

      const activePhase = c.phases.find((p) => p.status === PhaseStatus.OPEN) || c.phases[0];
      const stageTitle = activePhase ? `Phase ${activePhase.phaseNumber}: ${activePhase.title}` : "Diagnostic Stage";
      const deadline = activePhase ? activePhase.deadline : c.endDate;

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

      const isLiveTime = now >= c.startDate && now <= c.endDate;
      const isEnded = now > c.endDate || c.status === ContestStatus.COMPLETED || c.status === ContestStatus.ARCHIVED;

      let lifecycleState: "LIVE" | "UPCOMING" | "COMPLETED" = "UPCOMING";
      if (isEnded) lifecycleState = "COMPLETED";
      else if (isLiveTime && c.status === ContestStatus.LIVE) lifecycleState = "LIVE";

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
        deadlineIso: deadline.toISOString(),
        deadlineFormatted: deadline.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Asia/Dhaka",
        }) + " BST",
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

    // If not certified/published yet: return clean provisional leaderboard with Candidate IDs
    let userRank: number | null = null;
    const rows: ParticipantLeaderboardRow[] = contest.submissions.map((sub, index) => {
      const isCurrent = sub.userId === session.userId;
      const rank = index + 1;
      if (isCurrent) userRank = rank;

      return {
        candidateId: isCurrent
          ? `${sub.user.candidateId || "YOU"} (You)`
          : sub.user.candidateId || `ACI-CAND-${sub.userId.slice(0, 4).toUpperCase()}`,
        rank,
        finalScore: Number(sub.finalScore ?? 0),
        isCurrentUser: isCurrent,
        isCertified: false,
      };
    });

    return {
      contestTitle: contest.title,
      isPublished: contest.isPublished,
      currentUserRank: userRank,
      rows,
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

export interface ParticipantScorecardData {
  contestTitle: string;
  track: string;
  isPublished: boolean;
  submissionStatus: string;
  submittedAt: string | null;
  totalScore: number;
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
}

export async function getParticipantScorecard(
  contestId?: string
): Promise<ParticipantScorecardData | null> {
  try {
    const session = await requireRole(["PARTICIPANT"]);

    // Find latest submission for this user
    const submission = await prisma.submission.findFirst({
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
        task: {
          include: {
            rubrics: true,
          },
        },
        evaluations: true,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!submission) {
      return null;
    }

    const contest = submission.contest;
    const cohortResult = contest.results[0];
    const isPublished = contest.isPublished;

    // Strict security: if contest results are not published, do not expose scores
    if (!isPublished) {
      return {
        contestTitle: contest.title,
        track: contest.track,
        isPublished: false,
        submissionStatus: submission.status,
        submittedAt: submission.submittedAt?.toISOString() || null,
        totalScore: 0,
        rank: null,
        percentile: null,
        isCertified: false,
        rubrics: [],
      };
    }

    // Map rubrics with awarded scores and qualitative comments
    const rubrics = submission.task.rubrics.map((r) => {
      const evaluation = submission.evaluations.find((e) => e.rubricId === r.id);
      return {
        name: r.name,
        weight: Number(r.weightPercentage),
        maxPoints: Number(r.maxPoints),
        scoreAwarded: evaluation ? Number(evaluation.scoreAwarded) : 0,
        comments: evaluation?.comments || null,
      };
    });

    return {
      contestTitle: contest.title,
      track: contest.track,
      isPublished: true,
      submissionStatus: submission.status,
      submittedAt: submission.submittedAt?.toISOString() || null,
      totalScore: Number(submission.finalScore ?? 0),
      rank: cohortResult?.rank || null,
      percentile: cohortResult ? Number(cohortResult.percentile) : null,
      isCertified: cohortResult?.isCertified || false,
      rubrics,
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
