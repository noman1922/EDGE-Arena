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
            totalScore: true,
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

    // Group submissions by candidate (userId)
    const candidateMap = new Map<string, typeof contest.submissions>();
    for (const sub of contest.submissions) {
      if (sub.status === "DRAFT") continue;
      if (!candidateMap.has(sub.userId)) {
        candidateMap.set(sub.userId, []);
      }
      candidateMap.get(sub.userId)!.push(sub);
    }

    const totalEnrolled = contest.participants.length;
    const totalCandidatesWithSubmissions = candidateMap.size;
    let gradedCandidateCount = 0;

    const candidateRows: Array<{
      userId: string;
      user: (typeof contest.submissions)[0]["user"];
      primarySubId: string;
      status: string;
      submittedAt: Date | null;
      autoGradeScore: number;
      manualGradeScore: number;
      finalScore: number;
    }> = [];

    for (const [userId, userSubs] of candidateMap.entries()) {
      const primary = userSubs[0];
      let autoSum = 0;
      let manualSum = 0;
      let finalSum = 0;
      let allGraded = true;
      let hasGradingInProgress = false;
      let latestSubmittedAt: Date | null = null;

      for (const s of userSubs) {
        if (s.status === "GRADING_IN_PROGRESS") {
          hasGradingInProgress = true;
          allGraded = false;
        } else if (s.status !== "GRADED" && s.status !== "PUBLISHED") {
          allGraded = false;
        }

        if (s.autoGradeScore !== null) autoSum += Number(s.autoGradeScore);
        if (s.manualGradeScore !== null) manualSum += Number(s.manualGradeScore);
        if (s.finalScore !== null) finalSum += Number(s.finalScore);

        if (s.submittedAt && (!latestSubmittedAt || s.submittedAt > latestSubmittedAt)) {
          latestSubmittedAt = s.submittedAt;
        }
      }

      const overallStatus = hasGradingInProgress
        ? "GRADING_IN_PROGRESS"
        : allGraded && userSubs.length > 0
        ? "GRADED"
        : "SUBMITTED";

      if (overallStatus === "GRADED") gradedCandidateCount++;

      candidateRows.push({
        userId,
        user: primary.user,
        primarySubId: primary.id,
        status: overallStatus,
        submittedAt: latestSubmittedAt,
        autoGradeScore: autoSum,
        manualGradeScore: manualSum,
        finalScore: finalSum,
      });
    }

    // Sort candidate attempts by finalScore DESC, submittedAt ASC for tie-breaking
    candidateRows.sort((a, b) => {
      const cohortA = contest.results.find((r) => r.userId === a.userId);
      const cohortB = contest.results.find((r) => r.userId === b.userId);
      const scoreA = cohortA ? Number(cohortA.totalScore) : a.finalScore;
      const scoreB = cohortB ? Number(cohortB.totalScore) : b.finalScore;

      if (scoreB !== scoreA) return scoreB - scoreA;
      return (a.submittedAt?.getTime() ?? 0) - (b.submittedAt?.getTime() ?? 0);
    });

    const rows: AdminLeaderboardRow[] = candidateRows.map((cand, index) => {
      const cohortRes = contest.results.find((r) => r.userId === cand.userId);
      const provisionalRank = index + 1;
      const rank = cohortRes ? cohortRes.rank : provisionalRank;
      const totalCount = totalCandidatesWithSubmissions;
      const percentile = cohortRes
        ? Number(cohortRes.percentile)
        : totalCount > 1
        ? Math.round(((totalCount - provisionalRank) / (totalCount - 1)) * 100 * 10) / 10
        : 100.0;
      const finalScore = cohortRes ? Number(cohortRes.totalScore) : cand.finalScore;

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
        finalScore,
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
        totalSubmissions: totalCandidatesWithSubmissions,
        gradedCount: gradedCandidateCount,
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
            question: {
              select: {
                id: true,
                questionNumber: true,
                prompt: true,
                type: true,
                points: true,
              },
            },
          },
        },
        evaluations: {
          select: {
            rubricId: true,
            scoreAwarded: true,
            comments: true,
            rubric: {
              select: {
                id: true,
                name: true,
                maxPoints: true,
                weightPercentage: true,
              },
            },
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
        if (sub.status === "GRADING_IN_PROGRESS") {
          hasGradingInProgress = true;
          allGraded = false;
        } else if (sub.status !== "GRADED" && sub.status !== "PUBLISHED") {
          allGraded = false;
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

        for (const ans of sub.answers) {
          allAnswers.push({
            id: ans.id,
            questionId: ans.questionId,
            questionNumber: ans.question.questionNumber,
            questionPrompt: ans.question.prompt,
            questionType: ans.question.type,
            points: ans.question.points,
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
        contestTitle: selectedContest.title,
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
      selectedContestId: selectedContest.id,
      contestTitle: selectedContest.title,
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
