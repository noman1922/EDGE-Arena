"use server";

import { prisma } from "@/lib/prisma";
import {
  calculateMcqScore,
  checkSubmissionDeadline,
  sanitizeQuestionForParticipant,
  sanitizeSubmissionForParticipant,
  type McqAnswerKey,
  type ParticipantMcqAnswer,
} from "@/lib/scoring";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";

export interface ParticipantDashboardContest {
  contestId: string;
  slug: string;
  title: string;
  track: string;
  stageTitle: string;
  taskTitle: string;
  taskId: string;
  deadlineDate: string;
  deadlineFormatted: string;
  daysRemainingText: string;
  progressPercent: number;
  progressText: string;
  status: "IN_PROGRESS" | "SUBMITTED" | "NOT_STARTED";
  submittedAt?: string;
  canContinue: boolean;
}

export async function getParticipantDashboard(
  _userEmail?: string
): Promise<{
  candidate: {
    id: string;
    candidateId: string;
    name: string;
    email: string;
    cohort: string;
    institution: string;
  };
  contests: ParticipantDashboardContest[];
}> {
  try {
    const session = await requireRole(["PARTICIPANT"]);
    const candidateEmail = session.email;

    // 1. Resolve candidate user
    const user = await prisma.user.findUnique({
      where: { email: candidateEmail },
      include: { cohort: true },
    });

    if (!user) {
      throw new Error(`Participant user not found for email: ${candidateEmail}`);
    }

    // 2. Fetch only enrolled contests for this specific candidate
    const enrollments = await prisma.contestParticipant.findMany({
      where: {
        userId: user.id,
        status: { in: ["ACTIVE", "ENROLLED"] },
      },
      include: {
        contest: {
          include: {
            cohort: true,
            phases: {
              orderBy: { phaseNumber: "asc" },
              include: {
                tasks: {
                  orderBy: { taskNumber: "asc" },
                  include: {
                    questions: true,
                    submissions: {
                      where: { userId: user.id },
                      include: {
                        answers: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    const now = new Date();
    const contests: ParticipantDashboardContest[] = [];

    for (const enrollment of enrollments) {
      const c = enrollment.contest;
      const activePhase = c.phases.find((p) => p.status === "OPEN") || c.phases[0];
      if (!activePhase) continue;

      const activeTask = activePhase.tasks[0];
      if (!activeTask) continue;

      const existingSubmission = activeTask.submissions[0];
      const isSubmitted = existingSubmission?.status === "SUBMITTED";
      const totalQuestions = activeTask.questions.length;
      const answeredCount = existingSubmission?.answers.length ?? 0;

      let progressPercent = 0;
      if (isSubmitted) {
        progressPercent = 100;
      } else if (totalQuestions > 0) {
        progressPercent = Math.min(100, Math.round((answeredCount / totalQuestions) * 100));
      }

      // Deadline calculations
      const diffMs = activePhase.deadline.getTime() - now.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      let daysRemainingText = `${diffDays} days remaining`;
      if (diffMs <= 0) {
        daysRemainingText = "Deadline passed";
      } else if (diffDays === 1) {
        daysRemainingText = "Due today";
      }

      const deadlineFormatted = activePhase.deadline.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });

      let status: "IN_PROGRESS" | "SUBMITTED" | "NOT_STARTED" = "NOT_STARTED";
      let progressText = "Not Started";

      if (isSubmitted) {
        status = "SUBMITTED";
        progressText = `Submitted on ${existingSubmission.submittedAt?.toLocaleDateString() ?? "Recorded"}`;
      } else if (answeredCount > 0) {
        status = "IN_PROGRESS";
        progressText = `Question ${answeredCount} of ${totalQuestions} In Progress`;
      }

      contests.push({
        contestId: c.id,
        slug: c.slug,
        title: c.title,
        track: c.track,
        stageTitle: `Phase ${activePhase.phaseNumber} · ${activePhase.title}`,
        taskTitle: activeTask.title,
        taskId: activeTask.id,
        deadlineDate: activePhase.deadline.toISOString(),
        deadlineFormatted,
        daysRemainingText,
        progressPercent,
        progressText,
        status,
        submittedAt: existingSubmission?.submittedAt?.toISOString(),
        canContinue: !isSubmitted,
      });
    }

    return {
      candidate: {
        id: user.id,
        candidateId: user.candidateId || "DEMO-CANDIDATE-01",
        name: user.name,
        email: user.email,
        cohort: user.cohort?.name || "Campus Leadership Programme 2025",
        institution: user.institution || "National Campus Cluster A",
      },
      contests,
    };
  } catch (error) {
    console.error("Error loading participant dashboard:", error);
    throw error;
  }
}

export interface TaskAssessmentData {
  task: {
    id: string;
    title: string;
    instructions: string | null;
    totalPoints: number;
    phaseTitle: string;
    contestTitle: string;
    deadline: string;
    deadlineFormatted: string;
    secondsLeft: number;
  };
  questions: Array<{
    id: string;
    questionNumber: number;
    type: string;
    prompt: string;
    instructions: string | null;
    points: number;
    isMandatory: boolean;
    minWords: number | null;
    maxWords: number | null;
    options: Array<{
      id: string;
      optionKey: string;
      text: string;
      scopeTag: string | null;
    }>;
  }>;
  submission: {
    id: string;
    status: string;
    submittedAt: string | null;
    autoSavedAt: string;
    answers: Array<{
      questionId: string;
      selectedOption: string | null;
      writtenText: string | null;
      fileName: string | null;
      fileKey: string | null;
      wordCount: number | null;
    }>;
  };
  user: {
    id: string;
    name: string;
    email: string;
  };
}

export async function getTaskAssessmentData(
  _userEmail?: string
): Promise<TaskAssessmentData> {
  try {
    const session = await requireRole(["PARTICIPANT"]);
    const candidateEmail = session.email;

    // 1. Resolve participant user
    const user = await prisma.user.findUnique({
      where: { email: candidateEmail },
    });

    if (!user) {
      throw new Error(`Participant user not found: ${candidateEmail}`);
    }

    // 2. Find participant's active enrolled contest and open task
    const enrollment = await prisma.contestParticipant.findFirst({
      where: {
        userId: user.id,
        status: { in: ["ACTIVE", "ENROLLED"] },
      },
      include: {
        contest: {
          include: {
            phases: {
              where: { status: "OPEN" },
              orderBy: { phaseNumber: "asc" },
              include: {
                tasks: {
                  orderBy: { taskNumber: "asc" },
                  include: {
                    questions: {
                      orderBy: { questionNumber: "asc" },
                      include: {
                        options: {
                          orderBy: { optionKey: "asc" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!enrollment || !enrollment.contest) {
      throw new Error("No active contest assignment found for this participant.");
    }

    const contest = enrollment.contest;
    const phase = contest.phases[0] || (await prisma.phase.findFirst({ where: { contestId: contest.id }, include: { tasks: { include: { questions: { include: { options: true } } } } } }));
    if (!phase) {
      throw new Error("No phases configured for this contest.");
    }

    const task = phase.tasks[0];
    if (!task) {
      throw new Error("No tasks configured in this phase.");
    }

    // 3. Strict security: Strip answerKey from questions using sanitizeQuestionForParticipant
    const sanitizedQuestions = task.questions.map((q) => sanitizeQuestionForParticipant(q));

    // 4. Ensure or fetch submission record
    let submission = await prisma.submission.findUnique({
      where: {
        taskId_userId: {
          taskId: task.id,
          userId: user.id,
        },
      },
      include: {
        answers: true,
      },
    });

    if (!submission) {
      submission = await prisma.submission.create({
        data: {
          contestId: contest.id,
          phaseId: phase.id,
          taskId: task.id,
          userId: user.id,
          status: "DRAFT",
        },
        include: {
          answers: true,
        },
      });
    }

    // 5. Sanitize submission for participant (strips scores while contest is unpublished)
    const sanitizedSubmission = sanitizeSubmissionForParticipant(submission, contest.isPublished);

    // Calculate time left in seconds
    const now = new Date();
    const secondsLeft = Math.max(0, Math.floor((phase.deadline.getTime() - now.getTime()) / 1000));

    return {
      task: {
        id: task.id,
        title: task.title,
        instructions: task.instructions,
        totalPoints: task.totalPoints,
        phaseTitle: `Phase ${phase.phaseNumber}: ${phase.title}`,
        contestTitle: contest.title,
        deadline: phase.deadline.toISOString(),
        deadlineFormatted: phase.deadline.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }),
        secondsLeft,
      },
      questions: sanitizedQuestions.map((q) => ({
        id: q.id,
        questionNumber: q.questionNumber,
        type: q.type,
        prompt: q.prompt,
        instructions: q.instructions,
        points: q.points,
        isMandatory: q.isMandatory,
        minWords: q.minWords,
        maxWords: q.maxWords,
        options: q.options.map((o) => ({
          id: o.id,
          optionKey: o.optionKey,
          text: o.text,
          scopeTag: o.scopeTag,
        })),
      })),
      submission: {
        id: sanitizedSubmission.id,
        status: sanitizedSubmission.status,
        submittedAt: sanitizedSubmission.submittedAt?.toISOString() || null,
        autoSavedAt: sanitizedSubmission.autoSavedAt.toISOString(),
        answers: sanitizedSubmission.answers ? sanitizedSubmission.answers.map((a) => ({
          questionId: a.questionId,
          selectedOption: a.selectedOption,
          writtenText: a.writtenText,
          fileName: a.fileName,
          fileKey: a.fileKey,
          wordCount: a.wordCount,
        })) : [],
      },
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    };
  } catch (error) {
    console.error("Error getting task assessment data:", error);
    throw error;
  }
}

export async function saveAnswerDraftAction(
  submissionId: string,
  questionId: string,
  data: {
    selectedOption?: string;
    writtenText?: string;
    fileName?: string;
    fileKey?: string;
  },
  _userEmail?: string
) {
  try {
    const session = await requireRole(["PARTICIPANT"]);

    // 1. Verify submission exists and belongs to participant
    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        user: true,
        phase: true,
      },
    });

    if (!submission) {
      return { success: false, error: "Submission session not found." };
    }

    if (submission.userId !== session.userId && submission.user.email !== session.email) {
      return { success: false, error: "Unauthorized access: Cross-user submission modification is blocked." };
    }

    if (submission.status === "SUBMITTED") {
      return { success: false, error: "Assessment has already been finalized and locked." };
    }

    // 2. Server-side deadline check (60s network grace period)
    const deadlineCheck = checkSubmissionDeadline(submission.phase.deadline, new Date(), 60);
    if (!deadlineCheck.isEligible) {
      return { success: false, error: "Cut-off deadline has elapsed. Edits are locked." };
    }

    // 3. Calculate word count for written text
    let wordCount: number | undefined = undefined;
    if (data.writtenText !== undefined) {
      wordCount = data.writtenText.trim().length === 0
        ? 0
        : data.writtenText.trim().split(/\s+/).filter(Boolean).length;
    }

    // 4. Upsert the SubmissionAnswer
    await prisma.submissionAnswer.upsert({
      where: {
        submissionId_questionId: {
          submissionId,
          questionId,
        },
      },
      update: {
        ...(data.selectedOption !== undefined && { selectedOption: data.selectedOption }),
        ...(data.writtenText !== undefined && { writtenText: data.writtenText }),
        ...(wordCount !== undefined && { wordCount }),
        ...(data.fileName !== undefined && { fileName: data.fileName }),
        ...(data.fileKey !== undefined && { fileKey: data.fileKey }),
        updatedAt: new Date(),
      },
      create: {
        submissionId,
        questionId,
        selectedOption: data.selectedOption,
        writtenText: data.writtenText,
        wordCount,
        fileName: data.fileName,
        fileKey: data.fileKey,
      },
    });

    // 5. Update submission autoSavedAt timestamp
    const now = new Date();
    await prisma.submission.update({
      where: { id: submissionId },
      data: { autoSavedAt: now },
    });

    return {
      success: true,
      savedAt: now.toLocaleTimeString("en-US", { hour12: false }),
    };
  } catch (error) {
    console.error("Error saving draft answer:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to save draft" };
  }
}

export async function submitAssessmentAction(
  submissionId: string,
  _userEmail?: string
) {
  try {
    const session = await requireRole(["PARTICIPANT"]);

    // 1. Fetch submission with task, phase, and answers
    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        user: true,
        phase: true,
        task: {
          include: {
            questions: {
              include: {
                answerKey: true,
              },
            },
          },
        },
        answers: true,
      },
    });

    if (!submission) {
      return { success: false, error: "Submission not found." };
    }

    if (submission.userId !== session.userId && submission.user.email !== session.email) {
      return { success: false, error: "Unauthorized access: Cross-user submission finalization is blocked." };
    }

    if (submission.status === "SUBMITTED") {
      return { success: true, message: "Already submitted." };
    }

    // 2. Server-side deadline check
    const deadlineCheck = checkSubmissionDeadline(submission.phase.deadline, new Date(), 60);
    const isLate = !deadlineCheck.isEligible;

    // 3. Server-side MCQ auto-grading
    const mcqKeys: McqAnswerKey[] = [];
    for (const q of submission.task.questions) {
      if (q.type === "MCQ" && q.answerKey?.correctOptionKey) {
        mcqKeys.push({
          questionId: q.id,
          correctOptionKey: q.answerKey.correctOptionKey,
          points: q.points,
        });
      }
    }

    const participantAnswers: ParticipantMcqAnswer[] = submission.answers
      .filter((a) => a.selectedOption)
      .map((a) => ({
        questionId: a.questionId,
        selectedOption: a.selectedOption!,
      }));

    const mcqResult = calculateMcqScore(participantAnswers, mcqKeys);

    // 4. Update MCQ answers with individual score and correctness
    for (const item of mcqResult.itemResults) {
      await prisma.submissionAnswer.updateMany({
        where: {
          submissionId,
          questionId: item.questionId,
        },
        data: {
          score: item.pointsAwarded,
          isCorrect: item.isCorrect,
        },
      });
    }

    // 5. Finalize submission in database
    const submittedAt = new Date();
    const updated = await prisma.submission.update({
      where: { id: submissionId },
      data: {
        status: "SUBMITTED",
        submittedAt,
        isLate,
        autoGradeScore: mcqResult.totalPointsAwarded,
        finalScore: mcqResult.totalPointsAwarded, // manual evaluation can add to this later
      },
    });

    function safeRevalidatePath(path: string) {
      try {
        revalidatePath(path);
      } catch {
        // Fallback for runner environments
      }
    }

    safeRevalidatePath("/assessment");
    safeRevalidatePath("/dashboard");
    safeRevalidatePath("/admin/contests");

    return {
      success: true,
      status: updated.status,
      submittedAt: submittedAt.toISOString(),
      isLate,
    };
  } catch (error) {
    console.error("Error submitting assessment:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to submit assessment" };
  }
}
