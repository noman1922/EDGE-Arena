"use server";

import { prisma } from "@/lib/prisma";
import { PhaseStatus, QuestionType, Prisma } from "@prisma/client";
import { requireRole } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { parseDhakaDateTime } from "@/lib/contest-lifecycle";
import {
  parseCsvText,
  parseExcelBuffer,
  validateMcqRows,
  generateMcqCsvTemplate,
  generateMcqExcelTemplateBase64,
  ParsedMcqRow,
  McqImportPreviewResult,
} from "@/lib/bulk-mcq-parser";

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
  durationMinutes?: number | null;
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
        durationMinutes: t.durationMinutes,
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

export interface UpdatePhaseInput {
  phaseId: string;
  title: string;
  description?: string | null;
  phaseNumber?: number;
  weightPercentage?: number;
  deadline?: string;
  status?: "UPCOMING" | "OPEN" | "EVALUATING" | "CLOSED";
}

export async function updatePhaseAction(input: UpdatePhaseInput) {
  try {
    const session = await requireRole(["ADMIN"]);

    if (!input || !input.phaseId) {
      return { success: false, error: "Phase ID is required." };
    }

    const phase = await prisma.phase.findUnique({
      where: { id: input.phaseId },
      include: { contest: true },
    });

    if (!phase) {
      return { success: false, error: "Phase not found." };
    }

    const trimmedTitle = input.title?.trim();
    if (!trimmedTitle || trimmedTitle.length < 2) {
      return { success: false, error: "Phase title must be at least 2 characters long." };
    }
    if (trimmedTitle.length > 120) {
      return { success: false, error: "Phase title cannot exceed 120 characters." };
    }

    // Phase number uniqueness validation within the same contest
    let targetPhaseNumber = phase.phaseNumber;
    if (input.phaseNumber !== undefined && input.phaseNumber !== null) {
      const num = Number(input.phaseNumber);
      if (isNaN(num) || num < 1 || !Number.isInteger(num)) {
        return { success: false, error: "Phase number must be a positive integer." };
      }
      if (num !== phase.phaseNumber) {
        const conflict = await prisma.phase.findFirst({
          where: {
            contestId: phase.contestId,
            phaseNumber: num,
            id: { not: phase.id },
          },
        });
        if (conflict) {
          return {
            success: false,
            error: `Phase number ${num} is already used by phase "${conflict.title}" in this contest.`,
          };
        }
        targetPhaseNumber = num;
      }
    }

    // Weight percentage validation
    let targetWeight = phase.weightPercentage;
    if (input.weightPercentage !== undefined && input.weightPercentage !== null) {
      const w = Number(input.weightPercentage);
      if (isNaN(w) || w < 0 || w > 100) {
        return { success: false, error: "Weight percentage must be between 0 and 100." };
      }
      targetWeight = new Prisma.Decimal(w);
    }

    // Deadline validation
    let targetDeadline = phase.deadline;
    if (input.deadline) {
      const parsedDeadline = parseDhakaDateTime(input.deadline);
      if (isNaN(parsedDeadline.getTime())) {
        return { success: false, error: "Invalid deadline format." };
      }
      targetDeadline = parsedDeadline;

      // Extend contest end date if phase deadline exceeds it
      if (targetDeadline.getTime() > phase.contest.endDate.getTime()) {
        await prisma.contest.update({
          where: { id: phase.contestId },
          data: { endDate: targetDeadline },
        });
      }
    }

    // Status validation
    let targetStatus = phase.status;
    if (input.status) {
      const validStatuses = ["UPCOMING", "OPEN", "EVALUATING", "CLOSED"];
      if (!validStatuses.includes(input.status)) {
        return { success: false, error: "Invalid phase status." };
      }
      targetStatus = input.status as PhaseStatus;
    }

    // Description
    const targetDescription = input.description !== undefined ? input.description?.trim() || null : phase.description;

    // In-place update preserving ID, tasks, questions, submissions, scores
    const updated = await prisma.phase.update({
      where: { id: phase.id },
      data: {
        title: trimmedTitle,
        description: targetDescription,
        phaseNumber: targetPhaseNumber,
        weightPercentage: targetWeight,
        deadline: targetDeadline,
        status: targetStatus,
      },
    });

    await recordAuditLog({
      actorId: session.userId,
      action: "UPDATE_PHASE",
      targetType: "PHASE",
      targetId: phase.id,
      metadata: {
        contestId: phase.contestId,
        oldTitle: phase.title,
        newTitle: updated.title,
        oldPhaseNumber: phase.phaseNumber,
        newPhaseNumber: updated.phaseNumber,
        oldStatus: phase.status,
        newStatus: updated.status,
        deadline: updated.deadline.toISOString(),
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
      phase: {
        id: updated.id,
        contestId: updated.contestId,
        phaseNumber: updated.phaseNumber,
        title: updated.title,
        description: updated.description,
        weightPercentage: Number(updated.weightPercentage),
        deadline: updated.deadline.toISOString(),
        status: updated.status,
      },
    };
  } catch (error) {
    console.error("Error updating phase:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update phase",
    };
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
  durationMinutes?: number | null;
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
        durationMinutes: input.durationMinutes ? Number(input.durationMinutes) : null,
      },
    });

    await recordAuditLog({
      actorId: session.userId,
      action: "CREATE_TASK",
      targetType: "TASK",
      targetId: newTask.id,
      metadata: {
        title: newTask.title,
        phaseId: input.phaseId,
        durationMinutes: newTask.durationMinutes,
      },
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

export interface UpdateTaskInput {
  taskId: string;
  title?: string;
  instructions?: string | null;
  totalPoints?: number;
  durationMinutes?: number | null;
}

export async function updateTaskAction(input: UpdateTaskInput) {
  try {
    const session = await requireRole(["ADMIN"]);

    const task = await prisma.task.findUnique({
      where: { id: input.taskId },
      include: { phase: true },
    });

    if (!task) {
      return { success: false, error: "Task not found." };
    }

    const updated = await prisma.task.update({
      where: { id: input.taskId },
      data: {
        ...(input.title !== undefined && { title: input.title.trim() }),
        ...(input.instructions !== undefined && { instructions: input.instructions?.trim() || null }),
        ...(input.totalPoints !== undefined && { totalPoints: input.totalPoints }),
        ...(input.durationMinutes !== undefined && {
          durationMinutes: input.durationMinutes ? Number(input.durationMinutes) : null,
        }),
      },
    });

    await recordAuditLog({
      actorId: session.userId,
      action: "UPDATE_TASK",
      targetType: "TASK",
      targetId: input.taskId,
      metadata: {
        title: updated.title,
        durationMinutes: updated.durationMinutes,
        phaseId: task.phaseId,
      },
    });

    safeRevalidatePath("/admin/tasks");
    safeRevalidatePath("/admin/contests");
    safeRevalidatePath("/assessment");
    safeRevalidatePath("/dashboard");

    return { success: true, task: updated };
  } catch (error) {
    console.error("Error updating task:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to update task" };
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

// ==========================================
// BULK MCQ IMPORT ACTIONS (CSV & XLSX)
// ==========================================

export interface PreviewBulkMcqImportInput {
  taskId: string;
  fileBase64: string;
  fileName: string;
}

export interface ExecuteBulkMcqImportInput {
  taskId: string;
  rows: Array<{
    questionNumber?: number;
    prompt: string;
    instructions?: string;
    points: number;
    options: Array<{ optionKey: string; text: string; scopeTag?: string }>;
    correctOptionKey: string;
    explanation?: string;
    scoringGuide?: string;
  }>;
}

/**
 * Downloads standard MCQ template in CSV or XLSX format.
 */
export async function getMcqTemplateAction(
  format: "csv" | "xlsx"
): Promise<{ success: boolean; data?: string; filename: string; mimeType: string; error?: string }> {
  try {
    await requireRole(["ADMIN"]);

    if (format === "xlsx") {
      const base64 = generateMcqExcelTemplateBase64();
      return {
        success: true,
        data: base64,
        filename: "mcq_bulk_import_template.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      };
    } else {
      const csv = generateMcqCsvTemplate();
      const base64 = Buffer.from(csv, "utf-8").toString("base64");
      return {
        success: true,
        data: base64,
        filename: "mcq_bulk_import_template.csv",
        mimeType: "text/csv;charset=utf-8;",
      };
    }
  } catch (error) {
    return {
      success: false,
      filename: "template",
      mimeType: "text/plain",
      error: error instanceof Error ? error.message : "Failed to generate template",
    };
  }
}

/**
 * Parses and validates an uploaded CSV or Excel file for MCQ import.
 * Returns row-level validation results, error breakdown, and preview.
 */
export async function previewBulkMcqImportAction(
  input: PreviewBulkMcqImportInput
): Promise<McqImportPreviewResult & { error?: string }> {
  try {
    await requireRole(["ADMIN"]);

    if (!input.taskId) {
      return {
        success: false,
        totalRows: 0,
        validRowsCount: 0,
        invalidRowsCount: 0,
        rows: [],
        globalErrors: ["Task ID is required."],
      };
    }

    if (!input.fileBase64) {
      return {
        success: false,
        totalRows: 0,
        validRowsCount: 0,
        invalidRowsCount: 0,
        rows: [],
        globalErrors: ["File content is missing."],
      };
    }

    const task = await prisma.task.findUnique({
      where: { id: input.taskId },
      include: {
        questions: {
          select: {
            id: true,
            questionNumber: true,
            prompt: true,
          },
        },
      },
    });

    if (!task) {
      return {
        success: false,
        totalRows: 0,
        validRowsCount: 0,
        invalidRowsCount: 0,
        rows: [],
        globalErrors: ["Target task does not exist."],
      };
    }

    const existingContext = {
      existingQuestionNumbers: new Set(task.questions.map((q) => q.questionNumber)),
      existingPromptsNormalized: new Set(
        task.questions.map((q) => q.prompt.trim().toLowerCase().replace(/\s+/g, " "))
      ),
      maxExistingQuestionNumber: task.questions.reduce(
        (max, q) => Math.max(max, q.questionNumber),
        0
      ),
    };

    const buffer = Buffer.from(input.fileBase64, "base64");
    const lowerName = (input.fileName || "").toLowerCase();

    let rawRows: string[][] = [];

    if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) {
      rawRows = parseExcelBuffer(buffer);
    } else if (lowerName.endsWith(".csv")) {
      const text = buffer.toString("utf-8");
      rawRows = parseCsvText(text);
    } else {
      // Auto-detect: attempt Excel first, then fallback to CSV text
      try {
        rawRows = parseExcelBuffer(buffer);
      } catch {
        const text = buffer.toString("utf-8");
        rawRows = parseCsvText(text);
      }
    }

    return validateMcqRows(rawRows, existingContext);
  } catch (error) {
    console.error("Error previewing bulk MCQ import:", error);
    return {
      success: false,
      totalRows: 0,
      validRowsCount: 0,
      invalidRowsCount: 0,
      rows: [],
      globalErrors: [error instanceof Error ? error.message : "Failed to parse file"],
    };
  }
}

/**
 * Executes transaction-safe bulk MCQ import.
 * Never overwrites existing questions.
 * Recalculates total points on the task upon success.
 */
export async function executeBulkMcqImportAction(
  input: ExecuteBulkMcqImportInput
): Promise<{ success: boolean; importedCount?: number; error?: string }> {
  try {
    const session = await requireRole(["ADMIN"]);

    if (!input.taskId) {
      return { success: false, error: "Task ID is required." };
    }

    if (!Array.isArray(input.rows) || input.rows.length === 0) {
      return { success: false, error: "No valid question rows provided for import." };
    }

    if (input.rows.length > 200) {
      return { success: false, error: "Maximum batch limit is 200 questions per import." };
    }

    const task = await prisma.task.findUnique({
      where: { id: input.taskId },
      include: {
        phase: {
          select: { contestId: true },
        },
      },
    });

    if (!task) {
      return { success: false, error: "Target task does not exist." };
    }

    const importedQuestionIds: string[] = [];

    await prisma.$transaction(
      async (tx) => {
        // 1. Fetch fresh list of existing questions within the transaction to prevent race conditions
        const existingQuestions = await tx.question.findMany({
          where: { taskId: input.taskId },
          select: { id: true, questionNumber: true, prompt: true },
        });

        const existingNumbers = new Set(existingQuestions.map((q) => q.questionNumber));
        const existingPrompts = new Set(
          existingQuestions.map((q) => q.prompt.trim().toLowerCase().replace(/\s+/g, " "))
        );
        let maxQuestionNumber = existingQuestions.reduce(
          (max, q) => Math.max(max, q.questionNumber),
          0
        );

        // Verify no collision before constructing records
        for (const row of input.rows) {
          if (row.questionNumber !== undefined && existingNumbers.has(row.questionNumber)) {
            throw new Error(
              `Collision detected: Question number ${row.questionNumber} already exists in this task. Overwriting is not permitted.`
            );
          }
          const normPrompt = row.prompt.trim().toLowerCase().replace(/\s+/g, " ");
          if (existingPrompts.has(normPrompt)) {
            throw new Error(
              `Collision detected: Question prompt "${row.prompt.slice(0, 40)}..." already exists in this task.`
            );
          }
        }

        // 2. Prepare optimized batch records in memory using pre-generated UUIDs
        const questionsToCreate: Array<{
          id: string;
          taskId: string;
          questionNumber: number;
          type: QuestionType;
          prompt: string;
          instructions: string | null;
          points: number;
          isMandatory: boolean;
        }> = [];

        const optionsToCreate: Array<{
          id: string;
          questionId: string;
          optionKey: string;
          text: string;
          scopeTag: string | null;
        }> = [];

        const answerKeysToCreate: Array<{
          id: string;
          questionId: string;
          correctOptionKey: string | null;
          explanation: string | null;
          scoringGuide: string | null;
        }> = [];

        for (const row of input.rows) {
          let assignedNumber = row.questionNumber;
          if (assignedNumber === undefined) {
            maxQuestionNumber++;
            while (existingNumbers.has(maxQuestionNumber)) {
              maxQuestionNumber++;
            }
            assignedNumber = maxQuestionNumber;
          }
          existingNumbers.add(assignedNumber);

          const questionId = randomUUID();
          importedQuestionIds.push(questionId);

          questionsToCreate.push({
            id: questionId,
            taskId: input.taskId,
            questionNumber: assignedNumber,
            type: QuestionType.MCQ,
            prompt: row.prompt.trim(),
            instructions: row.instructions?.trim() || null,
            points: row.points || 10,
            isMandatory: true,
          });

          for (const opt of row.options) {
            optionsToCreate.push({
              id: randomUUID(),
              questionId,
              optionKey: opt.optionKey,
              text: opt.text.trim(),
              scopeTag: opt.scopeTag || null,
            });
          }

          if (row.correctOptionKey) {
            answerKeysToCreate.push({
              id: randomUUID(),
              questionId,
              correctOptionKey: row.correctOptionKey,
              explanation: row.explanation?.trim() || null,
              scoringGuide: row.scoringGuide?.trim() || null,
            });
          }
        }

        // 3. High-performance batch insertions via createMany (replaces 120+ sequential queries with 3 bulk operations)
        await tx.question.createMany({
          data: questionsToCreate,
        });

        if (optionsToCreate.length > 0) {
          await tx.mcqOption.createMany({
            data: optionsToCreate,
          });
        }

        if (answerKeysToCreate.length > 0) {
          await tx.questionAnswerKey.createMany({
            data: answerKeysToCreate,
          });
        }

        // 4. Recalculate task totalPoints via single fast aggregate query
        const pointsSum = await tx.question.aggregate({
          where: { taskId: input.taskId },
          _sum: { points: true },
        });
        const newTotalPoints = pointsSum._sum.points ?? 0;

        await tx.task.update({
          where: { id: input.taskId },
          data: { totalPoints: newTotalPoints },
        });
      },
      {
        maxWait: 10000, // 10s wait for connection slot from pool
        timeout: 30000, // 30s interactive transaction timeout for large batches
      }
    );

    // 4. Record audit log
    await recordAuditLog({
      actorId: session.userId,
      action: "BULK_IMPORT_MCQ",
      targetType: "TASK",
      targetId: input.taskId,
      metadata: {
        contestId: task.phase.contestId,
        importedCount: importedQuestionIds.length,
        questionIds: importedQuestionIds,
      },
    });

    safeRevalidatePath("/admin/tasks");
    safeRevalidatePath("/assessment");

    return {
      success: true,
      importedCount: importedQuestionIds.length,
    };
  } catch (error) {
    console.error("Error executing bulk MCQ import:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to import questions",
    };
  }
}
