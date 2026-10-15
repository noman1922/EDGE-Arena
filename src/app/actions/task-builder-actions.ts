"use server";

import { prisma } from "@/lib/prisma";
import { PhaseStatus, QuestionType } from "@prisma/client";
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
}

export async function createPhaseAction(input: CreatePhaseInput) {
  try {
    const session = await requireRole(["ADMIN"]);

    const newPhase = await prisma.phase.create({
      data: {
        contestId: input.contestId,
        phaseNumber: input.phaseNumber,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        weightPercentage: input.weightPercentage || 100.0,
        deadline: new Date(input.deadline),
        status: PhaseStatus.UPCOMING,
      },
    });

    await recordAuditLog({
      actorId: session.userId,
      action: "CREATE_PHASE",
      targetType: "PHASE",
      targetId: newPhase.id,
      metadata: { title: newPhase.title, contestId: input.contestId },
    });

    safeRevalidatePath("/admin/tasks");
    safeRevalidatePath("/admin/contests");

    return { success: true, phaseId: newPhase.id };
  } catch (error) {
    console.error("Error creating phase:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to create phase" };
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
