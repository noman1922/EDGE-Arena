"use server";

import { prisma } from "@/lib/prisma";
import { ContestStatus } from "@prisma/client";
import {
  calculateWeightedRubricScore,
  checkUserPermission,
  type RubricScoreInput,
} from "@/lib/scoring";
import {
  isContestActive,
  isContestConcluded,
  normalizeContestStatus,
  formatContestStatusForUi,
} from "@/lib/contest-lifecycle";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Runner environment fallback
  }
}

export interface SubmissionToGrade {
  id: string;
  contestId: string;
  contestTitle: string;
  contestIsPublished: boolean;
  phaseId: string;
  phaseTitle: string;
  taskId: string;
  taskTitle: string;
  taskPoints: number;
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
    questionId: string;
    questionPrompt: string;
    questionType: string;
    questionPoints: number;
    selectedOption: string | null;
    writtenText: string | null;
    wordCount: number | null;
    fileName: string | null;
    fileKey: string | null;
  }>;
  rubrics: Array<{
    id: string;
    name: string;
    description: string | null;
    weightPercentage: number;
    maxPoints: number;
    currentScoreAwarded?: number;
    currentComments?: string;
  }>;
}

export interface EvaluatorContestItem {
  id: string;
  slug: string;
  title: string;
  track: string;
  status: ContestStatus;
  uiStatus: "Live" | "Draft" | "Completed" | "Archived";
  isActive: boolean;
  isConcluded: boolean;
  startDateIso: string;
  endDateIso: string;
}

export interface EvaluatorDashboardData {
  activeContestsCount: number;
  totalSubmissionsCount: number;
  pendingCount: number;
  gradedCount: number;
  assignedContests: EvaluatorContestItem[];
  submissions: SubmissionToGrade[];
}

export async function getEvaluatorDashboardDataAction(
  selectedContestId?: string
): Promise<EvaluatorDashboardData> {
  try {
    const session = await requireRole(["EVALUATOR", "ADMIN"]);
    const now = new Date();

    // 1. Resolve user to check explicit cohort / participant assignments
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: {
        participants: { select: { contestId: true } },
      },
    });

    const explicitlyAssignedContestIds = new Set(user?.participants.map((p) => p.contestId) || []);

    // 2. Fetch accessible contests for this evaluator (not DRAFT)
    let contests = await prisma.contest.findMany({
      where: {
        status: { not: ContestStatus.DRAFT },
      },
      select: {
        id: true,
        slug: true,
        title: true,
        track: true,
        status: true,
        cohortId: true,
        startDate: true,
        endDate: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // If evaluator has explicit cohort or participant assignments, filter to assigned
    if (user?.cohortId || explicitlyAssignedContestIds.size > 0) {
      contests = contests.filter(
        (c) =>
          (user?.cohortId && c.cohortId === user.cohortId) ||
          explicitlyAssignedContestIds.has(c.id)
      );
    }

    const assignedContests: EvaluatorContestItem[] = contests.map((c) => {
      const active = isContestActive(c, now);
      const concluded = isContestConcluded(c, now);
      let uiStatus = formatContestStatusForUi(c.status);
      if (normalizeContestStatus(c.status) === ContestStatus.LIVE && concluded) {
        uiStatus = "Completed";
      }

      return {
        id: c.id,
        slug: c.slug,
        title: c.title,
        track: c.track,
        status: normalizeContestStatus(c.status),
        uiStatus,
        isActive: active,
        isConcluded: concluded,
        startDateIso: c.startDate.toISOString(),
        endDateIso: c.endDate.toISOString(),
      };
    });

    const activeContestsCount = assignedContests.filter((c) => c.isActive).length;

    // 3. Submissions for grading (optionally scoped to selectedContestId)
    const submissions = await getSubmissionsForGrading(selectedContestId);
    const pendingCount = submissions.filter((s) => s.status === "SUBMITTED").length;
    const gradedCount = submissions.filter((s) => s.status === "GRADED").length;

    return {
      activeContestsCount,
      totalSubmissionsCount: submissions.length,
      pendingCount,
      gradedCount,
      assignedContests,
      submissions,
    };
  } catch (error) {
    console.error("Error loading evaluator dashboard data:", error);
    return {
      activeContestsCount: 0,
      totalSubmissionsCount: 0,
      pendingCount: 0,
      gradedCount: 0,
      assignedContests: [],
      submissions: [],
    };
  }
}

export async function getSubmissionsForGrading(
  contestId?: string
): Promise<SubmissionToGrade[]> {
  try {
    await requireRole(["EVALUATOR", "ADMIN"]);

    const submissions = await prisma.submission.findMany({
      where: {
        ...(contestId ? { contestId } : {}),
        status: { in: ["SUBMITTED", "GRADING_IN_PROGRESS", "GRADED"] },
      },
      select: {
        id: true,
        contestId: true,
        phaseId: true,
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
            id: true,
            name: true,
            email: true,
            candidateId: true,
            institution: true,
          },
        },
        contest: {
          select: {
            title: true,
            isPublished: true,
          },
        },
        phase: {
          select: {
            title: true,
            phaseNumber: true,
          },
        },
        task: {
          select: {
            title: true,
            totalPoints: true,
            rubrics: {
              select: {
                id: true,
                name: true,
                description: true,
                weightPercentage: true,
                maxPoints: true,
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
            rubricId: true,
            scoreAwarded: true,
            comments: true,
          },
        },
      },
      orderBy: { submittedAt: "desc" },
      take: 100,
    });

    return submissions.map((sub) => {
      // Map rubrics with existing evaluation scores (if any)
      const rubrics = sub.task.rubrics.map((r) => {
        const evalRecord = sub.evaluations.find((e) => e.rubricId === r.id);
        return {
          id: r.id,
          name: r.name,
          description: r.description,
          weightPercentage: Number(r.weightPercentage),
          maxPoints: Number(r.maxPoints),
          currentScoreAwarded: evalRecord ? Number(evalRecord.scoreAwarded) : undefined,
          currentComments: evalRecord?.comments || undefined,
        };
      });

      // Strict security: Keep QuestionAnswerKey isolated from client responses
      const answers = sub.answers.map((a) => ({
        id: a.id,
        questionId: a.questionId,
        questionPrompt: a.question.prompt,
        questionType: a.question.type,
        questionPoints: a.question.points,
        selectedOption: a.selectedOption,
        writtenText: a.writtenText,
        wordCount: a.wordCount,
        fileName: a.fileName,
        fileKey: a.fileKey,
      }));

      return {
        id: sub.id,
        contestId: sub.contestId,
        contestTitle: sub.contest.title,
        contestIsPublished: sub.contest.isPublished,
        phaseId: sub.phaseId,
        phaseTitle: `Phase ${sub.phase.phaseNumber}: ${sub.phase.title}`,
        taskId: sub.taskId,
        taskTitle: sub.task.title,
        taskPoints: sub.task.totalPoints,
        userId: sub.userId,
        candidateName: sub.user.name,
        candidateEmail: sub.user.email,
        candidateId: sub.user.candidateId || "CAND-01",
        institution: sub.user.institution || "National Campus Cluster",
        status: sub.status,
        submittedAt: sub.submittedAt ? sub.submittedAt.toISOString() : null,
        autoGradeScore: sub.autoGradeScore ? Number(sub.autoGradeScore) : null,
        manualGradeScore: sub.manualGradeScore ? Number(sub.manualGradeScore) : null,
        finalScore: sub.finalScore ? Number(sub.finalScore) : null,
        isLate: sub.isLate,
        answers,
        rubrics,
      };
    });
  } catch (error) {
    console.error("Error fetching submissions for grading:", error);
    return [];
  }
}

export interface SaveRubricScoreInput {
  submissionId: string;
  evaluatorEmail?: string;
  scores: Array<{
    rubricId: string;
    scoreAwarded: number;
    comments?: string;
  }>;
}

export async function saveRubricScoreAction(input: SaveRubricScoreInput) {
  try {
    const session = await requireRole(["EVALUATOR", "ADMIN"]);
    const evaluatorEmail = session.email;

    // 1. Resolve evaluator
    let evaluator = await prisma.user.findUnique({
      where: { email: evaluatorEmail },
    });

    if (!evaluator) {
      evaluator = await prisma.user.create({
        data: {
          id: crypto.randomUUID(),
          email: evaluatorEmail,
          name: "Academic Evaluator Panel",
          role: "EVALUATOR",
        },
      });
    }

    // 2. Permission check: EVALUATOR or ADMIN can grade
    if (!checkUserPermission(evaluator.role, "GRADE_SUBMISSION")) {
      return { success: false, error: "Unauthorized: only evaluators or admins can score submissions." };
    }

    // 3. Find submission with related task and rubrics
    const submission = await prisma.submission.findUnique({
      where: { id: input.submissionId },
      include: {
        task: {
          include: {
            rubrics: true,
          },
        },
      },
    });

    if (!submission) {
      return { success: false, error: "Submission not found." };
    }

    // 4. Save/upsert individual EvaluationScore records
    for (const item of input.scores) {
      const rubric = submission.task.rubrics.find((r) => r.id === item.rubricId);
      if (!rubric) continue;

      const maxPts = Number(rubric.maxPoints);
      const boundedScore = Math.max(0, Math.min(item.scoreAwarded, maxPts));

      await prisma.evaluationScore.upsert({
        where: {
          submissionId_rubricId_evaluatorId: {
            submissionId: input.submissionId,
            rubricId: item.rubricId,
            evaluatorId: evaluator.id,
          },
        },
        update: {
          scoreAwarded: boundedScore,
          comments: item.comments?.trim() || null,
          updatedAt: new Date(),
        },
        create: {
          submissionId: input.submissionId,
          rubricId: item.rubricId,
          evaluatorId: evaluator.id,
          scoreAwarded: boundedScore,
          comments: item.comments?.trim() || null,
        },
      });
    }

    // 5. Server-side weighted rubric calculation
    const allEvaluations = await prisma.evaluationScore.findMany({
      where: {
        submissionId: input.submissionId,
        evaluatorId: evaluator.id,
      },
      include: {
        rubric: true,
      },
    });

    const rubricInputs: RubricScoreInput[] = allEvaluations.map((e) => ({
      rubricId: e.rubricId,
      name: e.rubric.name,
      weightPercentage: Number(e.rubric.weightPercentage),
      maxPoints: Number(e.rubric.maxPoints),
      scoreAwarded: Number(e.scoreAwarded),
    }));

    const rubricResult = calculateWeightedRubricScore(rubricInputs);
    const manualGradeScore = rubricResult.weightedScore;

    // Final score = autoGradeScore (MCQ) + manualGradeScore (Written/Rubrics)
    const autoScore = submission.autoGradeScore ? Number(submission.autoGradeScore) : 0;
    const finalScore = Math.min(submission.task.totalPoints, autoScore + manualGradeScore);

    // Update Submission record
    const updated = await prisma.submission.update({
      where: { id: input.submissionId },
      data: {
        manualGradeScore,
        finalScore,
        status: "GRADED",
      },
    });

    safeRevalidatePath("/admin");
    safeRevalidatePath("/admin/contests");
    safeRevalidatePath("/admin/submissions");
    safeRevalidatePath("/evaluator");
    safeRevalidatePath("/evaluator/monitoring");
    safeRevalidatePath("/dashboard");

    return {
      success: true,
      manualGradeScore,
      finalScore,
      status: updated.status,
    };
  } catch (error) {
    console.error("Error saving rubric scores:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to save rubric scores" };
  }
}

export async function publishContestResultsAction(
  contestId: string
) {
  try {
    const session = await requireRole(["ADMIN"]);
    const requesterEmail = session.email;

    // 1. Resolve requester and check ADMIN permission
    const requester = await prisma.user.findUnique({
      where: { email: requesterEmail },
    });

    if (!requester || !checkUserPermission(requester.role, "PUBLISH_RESULTS")) {
      return {
        success: false,
        error: "Unauthorized: Only platform administrators can publish contest results and official rankings.",
      };
    }

    // 2. Fetch all graded submissions for this contest
    const submissions = await prisma.submission.findMany({
      where: {
        contestId,
        status: "GRADED",
      },
      orderBy: { finalScore: "desc" },
    });

    if (submissions.length === 0) {
      return {
        success: false,
        error: "Cannot publish: No graded submissions found for this contest.",
      };
    }

    // 3. Compute ranks and percentiles server-side
    const totalSubmissions = submissions.length;
    const now = new Date();

    for (let index = 0; index < totalSubmissions; index++) {
      const sub = submissions[index];
      const rank = index + 1;
      const percentile = totalSubmissions > 1
        ? Math.round(((totalSubmissions - rank) / (totalSubmissions - 1)) * 100 * 100) / 100
        : 100.0;

      await prisma.cohortResult.upsert({
        where: {
          contestId_userId: {
            contestId,
            userId: sub.userId,
          },
        },
        update: {
          totalScore: sub.finalScore ?? 0,
          rank,
          percentile,
          isCertified: true,
          publishedAt: now,
          updatedAt: now,
        },
        create: {
          contestId,
          userId: sub.userId,
          totalScore: sub.finalScore ?? 0,
          rank,
          percentile,
          isCertified: true,
          publishedAt: now,
        },
      });
    }

    // 4. Update Contest status to published
    await prisma.contest.update({
      where: { id: contestId },
      data: {
        isPublished: true,
        status: "COMPLETED",
      },
    });

    safeRevalidatePath("/admin");
    safeRevalidatePath("/admin/contests");
    safeRevalidatePath("/admin/results");
    safeRevalidatePath("/evaluator");
    safeRevalidatePath("/evaluator/monitoring");
    safeRevalidatePath("/dashboard");
    safeRevalidatePath("/dashboard/results");
    safeRevalidatePath("/leaderboard");

    return {
      success: true,
      publishedCount: totalSubmissions,
      isPublished: true,
    };
  } catch (error) {
    console.error("Error publishing contest results:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to publish contest results" };
  }
}
