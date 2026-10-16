"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";

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
  finalScore: number;
  rank: number;
  percentile: number;
  isCertified: boolean;
  publishedAt: string | null;
}

export interface AdminResultsOverview {
  contestId: string;
  contestTitle: string;
  contestTrack: string;
  isPublished: boolean;
  totalEnrolled: number;
  totalSubmissions: number;
  gradedCount: number;
  rows: AdminLeaderboardRow[];
}

export async function getAdminLeaderboardAndResults(
  contestId?: string
): Promise<{ contests: Array<{ id: string; title: string }>; current: AdminResultsOverview | null }> {
  try {
    await requireRole(["ADMIN"]);

    const contests = await prisma.contest.findMany({
      select: { id: true, title: true },
      orderBy: { createdAt: "desc" },
    });

    if (contests.length === 0) {
      return { contests: [], current: null };
    }

    const selectedContestId = contestId || contests[0].id;
    const contest = await prisma.contest.findUnique({
      where: { id: selectedContestId },
      select: {
        id: true,
        title: true,
        track: true,
        isPublished: true,
        participants: {
          select: {
            id: true,
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
            rank: true,
            percentile: true,
            isCertified: true,
            publishedAt: true,
          },
        },
      },
    });

    if (!contest) {
      return { contests, current: null };
    }

    // Build rows from submissions and participants
    const totalEnrolled = contest.participants.length;
    const totalSubmissions = contest.submissions.filter((s) => s.status !== "DRAFT").length;
    const gradedCount = contest.submissions.filter((s) => s.status === "GRADED" || s.status === "PUBLISHED").length;

    // Sort submissions by finalScore DESC, submittedAt ASC for tie-breaking
    const sortedSubmissions = [...contest.submissions]
      .filter((s) => s.status !== "DRAFT")
      .sort((a, b) => {
        const scoreA = Number(a.finalScore ?? a.autoGradeScore ?? 0);
        const scoreB = Number(b.finalScore ?? b.autoGradeScore ?? 0);
        if (scoreB !== scoreA) return scoreB - scoreA;
        return (a.submittedAt?.getTime() ?? 0) - (b.submittedAt?.getTime() ?? 0);
      });

    const rows: AdminLeaderboardRow[] = sortedSubmissions.map((sub, index) => {
      const cohortRes = contest.results.find((r) => r.userId === sub.userId);
      const provisionalRank = index + 1;
      const rank = cohortRes ? cohortRes.rank : provisionalRank;
      const percentile = cohortRes
        ? Number(cohortRes.percentile)
        : totalSubmissions > 1
        ? Math.round(((totalSubmissions - provisionalRank) / (totalSubmissions - 1)) * 100 * 10) / 10
        : 100.0;

      return {
        userId: sub.userId,
        candidateName: sub.user.name,
        candidateEmail: sub.user.email,
        candidateId: sub.user.candidateId || `ACI-${sub.userId.substring(0, 4).toUpperCase()}`,
        institution: sub.user.institution || "National Campus Cluster",
        submissionId: sub.id,
        submissionStatus: sub.status,
        submittedAt: sub.submittedAt ? sub.submittedAt.toISOString() : null,
        autoGradeScore: sub.autoGradeScore ? Number(sub.autoGradeScore) : null,
        manualGradeScore: sub.manualGradeScore ? Number(sub.manualGradeScore) : null,
        finalScore: Number(sub.finalScore ?? sub.autoGradeScore ?? 0),
        rank,
        percentile,
        isCertified: cohortRes ? cohortRes.isCertified : false,
        publishedAt: cohortRes?.publishedAt ? cohortRes.publishedAt.toISOString() : null,
      };
    });

    return {
      contests,
      current: {
        contestId: contest.id,
        contestTitle: contest.title,
        contestTrack: contest.track,
        isPublished: contest.isPublished,
        totalEnrolled,
        totalSubmissions,
        gradedCount,
        rows,
      },
    };
  } catch (error) {
    console.error("Error fetching leaderboard and results:", error);
    return { contests: [], current: null };
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
  answers: Array<{
    id: string;
    questionPrompt: string;
    questionType: string;
    selectedOption: string | null;
    writtenText: string | null;
    wordCount: number | null;
    fileName: string | null;
    fileKey: string | null;
    score: number | null;
  }>;
  evaluations: Array<{
    rubricName: string;
    maxPoints: number;
    weightPercentage: number;
    scoreAwarded: number;
    comments: string | null;
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

    const contests = await prisma.contest.findMany({
      select: { id: true, title: true },
      orderBy: { createdAt: "desc" },
    });

    if (contests.length === 0) {
      return {
        contests: [],
        selectedContestId: "",
        contestTitle: "No Contests Available",
        metrics: { totalSubmissions: 0, inReview: 0, graded: 0, averageScore: 0 },
        submissions: [],
      };
    }

    const activeContestId = contestId || contests[0].id;
    const selectedContest = contests.find((c) => c.id === activeContestId) || contests[0];

    const submissions = await prisma.submission.findMany({
      where: {
        contestId: activeContestId,
        status: { not: "DRAFT" },
      },
      select: {
        id: true,
        contestId: true,
        taskId: true,
        userId: true,
        status: true,
        submittedAt: true,
        autoGradeScore: true,
        manualGradeScore: true,
        finalScore: true,
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
            title: true,
            rubrics: {
              select: {
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
            question: {
              select: {
                prompt: true,
                type: true,
                points: true,
              },
            },
          },
        },
        evaluations: {
          select: {
            scoreAwarded: true,
            comments: true,
            rubric: {
              select: {
                name: true,
                maxPoints: true,
                weightPercentage: true,
              },
            },
          },
        },
      },
      orderBy: { submittedAt: "desc" },
      take: 100,
    });

    const mappedSubmissions: AdminSubmissionDetail[] = submissions.map((sub) => ({
      id: sub.id,
      contestId: sub.contestId,
      contestTitle: selectedContest.title,
      taskId: sub.taskId,
      taskTitle: sub.task.title,
      userId: sub.userId,
      candidateName: sub.user.name,
      candidateEmail: sub.user.email,
      candidateId: sub.user.candidateId || `ACI-${sub.userId.substring(0, 4).toUpperCase()}`,
      institution: sub.user.institution || "National Campus Cluster",
      status: sub.status,
      submittedAt: sub.submittedAt ? sub.submittedAt.toISOString() : null,
      autoGradeScore: sub.autoGradeScore ? Number(sub.autoGradeScore) : null,
      manualGradeScore: sub.manualGradeScore ? Number(sub.manualGradeScore) : null,
      finalScore: sub.finalScore !== null ? Number(sub.finalScore) : null,
      isLate: sub.isLate,
      answers: sub.answers.map((a) => ({
        id: a.id,
        questionPrompt: a.question.prompt,
        questionType: a.question.type,
        selectedOption: a.selectedOption,
        writtenText: a.writtenText,
        wordCount: a.wordCount,
        fileName: a.fileName,
        fileKey: a.fileKey,
        score: a.score ? Number(a.score) : null,
      })),
      evaluations: sub.evaluations.map((ev) => ({
        rubricName: ev.rubric.name,
        maxPoints: Number(ev.rubric.maxPoints),
        weightPercentage: Number(ev.rubric.weightPercentage),
        scoreAwarded: Number(ev.scoreAwarded),
        comments: ev.comments,
      })),
    }));

    const totalSubmissions = mappedSubmissions.length;
    const inReview = mappedSubmissions.filter((s) => s.status === "SUBMITTED" || s.status === "IN_REVIEW").length;
    const graded = mappedSubmissions.filter((s) => s.status === "GRADED" || s.status === "PUBLISHED").length;
    const scores = mappedSubmissions
      .filter((s) => s.finalScore !== null)
      .map((s) => s.finalScore as number);
    const averageScore = scores.length > 0
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
      : 0;

    return {
      contests,
      selectedContestId: activeContestId,
      contestTitle: selectedContest.title,
      metrics: {
        totalSubmissions,
        inReview,
        graded,
        averageScore,
      },
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
