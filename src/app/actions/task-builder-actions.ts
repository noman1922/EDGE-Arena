"use server";

import { prisma } from "@/lib/prisma";
import { PhaseStatus, QuestionType } from "@prisma/client";
import { requireRole } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { parseDhakaDateTime } from "@/lib/contest-lifecycle";

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Runner environment fallback
  }
}

export interface TaskBuilderQuestion {
  id: string;
  questionNumber: number;
  type: "MCQ" | "WRITTEN" | "FILE_UPLOAD" | "REFERENCE";
  prompt: string;
  instructions: string | null;
  points: number;
  isMandatory: boolean;
  minWords: number | null;
  maxWords: number | null;
  allowedFileTypes: string | null;
  options: Array<{
    id: string;
    optionKey: string;
    text: string;
    scopeTag: string | null;
  }>;
  answerKey: {
    correctOptionKey: string | null;
    explanation: string | null;
    scoringGuide: string | null;
  } | null;
  submissionCount?: number;
}

export interface TaskBuilderTask {
  id: string;
  taskNumber: number;
  title: string;
  instructions: string | null;
  totalPoints: number;
  questions: TaskBuilderQuestion[];
  rubrics: Array<{
    id: string;
    name: string;
    description: string | null;
    weightPercentage: number;
    maxPoints: number;
  }>;
  references: Array<{
    id: string;
    title: string;
    fileKey: string;
    fileUrl: string | null;
    version: string | null;
  }>;
}

export interface TaskBuilderPhase {
  id: string;
  phaseNumber: number;
  title: string;
  description: string | null;
  weightPercentage: number;
  deadline: string;
  status: string;
  tasks: TaskBuilderTask[];
}

export async function getContestPhasesAndTasks(
  contestId: string
): Promise<{ contestTitle: string; phases: TaskBuilderPhase[] }> {
  try {
    await requireRole(["ADMIN"]);

    const contest = await prisma.contest.findUnique({
      where: { id: contestId },
      include: {
        phases: {
          orderBy: { phaseNumber: "asc" },
          include: {
            tasks: {
              orderBy: { taskNumber: "asc" },
              include: {
                questions: {
                  orderBy: { questionNumber: "asc" },
                  include: {
                    options: { orderBy: { optionKey: "asc" } },
                    answerKey: true,
                    _count: {
                      select: {
                        submissionAnswers: true,
                      },
                    },
                  },
                },
                rubrics: true,
                references: true,
              },
            },
          },
        },
      },
    });

    if (!contest) {
      throw new Error("Contest not found.");
    }

    const phases: TaskBuilderPhase[] = contest.phases.map((p) => ({
      id: p.id,
      phaseNumber: p.phaseNumber,
      title: p.title,
      description: p.description,
      weightPercentage: Number(p.weightPercentage),
      deadline: p.deadline.toISOString(),
      status: p.status,
      tasks: p.tasks.map((t) => ({
        id: t.id,
        taskNumber: t.taskNumber,
        title: t.title,
        instructions: t.instructions,
        totalPoints: t.totalPoints,
        questions: t.questions.map((q) => ({
          id: q.id,
          questionNumber: q.questionNumber,
          type: q.type as any,
          prompt: q.prompt,
          instructions: q.instructions,
          points: q.points,
          isMandatory: q.isMandatory,
          minWords: q.minWords,
          maxWords: q.maxWords,
          allowedFileTypes: q.allowedFileTypes,
          options: q.options.map((o) => ({
            id: o.id,
            optionKey: o.optionKey,
            text: o.text,
            scopeTag: o.scopeTag,
          })),
          answerKey: q.answerKey
            ? {
                correctOptionKey: q.answerKey.correctOptionKey,
                explanation: q.answerKey.explanation,
                scoringGuide: q.answerKey.scoringGuide,
              }
            : null,
          submissionCount: (q as any)._count?.submissionAnswers ?? 0,
        })),
        rubrics: t.rubrics.map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          weightPercentage: Number(r.weightPercentage),
          maxPoints: Number(r.maxPoints),
        })),
        references: t.references.map((rf) => ({
          id: rf.id,
          title: rf.title,
          fileKey: rf.fileKey,
          fileUrl: rf.fileUrl,
          version: rf.version,
        })),
      })),
    }));

    return { contestTitle: contest.title, phases };
  } catch (error) {
    console.error("Error fetching contest phases and tasks:", error);
    return { contestTitle: "", phases: [] };
  }
}

export interface CreatePhaseInput {
  contestId: string;
  phaseNumber: number;
  title: string;
  description?: string;
  weightPercentage?: number;
  deadline: string;
  status?: "OPEN" | "UPCOMING";
}

export async function createPhaseAction(input: CreatePhaseInput) {
  try {
    const session = await requireRole(["ADMIN"]);

    const contest = await prisma.contest.findUnique({
      where: { id: input.contestId },
      include: { phases: true },
    });

    if (!contest) {
      return { success: false, error: "Contest not found." };
    }

    // Default to OPEN if contest is LIVE or explicitly requested
    let initialStatus: PhaseStatus = PhaseStatus.UPCOMING;
    if (input.status === "OPEN" || contest.status === "LIVE") {
      initialStatus = PhaseStatus.OPEN;
    }

    const newPhase = await prisma.phase.create({
      data: {
        contestId: input.contestId,
        phaseNumber: input.phaseNumber,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        weightPercentage: input.weightPercentage || 100.0,
        deadline: new Date(input.deadline),
        status: initialStatus,
      },
    });

    await recordAuditLog({
      actorId: session.userId,
      action: "CREATE_PHASE",
      targetType: "PHASE",
      targetId: newPhase.id,
      metadata: { title: newPhase.title, contestId: input.contestId, status: initialStatus },
    });

    safeRevalidatePath("/admin/tasks");
    safeRevalidatePath("/admin/contests");
    safeRevalidatePath("/dashboard");
    safeRevalidatePath("/assessment");

    return { success: true, phaseId: newPhase.id };
  } catch (error) {
    console.error("Error creating phase:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to create phase" };
  }
}

export async function updatePhaseDeadlineAction(phaseId: string, deadline: string) {
  try {
    const session = await requireRole(["ADMIN"]);

    const phase = await prisma.phase.findUnique({
      where: { id: phaseId },
      include: { contest: true },
    });

    if (!phase) {
      return { success: false, error: "Phase not found." };
    }

    const newDeadline = parseDhakaDateTime(deadline);
    if (isNaN(newDeadline.getTime())) {
      return { success: false, error: "Invalid deadline format." };
    }

    const updatedPhase = await prisma.phase.update({
      where: { id: phaseId },
      data: { deadline: newDeadline },
    });

    // If new phase deadline exceeds current contest end date, extend contest end date so it doesn't close prematurely
    if (newDeadline.getTime() > phase.contest.endDate.getTime()) {
      await prisma.contest.update({
        where: { id: phase.contestId },
        data: { endDate: newDeadline },
      });
    }

    await recordAuditLog({
      actorId: session.userId,
      action: "UPDATE_PHASE_DEADLINE",
      targetType: "PHASE",
      targetId: phaseId,
      metadata: {
        oldDeadline: phase.deadline.toISOString(),
        newDeadline: newDeadline.toISOString(),
        contestId: phase.contestId,
      },
    });

    safeRevalidatePath("/admin/tasks");
    safeRevalidatePath("/admin/contests");
    safeRevalidatePath("/dashboard");
    safeRevalidatePath("/dashboard/contests");
    safeRevalidatePath(`/dashboard/contests/${phase.contestId}`);
    safeRevalidatePath("/assessment");

    return {
      success: true,
      deadline: newDeadline.toISOString(),
      formattedDeadline: newDeadline.toLocaleString("en-US", { timeZone: "Asia/Dhaka" }),
    };
  } catch (error) {
    console.error("Error updating phase deadline:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to update phase deadline" };
  }
}

export async function deletePhaseAction(phaseId: string) {
  try {
    const session = await requireRole(["ADMIN"]);

    await prisma.phase.delete({
      where: { id: phaseId },
    });

    await recordAuditLog({
      actorId: session.userId,
      action: "DELETE_PHASE",
      targetType: "PHASE",
      targetId: phaseId,
    });

    safeRevalidatePath("/admin/tasks");
    safeRevalidatePath("/admin/contests");
    safeRevalidatePath("/dashboard");
    safeRevalidatePath("/assessment");

    return { success: true };
  } catch (error) {
    console.error("Error deleting phase:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to delete phase" };
  }
}

export async function deleteTaskAction(taskId: string) {
  try {
    const session = await requireRole(["ADMIN"]);

    await prisma.task.delete({
      where: { id: taskId },
    });

    await recordAuditLog({
      actorId: session.userId,
      action: "DELETE_TASK",
      targetType: "TASK",
      targetId: taskId,
    });

    safeRevalidatePath("/admin/tasks");
    safeRevalidatePath("/assessment");

    return { success: true };
  } catch (error) {
    console.error("Error deleting task:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to delete task" };
  }
}

export interface CreateTaskInput {
  phaseId: string;
  taskNumber: number;
  title: string;
  instructions?: string;
  totalPoints?: number;
}

export async function createTaskAction(input: CreateTaskInput) {
  try {
    const session = await requireRole(["ADMIN"]);

    const newTask = await prisma.task.create({
      data: {
        phaseId: input.phaseId,
        taskNumber: input.taskNumber,
        title: input.title.trim(),
        instructions: input.instructions?.trim() || null,
        totalPoints: input.totalPoints || 100,
      },
    });

    await recordAuditLog({
      actorId: session.userId,
      action: "CREATE_TASK",
      targetType: "TASK",
      targetId: newTask.id,
      metadata: { title: newTask.title, phaseId: input.phaseId },
    });

    safeRevalidatePath("/admin/tasks");
    safeRevalidatePath("/admin/contests");
    safeRevalidatePath("/assessment");
    safeRevalidatePath("/dashboard");

    return { success: true, taskId: newTask.id };
  } catch (error) {
    console.error("Error creating task:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to create task" };
  }
}

export interface CreateQuestionInput {
  taskId: string;
  questionNumber: number;
  type: "MCQ" | "WRITTEN" | "FILE_UPLOAD";
  prompt: string;
  instructions?: string;
  points: number;
  minWords?: number;
  maxWords?: number;
  options?: Array<{ optionKey: string; text: string; scopeTag?: string }>;
  correctOptionKey?: string;
  explanation?: string;
  scoringGuide?: string;
}

export async function createQuestionAction(input: CreateQuestionInput) {
  try {
    const session = await requireRole(["ADMIN"]);

    if (!input.prompt || !input.taskId) {
      return { success: false, error: "Prompt and task are required." };
    }

    const question = await prisma.question.create({
      data: {
        taskId: input.taskId,
        questionNumber: input.questionNumber,
        type: input.type as QuestionType,
        prompt: input.prompt.trim(),
        instructions: input.instructions?.trim() || null,
        points: input.points || 10,
        isMandatory: true,
        ...(input.minWords !== undefined && { minWords: input.minWords }),
        ...(input.maxWords !== undefined && { maxWords: input.maxWords }),
        ...(input.type === "FILE_UPLOAD" && {
          allowedFileTypes: "application/pdf",
          maxFileSizeBytes: BigInt(25 * 1024 * 1024), // 25MB
        }),
        ...(input.type === "MCQ" &&
          input.options && {
            options: {
              create: input.options.map((opt) => ({
                optionKey: opt.optionKey,
                text: opt.text.trim(),
                scopeTag: opt.scopeTag || null,
              })),
            },
          }),
        ...(input.type === "MCQ" &&
          input.correctOptionKey && {
            answerKey: {
              create: {
                correctOptionKey: input.correctOptionKey,
                explanation: input.explanation?.trim() || null,
                scoringGuide: input.scoringGuide?.trim() || null,
              },
            },
          }),
      },
    });

    await recordAuditLog({
      actorId: session.userId,
      action: "CREATE_QUESTION",
      targetType: "QUESTION",
      targetId: question.id,
      metadata: { type: question.type, taskId: input.taskId },
    });

    safeRevalidatePath("/admin/tasks");
    safeRevalidatePath("/assessment");

    return { success: true, questionId: question.id };
  } catch (error) {
    console.error("Error creating question:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to create question" };
  }
}

export async function deleteQuestionAction(questionId: string) {
  try {
    const session = await requireRole(["ADMIN"]);

    await prisma.question.delete({
      where: { id: questionId },
    });

    await recordAuditLog({
      actorId: session.userId,
      action: "DELETE_QUESTION",
      targetType: "QUESTION",
      targetId: questionId,
    });

    safeRevalidatePath("/admin/tasks");
    safeRevalidatePath("/assessment");

    return { success: true };
  } catch (error) {
    console.error("Error deleting question:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to delete question" };
  }
}

export interface UpdateQuestionInput {
  questionId: string;
  expectedTaskId?: string;
  expectedContestId?: string;
  questionNumber?: number;
  type?: "MCQ" | "WRITTEN" | "FILE_UPLOAD";
  prompt: string;
  instructions?: string;
  points: number;
  isMandatory?: boolean;
  minWords?: number;
  maxWords?: number;
  options?: Array<{ optionKey: string; text: string; scopeTag?: string }>;
  correctOptionKey?: string;
  explanation?: string;
  scoringGuide?: string;
  confirmSubmissionImpact?: boolean;
}

export interface UpdateQuestionResult {
  success: boolean;
  questionId?: string;
  error?: string;
  requiresConfirmation?: boolean;
  submissionCount?: number;
  warning?: string;
}

export async function updateQuestionAction(input: UpdateQuestionInput): Promise<UpdateQuestionResult> {
  try {
    const session = await requireRole(["ADMIN"]);

    if (!input.questionId) {
      return { success: false, error: "Question ID is required." };
    }

    const question = await prisma.question.findUnique({
      where: { id: input.questionId },
      include: {
        task: {
          include: {
            phase: {
              include: {
                contest: true,
              },
            },
          },
        },
        options: { orderBy: { optionKey: "asc" } },
        answerKey: true,
        _count: {
          select: {
            submissionAnswers: true,
          },
        },
      },
    });

    if (!question) {
      return { success: false, error: "Question not found." };
    }

    if (input.expectedTaskId && question.taskId !== input.expectedTaskId) {
      return { success: false, error: "Question does not belong to the specified task." };
    }

    if (input.expectedContestId && question.task.phase.contestId !== input.expectedContestId) {
      return { success: false, error: "Question does not belong to the specified contest." };
    }

    const trimmedPrompt = input.prompt?.trim();
    if (!trimmedPrompt) {
      return { success: false, error: "Question prompt text is required." };
    }

    const points = Number(input.points);
    if (isNaN(points) || points <= 0 || !Number.isInteger(points)) {
      return { success: false, error: "Marks assigned to the question must be a positive whole number." };
    }

    const targetType = (input.type || question.type) as QuestionType;
    const submissionCount = question._count.submissionAnswers;

    if (submissionCount > 0 && input.type && input.type !== question.type) {
      return {
        success: false,
        error: "Cannot change question type because participant submissions already exist for this question. Create a new question instead.",
      };
    }

    let targetCorrectOptionKey: string | null = null;
    let normalizedOptions: Array<{ optionKey: string; text: string; scopeTag?: string | null }> = [];

    if (targetType === "MCQ") {
      const rawOptions = input.options || question.options.map((o) => ({
        optionKey: o.optionKey,
        text: o.text,
        scopeTag: o.scopeTag,
      }));

      if (!rawOptions || rawOptions.length < 2) {
        return { success: false, error: "MCQ questions must have at least 2 answer options." };
      }

      normalizedOptions = rawOptions.map((opt) => ({
        optionKey: opt.optionKey.trim().toUpperCase(),
        text: opt.text.trim(),
        scopeTag: opt.scopeTag?.trim() || null,
      }));

      for (const opt of normalizedOptions) {
        if (!opt.optionKey) {
          return { success: false, error: "Each option must have a valid key (e.g., A, B, C, D)." };
        }
        if (!opt.text) {
          return { success: false, error: `Option ${opt.optionKey} text cannot be empty.` };
        }
      }

      const keys = normalizedOptions.map((o) => o.optionKey);
      if (new Set(keys).size !== keys.length) {
        return { success: false, error: "Option identifiers must be unique." };
      }

      const rawCorrectKey = input.correctOptionKey !== undefined
        ? input.correctOptionKey?.trim().toUpperCase()
        : question.answerKey?.correctOptionKey?.trim().toUpperCase();

      if (!rawCorrectKey) {
        return { success: false, error: "A correct answer option key must be designated for MCQ questions." };
      }

      if (!keys.includes(rawCorrectKey)) {
        return {
          success: false,
          error: `Selected correct answer (${rawCorrectKey}) does not match any available option (${keys.join(", ")}).`,
        };
      }
      targetCorrectOptionKey = rawCorrectKey;
    }

    if (targetType === "WRITTEN") {
      if (input.minWords !== undefined && input.maxWords !== undefined && input.minWords > input.maxWords) {
        return { success: false, error: "Minimum word count cannot exceed maximum word count." };
      }
    }

    // Guard: Require explicit confirmation when participant submissions exist
    if (submissionCount > 0 && !input.confirmSubmissionImpact) {
      return {
        success: false,
        requiresConfirmation: true,
        submissionCount,
        warning: `This question has ${submissionCount} existing participant answer(s). Modifying its prompt, options, answer key, or marks will apply to future submissions and grading but will not alter previously recorded answers. Please confirm to proceed.`,
      };
    }

    await prisma.$transaction(async (tx) => {
      // 1. Safe question renumbering
      const targetQuestionNumber = input.questionNumber !== undefined ? Number(input.questionNumber) : question.questionNumber;
      if (targetQuestionNumber > 0 && targetQuestionNumber !== question.questionNumber) {
        const conflictingQ = await tx.question.findUnique({
          where: {
            taskId_questionNumber: {
              taskId: question.taskId,
              questionNumber: targetQuestionNumber,
            },
          },
        });
        if (conflictingQ) {
          await tx.question.update({
            where: { id: conflictingQ.id },
            data: { questionNumber: -999999 },
          });
          await tx.question.update({
            where: { id: question.id },
            data: { questionNumber: targetQuestionNumber },
          });
          await tx.question.update({
            where: { id: conflictingQ.id },
            data: { questionNumber: question.questionNumber },
          });
        } else {
          await tx.question.update({
            where: { id: question.id },
            data: { questionNumber: targetQuestionNumber },
          });
        }
      }

      // 2. Update Question core attributes
      await tx.question.update({
        where: { id: question.id },
        data: {
          prompt: trimmedPrompt,
          instructions: input.instructions !== undefined ? (input.instructions.trim() || null) : question.instructions,
          points,
          type: targetType,
          isMandatory: input.isMandatory !== undefined ? Boolean(input.isMandatory) : question.isMandatory,
          minWords: targetType === "WRITTEN" ? (input.minWords !== undefined ? Number(input.minWords) : question.minWords) : null,
          maxWords: targetType === "WRITTEN" ? (input.maxWords !== undefined ? Number(input.maxWords) : question.maxWords) : null,
          allowedFileTypes: targetType === "FILE_UPLOAD" ? "application/pdf" : null,
          maxFileSizeBytes: targetType === "FILE_UPLOAD" ? BigInt(25 * 1024 * 1024) : null,
        },
      });

      // 3. Sync MCQ Options & Answer Key
      if (targetType === "MCQ") {
        const currentOptionKeys = question.options.map((o) => o.optionKey);
        const newOptionKeys = normalizedOptions.map((o) => o.optionKey);

        const toDeleteKeys = currentOptionKeys.filter((k) => !newOptionKeys.includes(k));
        if (toDeleteKeys.length > 0) {
          await tx.mcqOption.deleteMany({
            where: {
              questionId: question.id,
              optionKey: { in: toDeleteKeys },
            },
          });
        }

        for (const opt of normalizedOptions) {
          await tx.mcqOption.upsert({
            where: {
              questionId_optionKey: {
                questionId: question.id,
                optionKey: opt.optionKey,
              },
            },
            create: {
              questionId: question.id,
              optionKey: opt.optionKey,
              text: opt.text,
              scopeTag: opt.scopeTag,
            },
            update: {
              text: opt.text,
              scopeTag: opt.scopeTag,
            },
          });
        }

        await tx.questionAnswerKey.upsert({
          where: { questionId: question.id },
          create: {
            questionId: question.id,
            correctOptionKey: targetCorrectOptionKey,
            explanation: input.explanation !== undefined ? (input.explanation.trim() || null) : null,
            scoringGuide: input.scoringGuide !== undefined ? (input.scoringGuide.trim() || null) : null,
          },
          update: {
            correctOptionKey: targetCorrectOptionKey,
            explanation: input.explanation !== undefined ? (input.explanation.trim() || null) : (question.answerKey?.explanation || null),
            scoringGuide: input.scoringGuide !== undefined ? (input.scoringGuide.trim() || null) : (question.answerKey?.scoringGuide || null),
          },
        });
      } else {
        if (question.type === "MCQ") {
          await tx.mcqOption.deleteMany({
            where: { questionId: question.id },
          });
        }

        if (input.scoringGuide !== undefined || question.answerKey) {
          await tx.questionAnswerKey.upsert({
            where: { questionId: question.id },
            create: {
              questionId: question.id,
              correctOptionKey: null,
              explanation: null,
              scoringGuide: input.scoringGuide?.trim() || null,
            },
            update: {
              correctOptionKey: null,
              explanation: null,
              scoringGuide: input.scoringGuide !== undefined ? (input.scoringGuide.trim() || null) : (question.answerKey?.scoringGuide || null),
            },
          });
        }
      }
    });

    await recordAuditLog({
      actorId: session.userId,
      action: "UPDATE_QUESTION",
      targetType: "QUESTION",
      targetId: question.id,
      metadata: {
        contestId: question.task.phase.contestId,
        taskId: question.taskId,
        questionNumber: input.questionNumber ?? question.questionNumber,
        type: targetType,
        points,
        correctOptionKey: targetCorrectOptionKey,
        hadSubmissions: submissionCount > 0,
        submissionCount,
      },
    });

    safeRevalidatePath("/admin/tasks");
    safeRevalidatePath("/assessment");

    return { success: true, questionId: question.id };
  } catch (error) {
    console.error("Error updating question:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update question",
    };
  }
}
