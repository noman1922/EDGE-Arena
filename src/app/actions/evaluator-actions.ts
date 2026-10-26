"use server";

import { prisma } from "@/lib/prisma";
import { ContestStatus } from "@prisma/client";
import {
  calculateWeightedRubricScore,
  calculateMcqScore,
  checkUserPermission,
  type RubricScoreInput,
  type McqAnswerKey,
  type ParticipantMcqAnswer,
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
  feedbackSummary?: string | null;
  overallFeedback?: string | null;
  phases?: Array<{
    phaseId: string;
    phaseNumber: number;
    phaseTitle: string;
    tasks: Array<{
      taskId: string;
      taskNumber: number;
      taskTitle: string;
      taskPoints: number;
      submissionId: string;
      status: string;
      autoGradeScore: number | null;
      manualGradeScore: number | null;
      finalScore: number | null;
    }>;
  }>;
  answers: Array<{
    id: string;
    questionId: string;
    questionNumber: number;
    questionPrompt: string;
    questionInstructions?: string | null;
    questionType: string;
    questionPoints: number;
    selectedOption: string | null;
    writtenText: string | null;
    wordCount: number | null;
    minWords?: number | null;
    maxWords?: number | null;
    fileName: string | null;
    fileKey: string | null;
    fileSizeBytes?: number | null;
    score: number | null;
    isCorrect: boolean | null;
    feedback: string | null;
    taskTitle?: string;
    taskId?: string;
  }>;
  rubrics: Array<{
    id: string;
    name: string;
    description: string | null;
    weightPercentage: number;
    maxPoints: number;
    currentScoreAwarded?: number;
    currentComments?: string;
    taskTitle?: string;
    taskId?: string;
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
    const pendingCount = submissions.filter(
      (s) => s.status === "SUBMITTED" || s.status === "GRADING_IN_PROGRESS"
    ).length;
    const gradedCount = submissions.filter(
      (s) => s.status === "GRADED" || s.status === "PUBLISHED"
    ).length;

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

    // 1. Fetch all submissions matching contest filter and active grading states
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
        feedbackSummary: true,
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
            id: true,
            title: true,
            isPublished: true,
            phases: {
              select: {
                id: true,
                phaseNumber: true,
                title: true,
                tasks: {
                  select: {
                    id: true,
                    taskNumber: true,
                    title: true,
                    totalPoints: true,
                  },
                },
              },
              orderBy: { phaseNumber: "asc" },
            },
          },
        },
        phase: {
          select: {
            id: true,
            title: true,
            phaseNumber: true,
          },
        },
        task: {
          select: {
            id: true,
            title: true,
            taskNumber: true,
            totalPoints: true,
            questions: {
              select: {
                id: true,
                questionNumber: true,
                type: true,
                prompt: true,
                instructions: true,
                points: true,
                minWords: true,
                maxWords: true,
              },
              orderBy: { questionNumber: "asc" },
            },
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
            fileSizeBytes: true,
            score: true,
            isCorrect: true,
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
    });

    if (submissions.length === 0) {
      return [];
    }

    // 2. Group submissions by Candidate Contest Participation (contestId + userId)
    // One candidate participating in one contest produces exactly ONE review card.
    const candidateMap = new Map<string, typeof submissions>();
    for (const sub of submissions) {
      const key = `${sub.contestId}_${sub.userId}`;
      if (!candidateMap.has(key)) {
        candidateMap.set(key, []);
      }
      candidateMap.get(key)!.push(sub);
    }

    const candidateAttempts: SubmissionToGrade[] = [];

    for (const [, userSubs] of candidateMap.entries()) {
      const primarySub = userSubs[0];
      const contest = primarySub.contest;
      const user = primarySub.user;

      // Calculate total contest points across all phases and tasks
      const totalContestPoints = contest.phases.reduce((acc, ph) => {
        return acc + ph.tasks.reduce((tAcc, t) => tAcc + t.totalPoints, 0);
      }, 0) || primarySub.task.totalPoints;

      // Candidate-level aggregated totals
      let totalAuto = 0;
      let totalManual = 0;
      let totalFinal = 0;
      let hasGradingInProgress = false;
      let allGraded = true;
      let latestSubmittedAt: Date | null = null;
      let overallFeedback: string | null = null;
      const questionsFeedbackMap: Record<string, string> = {};

      const flatAnswers: SubmissionToGrade["answers"] = [];
      const flatRubrics: SubmissionToGrade["rubrics"] = [];

      for (const sub of userSubs) {
        if (sub.status === "GRADING_IN_PROGRESS") {
          hasGradingInProgress = true;
          allGraded = false;
        } else if (sub.status !== "GRADED") {
          allGraded = false;
        }

        if (sub.autoGradeScore !== null) totalAuto += Number(sub.autoGradeScore);
        if (sub.manualGradeScore !== null) totalManual += Number(sub.manualGradeScore);
        if (sub.finalScore !== null) totalFinal += Number(sub.finalScore);

        if (sub.submittedAt) {
          if (!latestSubmittedAt || sub.submittedAt > latestSubmittedAt) {
            latestSubmittedAt = sub.submittedAt;
          }
        }

        // Parse feedbackSummary JSON if present
        if (sub.feedbackSummary) {
          try {
            const parsed = JSON.parse(sub.feedbackSummary);
            if (parsed && typeof parsed === "object") {
              if (parsed.overall && !overallFeedback) {
                overallFeedback = parsed.overall;
              }
              if (parsed.questions) {
                Object.assign(questionsFeedbackMap, parsed.questions);
              }
            } else if (!overallFeedback) {
              overallFeedback = String(sub.feedbackSummary);
            }
          } catch {
            if (!overallFeedback) overallFeedback = sub.feedbackSummary;
          }
        }

        // Collect answers for this task
        const questionsList = sub.task.questions.length > 0
          ? sub.task.questions
          : sub.answers.map((a, idx) => ({
              id: a.questionId,
              questionNumber: idx + 1,
              type: a.question.type,
              prompt: a.question.prompt,
              instructions: null,
              points: a.question.points,
              minWords: null,
              maxWords: null,
            }));

        for (const q of questionsList) {
          const ans = sub.answers.find((a) => a.questionId === q.id);
          flatAnswers.push({
            id: ans?.id || `ans-${q.id}`,
            questionId: q.id,
            questionNumber: q.questionNumber,
            questionPrompt: q.prompt,
            questionInstructions: q.instructions || null,
            questionType: q.type,
            questionPoints: q.points,
            selectedOption: ans?.selectedOption ?? null,
            writtenText: ans?.writtenText ?? null,
            wordCount: ans?.wordCount ?? null,
            minWords: q.minWords ?? null,
            maxWords: q.maxWords ?? null,
            fileName: ans?.fileName ?? null,
            fileKey: ans?.fileKey ?? null,
            fileSizeBytes: ans?.fileSizeBytes ? Number(ans.fileSizeBytes) : null,
            score: ans?.score !== null && ans?.score !== undefined ? Number(ans.score) : null,
            isCorrect: ans?.isCorrect ?? null,
            feedback: questionsFeedbackMap[q.id] || null,
            taskTitle: sub.task.title,
            taskId: sub.task.id,
          });
        }

        // Collect rubrics for this task
        for (const r of sub.task.rubrics) {
          const evalRecord = sub.evaluations.find((e) => e.rubricId === r.id);
          flatRubrics.push({
            id: r.id,
            name: r.name,
            description: r.description,
            weightPercentage: Number(r.weightPercentage),
            maxPoints: Number(r.maxPoints),
            currentScoreAwarded: evalRecord ? Number(evalRecord.scoreAwarded) : undefined,
            currentComments: evalRecord?.comments || undefined,
            taskTitle: sub.task.title,
            taskId: sub.task.id,
          });
        }
      }

      // Determine overall attempt status
      const attemptStatus = hasGradingInProgress
        ? "GRADING_IN_PROGRESS"
        : allGraded && userSubs.length > 0
        ? "GRADED"
        : "SUBMITTED";

      // Build hierarchical Phase structure
      const phases = contest.phases.map((ph) => ({
        phaseId: ph.id,
        phaseNumber: ph.phaseNumber,
        phaseTitle: ph.title,
        tasks: ph.tasks.map((t) => {
          const sub = userSubs.find((s) => s.taskId === t.id);
          return {
            taskId: t.id,
            taskNumber: t.taskNumber,
            taskTitle: t.title,
            taskPoints: t.totalPoints,
            submissionId: sub ? sub.id : "",
            status: sub ? sub.status : "UNSUBMITTED",
            autoGradeScore: sub?.autoGradeScore ? Number(sub.autoGradeScore) : null,
            manualGradeScore: sub?.manualGradeScore ? Number(sub.manualGradeScore) : null,
            finalScore: sub?.finalScore ? Number(sub.finalScore) : null,
          };
        }),
      }));

      candidateAttempts.push({
        id: primarySub.id,
        contestId: primarySub.contestId,
        contestTitle: contest.title,
        contestIsPublished: contest.isPublished,
        phaseId: primarySub.phaseId,
        phaseTitle: `Phase ${primarySub.phase.phaseNumber}: ${primarySub.phase.title}`,
        taskId: primarySub.taskId,
        taskTitle: primarySub.task.title,
        taskPoints: totalContestPoints,
        userId: primarySub.userId,
        candidateName: user.name,
        candidateEmail: user.email,
        candidateId: user.candidateId || `ACI-${user.id.slice(0, 4).toUpperCase()}`,
        institution: user.institution || "National Campus Cluster",
        status: attemptStatus,
        submittedAt: latestSubmittedAt ? latestSubmittedAt.toISOString() : null,
        autoGradeScore: totalAuto,
        manualGradeScore: totalManual,
        finalScore: Math.min(totalContestPoints, totalFinal),
        isLate: userSubs.some((s) => s.isLate),
        feedbackSummary: primarySub.feedbackSummary,
        overallFeedback,
        phases,
        answers: flatAnswers,
        rubrics: flatRubrics,
      });
    }

    return candidateAttempts;
  } catch (error) {
    console.error("Error fetching submissions for grading:", error);
    return [];
  }
}

export interface GradeSubmissionInput {
  submissionId: string;
  evaluatorEmail?: string;
  isDraft?: boolean;
  overallFeedback?: string;
  questionGrades?: Array<{
    questionId: string;
    score: number;
    feedback?: string;
  }>;
  rubricScores?: Array<{
    rubricId: string;
    scoreAwarded: number;
    comments?: string;
  }>;
}

export interface SaveRubricScoreInput {
  submissionId: string;
  evaluatorEmail?: string;
  isDraft?: boolean;
  overallFeedback?: string;
  questionGrades?: Array<{
    questionId: string;
    score: number;
    feedback?: string;
  }>;
  scores?: Array<{
    rubricId: string;
    scoreAwarded: number;
    comments?: string;
  }>;
}

export async function gradeSubmissionAction(input: GradeSubmissionInput) {
  try {
    const session = await requireRole(["EVALUATOR", "ADMIN"]);
    const evaluatorEmail = input.evaluatorEmail || session.email;

    // 1. Resolve evaluator user
    let evaluator = await prisma.user.findUnique({
      where: { email: evaluatorEmail },
    });

    if (!evaluator) {
      evaluator = await prisma.user.create({
        data: {
          id: crypto.randomUUID(),
          email: evaluatorEmail,
          name: session.name || "Academic Evaluator Panel",
          role: "EVALUATOR",
        },
      });
    }

    // 2. Permission check: EVALUATOR or ADMIN can grade
    if (!checkUserPermission(evaluator.role, "GRADE_SUBMISSION")) {
      return { success: false, error: "Unauthorized: only evaluators or admins can score submissions." };
    }

    // 3. Find primary submission to identify (contestId, userId)
    const baseSub = await prisma.submission.findUnique({
      where: { id: input.submissionId },
      include: { contest: true, task: true },
    });

    if (!baseSub) {
      return { success: false, error: "Submission not found." };
    }

    // 4. Fetch all tasks and submissions for this candidate in this contest
    const candidateSubmissions = await prisma.submission.findMany({
      where: {
        contestId: baseSub.contestId,
        userId: baseSub.userId,
      },
      include: {
        task: {
          include: {
            questions: {
              include: { answerKey: true },
              orderBy: { questionNumber: "asc" },
            },
            rubrics: true,
          },
        },
        answers: true,
      },
    });

    // 5. Validate question marks across all tasks
    if (input.questionGrades) {
      for (const item of input.questionGrades) {
        let questionObj: { questionNumber: number; points: number; type: string } | null = null;
        for (const sub of candidateSubmissions) {
          const q = sub.task.questions.find((quest) => quest.id === item.questionId);
          if (q) {
            questionObj = q;
            break;
          }
        }

        if (questionObj) {
          if (
            typeof item.score !== "number" ||
            isNaN(item.score) ||
            item.score < 0 ||
            item.score > questionObj.points
          ) {
            return {
              success: false,
              error: `Invalid mark: Score for Question 0${questionObj.questionNumber} (${item.score}) cannot be negative or exceed maximum ${questionObj.points} points.`,
            };
          }
        }
      }
    }

    // 6. Validate rubric marks across all tasks
    if (input.rubricScores) {
      for (const item of input.rubricScores) {
        let rubricObj: { name: string; maxPoints: number | unknown } | null = null;
        for (const sub of candidateSubmissions) {
          const r = sub.task.rubrics.find((rub) => rub.id === item.rubricId);
          if (r) {
            rubricObj = r;
            break;
          }
        }

        if (rubricObj) {
          const maxPts = Number(rubricObj.maxPoints);
          if (
            typeof item.scoreAwarded !== "number" ||
            isNaN(item.scoreAwarded) ||
            item.scoreAwarded < 0 ||
            item.scoreAwarded > maxPts
          ) {
            return {
              success: false,
              error: `Invalid mark: Score for rubric criterion "${rubricObj.name}" (${item.scoreAwarded}) cannot be negative or exceed maximum ${maxPts} points.`,
            };
          }
        }
      }
    }

    // 7. Persist individual question scores in SubmissionAnswer
    const questionsFeedbackMap: Record<string, string> = {};

    if (input.questionGrades && input.questionGrades.length > 0) {
      for (const item of input.questionGrades) {
        // Find which submission belongs to this question
        const targetSub = candidateSubmissions.find((s) =>
          s.task.questions.some((q) => q.id === item.questionId)
        ) || baseSub;

        const boundedScore = Math.max(0, item.score);
        if (item.feedback) {
          questionsFeedbackMap[item.questionId] = item.feedback.trim();
        }

        await prisma.submissionAnswer.upsert({
          where: {
            submissionId_questionId: {
              submissionId: targetSub.id,
              questionId: item.questionId,
            },
          },
          update: {
            score: boundedScore,
            updatedAt: new Date(),
          },
          create: {
            submissionId: targetSub.id,
            questionId: item.questionId,
            score: boundedScore,
          },
        });
      }
    }

    // 8. Persist individual EvaluationScore records for rubrics
    if (input.rubricScores && input.rubricScores.length > 0) {
      for (const item of input.rubricScores) {
        const matchingSub = candidateSubmissions.find((s) =>
          s.task.rubrics.some((r) => r.id === item.rubricId)
        );
        const targetSub = matchingSub || baseSub;
        const rubric = matchingSub?.task.rubrics.find((r) => r.id === item.rubricId);
        const maxPts = rubric ? Number(rubric.maxPoints) : 100;
        const boundedScore = Math.max(0, Math.min(item.scoreAwarded, maxPts));

        await prisma.evaluationScore.upsert({
          where: {
            submissionId_rubricId_evaluatorId: {
              submissionId: targetSub.id,
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
            submissionId: targetSub.id,
            rubricId: item.rubricId,
            evaluatorId: evaluator.id,
            scoreAwarded: boundedScore,
            comments: item.comments?.trim() || null,
          },
        });
      }
    }

    // 9. Recalculate auto, manual, and final score for EACH task of this candidate
    let totalContestAuto = 0;
    let totalContestManual = 0;
    let totalContestFinal = 0;

    const status = input.isDraft ? "GRADING_IN_PROGRESS" : "GRADED";
    const overallFeedback = (input.overallFeedback || "").trim();

    for (const sub of candidateSubmissions) {
      // 9a. Auto-grade score for MCQs
      let taskAutoScore = 0;
      const mcqQuestions = sub.task.questions.filter((q) => q.type === "MCQ" && q.answerKey?.correctOptionKey);

      if (mcqQuestions.length > 0) {
        const mcqKeys: McqAnswerKey[] = mcqQuestions.map((q) => ({
          questionId: q.id,
          correctOptionKey: q.answerKey!.correctOptionKey!,
          points: q.points,
        }));

        const currentAnswers = await prisma.submissionAnswer.findMany({
          where: { submissionId: sub.id },
        });

        const participantAnswers: ParticipantMcqAnswer[] = currentAnswers
          .filter((a) => a.selectedOption)
          .map((a) => ({
            questionId: a.questionId,
            selectedOption: a.selectedOption!,
          }));

        const mcqResult = calculateMcqScore(participantAnswers, mcqKeys);
        taskAutoScore = mcqResult.totalPointsAwarded;

        for (const item of mcqResult.itemResults) {
          await prisma.submissionAnswer.upsert({
            where: {
              submissionId_questionId: {
                submissionId: sub.id,
                questionId: item.questionId,
              },
            },
            update: {
              score: item.pointsAwarded,
              isCorrect: item.isCorrect,
            },
            create: {
              submissionId: sub.id,
              questionId: item.questionId,
              score: item.pointsAwarded,
              isCorrect: item.isCorrect,
            },
          });
        }
      } else if (sub.autoGradeScore !== null) {
        taskAutoScore = Number(sub.autoGradeScore);
      }

      // 9b. Manual-grade score (rubric or questions)
      let taskManualScore = 0;
      if (sub.task.rubrics.length > 0) {
        const allEvaluations = await prisma.evaluationScore.findMany({
          where: {
            submissionId: sub.id,
            evaluatorId: evaluator.id,
          },
          include: { rubric: true },
        });

        if (allEvaluations.length > 0) {
          const rubricInputs: RubricScoreInput[] = allEvaluations.map((e) => ({
            rubricId: e.rubricId,
            name: e.rubric.name,
            weightPercentage: Number(e.rubric.weightPercentage),
            maxPoints: Number(e.rubric.maxPoints),
            scoreAwarded: Number(e.scoreAwarded),
          }));
          const rubricResult = calculateWeightedRubricScore(rubricInputs);
          const taskWeightBase = rubricResult.maxWeightTotal > 0 ? rubricResult.maxWeightTotal : 100;
          taskManualScore = Math.round(((rubricResult.weightedScore / taskWeightBase) * sub.task.totalPoints) * 100) / 100;
        } else if (input.questionGrades && input.questionGrades.length > 0) {
          const matchingGrades = input.questionGrades.filter((qg) =>
            sub.task.questions.some((q) => q.id === qg.questionId)
          );
          taskManualScore = matchingGrades.reduce((sum, qg) => sum + (qg.score || 0), 0);
        }
      } else {
        const currentNonMcq = await prisma.submissionAnswer.findMany({
          where: {
            submissionId: sub.id,
            question: { type: { not: "MCQ" } },
          },
        });
        taskManualScore = currentNonMcq.reduce(
          (sum, a) => sum + (a.score !== null ? Number(a.score) : 0),
          0
        );
      }

      // 9c. Task final score clamped to task.totalPoints
      const taskFinalScore = Math.min(
        sub.task.totalPoints,
        Math.max(0, Math.round((taskAutoScore + taskManualScore) * 100) / 100)
      );

      // Assemble structured feedback JSON for this task
      const feedbackPayload = JSON.stringify({
        overall: overallFeedback,
        questions: questionsFeedbackMap,
      });

      await prisma.submission.update({
        where: { id: sub.id },
        data: {
          autoGradeScore: taskAutoScore,
          manualGradeScore: taskManualScore,
          finalScore: taskFinalScore,
          status,
          feedbackSummary: feedbackPayload,
        },
      });

      totalContestAuto += taskAutoScore;
      totalContestManual += taskManualScore;
      totalContestFinal += taskFinalScore;
    }

    safeRevalidatePath("/admin");
    safeRevalidatePath("/admin/contests");
    safeRevalidatePath("/admin/submissions");
    safeRevalidatePath("/admin/results");
    safeRevalidatePath("/evaluator");
    safeRevalidatePath("/evaluator/monitoring");
    safeRevalidatePath("/dashboard");
    safeRevalidatePath("/dashboard/results");
    safeRevalidatePath("/dashboard/leaderboard");

    return {
      success: true,
      autoGradeScore: totalContestAuto,
      manualGradeScore: totalContestManual,
      finalScore: totalContestFinal,
      totalContestScore: totalContestFinal,
      status,
      feedbackSummary: JSON.stringify({
        overall: overallFeedback,
        questions: questionsFeedbackMap,
      }),
    };
  } catch (error) {
    console.error("Error evaluating submission:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save evaluation",
    };
  }
}

export async function saveRubricScoreAction(input: SaveRubricScoreInput) {
  return gradeSubmissionAction({
    submissionId: input.submissionId,
    evaluatorEmail: input.evaluatorEmail,
    isDraft: input.isDraft ?? false,
    overallFeedback: input.overallFeedback,
    questionGrades: input.questionGrades,
    rubricScores: input.scores,
  });
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

    // 2. Fetch contest with all phases, tasks, and enrolled participants
    const contest = await prisma.contest.findUnique({
      where: { id: contestId },
      include: {
        phases: {
          include: {
            tasks: true,
          },
          orderBy: { phaseNumber: "asc" },
        },
        participants: {
          where: { status: { in: ["ACTIVE", "ENROLLED"] } },
          include: { user: true },
        },
      },
    });

    if (!contest) {
      return { success: false, error: "Contest not found." };
    }

    if (contest.participants.length === 0) {
      return {
        success: false,
        error: "Cannot publish: No participants enrolled in this contest.",
      };
    }

    // Calculate maximum points for contest across all tasks
    const contestTotalPoints = contest.phases.reduce((acc, ph) => {
      return acc + ph.tasks.reduce((tAcc, t) => tAcc + t.totalPoints, 0);
    }, 0) || 100;

    // 3. For each candidate, evaluate grading completion and total contest score
    interface CandidateRankingRow {
      userId: string;
      name: string;
      totalScore: number;
      latestSubmittedAt: Date | null;
      submissions: Array<{ id: string }>;
    }

    const candidateRows: CandidateRankingRow[] = [];

    for (const participant of contest.participants) {
      const userSubmissions = await prisma.submission.findMany({
        where: { contestId, userId: participant.userId },
        include: { task: true },
      });

      // Check if any submission is pending grading
      const unfinalized = userSubmissions.find(
        (s) => s.status === "SUBMITTED" || s.status === "GRADING_IN_PROGRESS"
      );
      if (unfinalized) {
        return {
          success: false,
          error: `Cannot publish: Candidate "${participant.user.name}" has unfinalized submissions (${unfinalized.task.title}). Please finalize grading before publishing.`,
        };
      }

      // Sum final scores of graded submissions
      const graded = userSubmissions.filter(
        (s) => s.status === "GRADED" || s.status === "PUBLISHED"
      );

      let totalScore = 0;
      let latestSubmittedAt: Date | null = null;

      if (graded.length > 0) {
        totalScore = graded.reduce(
          (sum, s) => sum + (s.finalScore !== null ? Number(s.finalScore) : 0),
          0
        );
        totalScore = Math.min(contestTotalPoints, Math.max(0, Math.round(totalScore * 100) / 100));

        for (const s of graded) {
          if (s.submittedAt && (!latestSubmittedAt || s.submittedAt > latestSubmittedAt)) {
            latestSubmittedAt = s.submittedAt;
          }
        }
      }

      candidateRows.push({
        userId: participant.userId,
        name: participant.user.name,
        totalScore,
        latestSubmittedAt,
        submissions: userSubmissions.map((s) => ({ id: s.id })),
      });
    }

    const hasAnyGraded = candidateRows.some((c) => c.totalScore > 0 || c.submissions.length > 0);
    if (!hasAnyGraded) {
      return {
        success: false,
        error: "Cannot publish: No graded submissions found for this contest.",
      };
    }

    // 4. Sort candidates deterministically (totalScore DESC, submittedAt ASC)
    candidateRows.sort((a, b) => {
      if (b.totalScore !== a.totalScore) {
        return b.totalScore - a.totalScore;
      }
      const timeA = a.latestSubmittedAt ? a.latestSubmittedAt.getTime() : 0;
      const timeB = b.latestSubmittedAt ? b.latestSubmittedAt.getTime() : 0;
      return timeA - timeB;
    });

    // 5. Compute standard competition ranks (1224 ranking) and percentiles
    const totalCandidates = candidateRows.length;
    const now = new Date();
    let currentRank = 1;

    for (let i = 0; i < totalCandidates; i++) {
      if (i > 0 && candidateRows[i].totalScore < candidateRows[i - 1].totalScore) {
        currentRank = i + 1;
      }
      const rank = currentRank;
      const percentile = totalCandidates > 1
        ? Math.round(((totalCandidates - rank) / (totalCandidates - 1)) * 100 * 100) / 100
        : 100.0;
      const isCertified = candidateRows[i].totalScore >= Math.round(contestTotalPoints * 0.5);

      await prisma.cohortResult.upsert({
        where: {
          contestId_userId: {
            contestId,
            userId: candidateRows[i].userId,
          },
        },
        update: {
          totalScore: candidateRows[i].totalScore,
          rank,
          percentile,
          isCertified,
          publishedAt: now,
          updatedAt: now,
        },
        create: {
          contestId,
          userId: candidateRows[i].userId,
          totalScore: candidateRows[i].totalScore,
          rank,
          percentile,
          isCertified,
          publishedAt: now,
        },
      });

      // Update submissions to PUBLISHED status
      for (const s of candidateRows[i].submissions) {
        await prisma.submission.update({
          where: { id: s.id },
          data: { status: "PUBLISHED" },
        });
      }
    }

    // 6. Update Contest status to published and completed
    await prisma.contest.update({
      where: { id: contestId },
      data: {
        isPublished: true,
        status: "COMPLETED",
      },
    });

    safeRevalidatePath("/admin");
    safeRevalidatePath("/admin/contests");
    safeRevalidatePath("/admin/submissions");
    safeRevalidatePath("/admin/results");
    safeRevalidatePath("/evaluator");
    safeRevalidatePath("/evaluator/monitoring");
    safeRevalidatePath("/dashboard");
    safeRevalidatePath("/dashboard/results");
    safeRevalidatePath("/dashboard/leaderboard");
    safeRevalidatePath("/leaderboard");

    return {
      success: true,
      publishedCount: totalCandidates,
      isPublished: true,
    };
  } catch (error) {
    console.error("Error publishing contest results:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to publish contest results" };
  }
}
