"use server";

import { prisma } from "@/lib/prisma";
import { ContestStatus, PhaseStatus } from "@prisma/client";
import {
  calculateMcqScore,
  checkSubmissionDeadline,
  sanitizeQuestionForParticipant,
  sanitizeSubmissionForParticipant,
  type McqAnswerKey,
  type ParticipantMcqAnswer,
} from "@/lib/scoring";
import {
  getAuthoritativeContestDeadline,
  isContestActive,
  isContestConcluded,
  isContestUpcoming,
  normalizeContestStatus,
} from "@/lib/contest-lifecycle";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";

export interface AssessmentTaskNavOption {
  id: string;
  taskNumber: number;
  title: string;
  totalPoints: number;
  questionCount: number;
  questionTypes: string[];
  isSubmitted: boolean;
  hasDraft: boolean;
  isLocked: boolean;
  unlockRequirementText?: string;
  phaseId: string;
  phaseNumber: number;
  phaseTitle: string;
}

export interface AssessmentPhaseNavOption {
  id: string;
  phaseNumber: number;
  title: string;
  status: PhaseStatus;
  isLocked: boolean;
  unlockRequirementText?: string;
  deadline: string;
  deadlineFormatted: string;
  tasks: AssessmentTaskNavOption[];
}

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
  status: "IN_PROGRESS" | "SUBMITTED" | "NOT_STARTED" | "COMPLETED";
  submittedAt?: string;
  canContinue: boolean;
  isUpcoming?: boolean;
  secondsUntilStart?: number;
  enforceSequentialProgress?: boolean;
  totalTasks?: number;
  completedTasks?: number;
  phases?: AssessmentPhaseNavOption[];
}

export async function getParticipantDashboard(): Promise<{
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

    // 1. Resolve candidate user and enrolled contests concurrently with optimized projections
    const [user, enrollments] = await Promise.all([
      prisma.user.findUnique({
        where: { email: candidateEmail },
        select: {
          id: true,
          candidateId: true,
          name: true,
          email: true,
          institution: true,
          cohort: { select: { name: true } },
        },
      }),
      prisma.contestParticipant.findMany({
        where: {
          user: { email: candidateEmail },
          status: { in: ["ACTIVE", "ENROLLED"] },
        },
        include: {
          contest: {
            include: {
              cohort: { select: { name: true } },
              phases: {
                orderBy: { phaseNumber: "asc" },
                include: {
                  tasks: {
                    orderBy: { taskNumber: "asc" },
                    include: {
                      questions: {
                        select: {
                          id: true,
                          type: true,
                        },
                      },
                      submissions: {
                        where: { user: { email: candidateEmail } },
                        select: {
                          id: true,
                          status: true,
                          submittedAt: true,
                          answers: {
                            select: {
                              questionId: true,
                              selectedOption: true,
                              writtenText: true,
                              fileKey: true,
                              fileName: true,
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
        },
      }),
    ]);

    if (!user) {
      throw new Error(`Participant user not found for email: ${candidateEmail}`);
    }

    const now = new Date();
    const contests: ParticipantDashboardContest[] = [];

    for (const enrollment of enrollments) {
      const c = enrollment.contest;
      const activePhase = c.phases.find((p) => p.status === "OPEN") || c.phases[0];

      if (!activePhase) {
        const diffMs = c.endDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        contests.push({
          contestId: c.id,
          slug: c.slug,
          title: c.title,
          track: c.track,
          stageTitle: "Curriculum Pending",
          taskTitle: "Assessment tasks have not been published yet",
          taskId: "",
          deadlineDate: c.endDate.toISOString(),
          deadlineFormatted: c.endDate.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          }),
          daysRemainingText: diffDays > 0 ? `${diffDays} days remaining` : "Upcoming",
          progressPercent: 0,
          progressText: "Curriculum Pending",
          status: "NOT_STARTED",
          canContinue: false,
        });
        continue;
      }

      const activeTask = activePhase.tasks[0];
      if (!activeTask) {
        const diffMs = activePhase.deadline.getTime() - now.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        contests.push({
          contestId: c.id,
          slug: c.slug,
          title: c.title,
          track: c.track,
          stageTitle: `Phase ${activePhase.phaseNumber} · ${activePhase.title}`,
          taskTitle: "Tasks in this stage are currently being finalized",
          taskId: "",
          deadlineDate: activePhase.deadline.toISOString(),
          deadlineFormatted: activePhase.deadline.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          }),
          daysRemainingText: diffDays > 0 ? `${diffDays} days remaining` : "Upcoming",
          progressPercent: 0,
          progressText: "Tasks Pending",
          status: "NOT_STARTED",
          canContinue: false,
        });
        continue;
      }

      let totalTasks = 0;
      let completedTasks = 0;
      let firstUncompletedTaskId: string | null = null;
      const enforce = c.enforceSequentialProgress !== false;
      let prevPhaseCompleted = true;

      const dashboardPhases: AssessmentPhaseNavOption[] = [];

      for (let pIdx = 0; pIdx < (c.phases || []).length; pIdx++) {
        const p = c.phases[pIdx];
        const isPhaseLocked = enforce && pIdx > 0 && !prevPhaseCompleted;
        const phaseUnlockText = isPhaseLocked
          ? `Complete Module ${c.phases[pIdx - 1].phaseNumber} to unlock`
          : undefined;

        let prevTaskCompleted = true;
        const tasks: AssessmentTaskNavOption[] = [];

        for (let tIdx = 0; tIdx < (p.tasks || []).length; tIdx++) {
          const t = p.tasks[tIdx];
          totalTasks++;
          const sub = t.submissions?.[0];

          // Check if all questions have recorded answers/files
          const hasAnswersForAllQuestions =
            (t.questions?.length || 0) > 0 &&
            (t.questions || []).every((q) => {
              const a = (sub?.answers || []).find((ans) => ans.questionId === q.id);
              if (!a) return false;
              if (q.type === "MCQ") return Boolean(a.selectedOption);
              if (q.type === "WRITTEN") return Boolean(a.writtenText?.trim());
              return Boolean(a.fileKey || a.fileName);
            });

          const isSub =
            sub?.status === "SUBMITTED" ||
            sub?.status === "GRADED" ||
            sub?.status === "PUBLISHED" ||
            hasAnswersForAllQuestions;

          // Auto-finalize draft in database if all questions are answered
          if (sub?.status === "DRAFT" && hasAnswersForAllQuestions) {
            await prisma.submission.update({
              where: { id: sub.id },
              data: { status: "SUBMITTED", submittedAt: new Date() },
            }).catch(() => {});
          }

          if (isSub) {
            completedTasks++;
          } else if (!firstUncompletedTaskId) {
            firstUncompletedTaskId = t.id;
          }

          let isTaskLocked = false;
          let taskUnlockText: string | undefined = undefined;

          if (enforce) {
            if (isPhaseLocked) {
              isTaskLocked = true;
              taskUnlockText = phaseUnlockText;
            } else if (tIdx > 0 && !prevTaskCompleted) {
              isTaskLocked = true;
              const prevT = p.tasks[tIdx - 1];
              taskUnlockText = `Complete Unit ${p.phaseNumber}.${prevT.taskNumber} to unlock`;
            }
          }

          prevTaskCompleted = isSub;

          const qTypes = Array.from(new Set((t.questions || []).map((q) => q.type)));

          tasks.push({
            id: t.id,
            taskNumber: t.taskNumber,
            title: t.title,
            totalPoints: t.totalPoints,
            questionCount: (t.questions || []).length,
            questionTypes: qTypes,
            isSubmitted: isSub,
            hasDraft: (sub?.status === "DRAFT" && (sub.answers?.length || 0) > 0 && !isSub) || false,
            isLocked: isTaskLocked,
            unlockRequirementText: taskUnlockText,
            phaseId: p.id,
            phaseNumber: p.phaseNumber,
            phaseTitle: p.title,
          });
        }

        prevPhaseCompleted = tasks.every((t) => t.isSubmitted);

        dashboardPhases.push({
          id: p.id,
          phaseNumber: p.phaseNumber,
          title: p.title,
          status: p.status,
          isLocked: isPhaseLocked,
          unlockRequirementText: phaseUnlockText,
          deadline: p.deadline.toISOString(),
          deadlineFormatted: p.deadline.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          }),
          tasks,
        });
      }

      const allTasksCompleted = totalTasks > 0 && completedTasks === totalTasks;
      let progressPercent = 0;
      if (allTasksCompleted) {
        progressPercent = 100;
      } else if (totalTasks > 0) {
        progressPercent = Math.min(100, Math.round((completedTasks / totalTasks) * 100));
      }

      // Authoritative effective deadline calculation using shared lifecycle rules
      const { effectiveDeadline, isConcluded: isContestEnded, secondsLeft } =
        getAuthoritativeContestDeadline(c, activePhase, now);

      const diffMs = effectiveDeadline.getTime() - now.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      let daysRemainingText = `${diffDays} days remaining`;
      if (isContestEnded) {
        daysRemainingText = "Contest Concluded";
      } else if (diffDays <= 0 || secondsLeft <= 0) {
        daysRemainingText = "Due today";
      } else if (diffDays === 1) {
        daysRemainingText = "Due today";
      }

      const deadlineFormatted = effectiveDeadline.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });

      let status: "IN_PROGRESS" | "SUBMITTED" | "NOT_STARTED" | "COMPLETED" = "NOT_STARTED";
      let progressText = `${completedTasks} of ${totalTasks} Tasks Completed`;

      if (allTasksCompleted) {
        status = "SUBMITTED";
        progressText = `All ${totalTasks} Tasks Submitted`;
      } else if (isContestEnded) {
        status = "COMPLETED";
        progressText = "Concluded · Time Expired";
      } else if (completedTasks > 0) {
        status = "IN_PROGRESS";
        progressText = `${completedTasks} of ${totalTasks} Tasks Completed`;
      } else {
        progressText = `Ready to Begin · ${totalTasks} Tasks`;
      }

      const chosenTaskId = firstUncompletedTaskId || activeTask.id;

      contests.push({
        contestId: c.id,
        slug: c.slug,
        title: c.title,
        track: c.track,
        stageTitle: `${c.phases.length} Phases · ${totalTasks} Tasks`,
        taskTitle: activeTask.title,
        taskId: chosenTaskId,
        deadlineDate: effectiveDeadline.toISOString(),
        deadlineFormatted,
        daysRemainingText,
        progressPercent,
        progressText,
        status,
        submittedAt: allTasksCompleted ? new Date().toISOString() : undefined,
        canContinue: !allTasksCompleted && !isContestEnded && diffMs > 0,
        totalTasks,
        completedTasks,
        phases: dashboardPhases,
      });
    }

    return {
      candidate: {
        id: user.id,
        candidateId: user.candidateId || `ACI-${user.id.slice(0, 6).toUpperCase()}`,
        name: user.name,
        email: user.email,
        cohort: user.cohort?.name || "Career EDGE Cohort",
        institution: user.institution || "Candidate Institution",
      },
      contests,
    };
  } catch (error) {
    console.error("Error loading participant dashboard:", error);
    throw error;
  }
}

export interface TaskAssessmentData {
  state?: "READY" | "NO_ENROLLMENT" | "NO_PHASES" | "NO_TASKS" | "CONTEST_NOT_STARTED" | "UPCOMING";
  emptyState?: string;
  message?: string;
  isContestEnded?: boolean;
  isContestUpcoming?: boolean;
  secondsUntilStart?: number;
  isRedirectedFromLocked?: boolean;
  redirectTargetTaskId?: string;
  lockedRedirectMessage?: string;
  canSubmit?: boolean;
  contestStatus?: ContestStatus;
  contest?: {
    id: string;
    title: string;
    slug: string;
    track?: string;
    description?: string | null;
    status?: ContestStatus;
    startDate?: string;
    endDate?: string;
    endDateFormatted?: string;
    enforceSequentialProgress?: boolean;
  };
  phase?: {
    id: string;
    phaseNumber: number;
    title: string;
    status?: PhaseStatus;
    deadline?: string;
  };
  phases?: AssessmentPhaseNavOption[];
  allTasks?: AssessmentTaskNavOption[];
  task: {
    id: string;
    taskNumber?: number;
    contestId: string;
    title: string;
    instructions: string | null;
    totalPoints: number;
    phaseTitle: string;
    contestTitle: string;
    deadline: string;
    deadlineFormatted: string;
    secondsLeft: number;
    references?: Array<{
      id: string;
      title: string;
      fileKey: string;
      fileSizeBytes: number;
      mimeType: string;
      version: string | null;
    }>;
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
      fileSizeBytes?: number | null;
      fileSha256?: string | null;
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
  contestId?: string,
  taskId?: string
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

    // 2. Find participant's active enrolled contest
    let enrollment = null;
    if (contestId) {
      enrollment = await prisma.contestParticipant.findFirst({
        where: {
          userId: user.id,
          contestId,
          status: { in: ["ACTIVE", "ENROLLED"] },
        },
        include: {
          contest: {
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
                          options: {
                            orderBy: { optionKey: "asc" },
                          },
                        },
                      },
                      references: true,
                    },
                  },
                },
              },
            },
          },
        },
      });
    } else {
      const allEnrollments = await prisma.contestParticipant.findMany({
        where: {
          userId: user.id,
          status: { in: ["ACTIVE", "ENROLLED"] },
        },
        orderBy: { enrolledAt: "desc" },
        include: {
          contest: {
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
                          options: {
                            orderBy: { optionKey: "asc" },
                          },
                        },
                      },
                      references: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      const now = new Date();
      enrollment =
        allEnrollments.find((e) => e.contest && isContestActive(e.contest, now)) ||
        allEnrollments.find(
          (e) => e.contest && normalizeContestStatus(e.contest.status) !== ContestStatus.DRAFT
        ) ||
        allEnrollments[0] ||
        null;
    }

    // 3. Graceful empty state when no active enrollment exists
    if (!enrollment || !enrollment.contest) {
      return {
        state: "NO_ENROLLMENT",
        emptyState: "NO_ENROLLMENT",
        message: "No active contest assignment found for this participant.",
        task: {
          id: "",
          contestId: "",
          title: "No Active Assignment",
          instructions: null,
          totalPoints: 0,
          phaseTitle: "Unassigned",
          contestTitle: "Unassigned Contest",
          deadline: new Date().toISOString(),
          deadlineFormatted: "N/A",
          secondsLeft: 0,
        },
        questions: [],
        submission: {
          id: "",
          status: "DRAFT",
          submittedAt: null,
          autoSavedAt: new Date().toISOString(),
          answers: [],
        },
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
      };
    }

    const contest = enrollment.contest;
    const now2 = new Date();

    // 4. Graceful pre-contest gate when contest has not started yet
    const isUpcoming = isContestUpcoming(contest, now2);
    if (normalizeContestStatus(contest.status) === ContestStatus.DRAFT || isUpcoming) {
      const secondsUntilStart = Math.max(0, Math.floor((new Date(contest.startDate).getTime() - now2.getTime()) / 1000));
      return {
        state: "CONTEST_NOT_STARTED",
        emptyState: "CONTEST_NOT_STARTED",
        message: "This assessment benchmark has not started yet.",
        isContestUpcoming: true,
        secondsUntilStart,
        contestStatus: contest.status,
        contest: {
          id: contest.id,
          title: contest.title,
          slug: contest.slug,
          track: contest.track,
          description: contest.description,
          status: contest.status,
          startDate: contest.startDate.toISOString(),
          endDate: contest.endDate.toISOString(),
          endDateFormatted: contest.endDate.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
          enforceSequentialProgress: contest.enforceSequentialProgress ?? true,
        },
        task: {
          id: "",
          contestId: contest.id,
          title: "Assessment Scheduled",
          instructions: `Session opens at ${contest.startDate.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}.`,
          totalPoints: 0,
          phaseTitle: "Scheduled",
          contestTitle: contest.title,
          deadline: contest.endDate.toISOString(),
          deadlineFormatted: contest.endDate.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
          secondsLeft: 0,
        },
        questions: [],
        submission: {
          id: "",
          status: "DRAFT",
          submittedAt: null,
          autoSavedAt: now2.toISOString(),
          answers: [],
        },
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
        phases: [],
        allTasks: [],
      };
    }

    // 5. Graceful empty state when contest has no phases
    if (!contest.phases || contest.phases.length === 0) {
      return {
        state: "NO_PHASES",
        emptyState: "NO_PHASES",
        message: `Tasks for contest "${contest.title}" have not been published yet.`,
        contestStatus: contest.status,
        contest: {
          id: contest.id,
          title: contest.title,
          slug: contest.slug,
          status: contest.status,
          startDate: contest.startDate.toISOString(),
          endDate: contest.endDate.toISOString(),
          endDateFormatted: contest.endDate.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
        },
        task: {
          id: "",
          contestId: contest.id,
          title: "Curriculum Pending",
          instructions: "Assessment curriculum has not been published yet.",
          totalPoints: 0,
          phaseTitle: "Curriculum Pending",
          contestTitle: contest.title,
          deadline: contest.endDate.toISOString(),
          deadlineFormatted: contest.endDate.toLocaleDateString(),
          secondsLeft: 0,
        },
        questions: [],
        submission: {
          id: "",
          status: "DRAFT",
          submittedAt: null,
          autoSavedAt: now2.toISOString(),
          answers: [],
        },
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
        phases: [],
        allTasks: [],
      };
    }

    // Query user submissions across all tasks in this contest for navigation badges
    const userContestSubmissions = await prisma.submission.findMany({
      where: {
        contestId: contest.id,
        userId: user.id,
      },
      include: {
        answers: true,
      },
    });

    type SubAnswerRecord = {
      questionId: string;
      selectedOption?: string | null;
      writtenText?: string | null;
      fileName?: string | null;
      fileKey?: string | null;
    };
    const userSubMap = new Map<string, { id: string; status: string; answers: SubAnswerRecord[] }>();
    for (const s of userContestSubmissions) {
      userSubMap.set(s.taskId, {
        id: s.id,
        status: s.status,
        answers: (s.answers || []) as SubAnswerRecord[],
      });
    }

    const enforce = contest.enforceSequentialProgress !== false;
    let prevPhaseCompleted = true;
    const allTasks: AssessmentTaskNavOption[] = [];
    const allPhases: AssessmentPhaseNavOption[] = [];

    for (let pIdx = 0; pIdx < (contest.phases || []).length; pIdx++) {
      const p = contest.phases[pIdx];
      const isPhaseLocked = enforce && pIdx > 0 && !prevPhaseCompleted;
      const phaseUnlockText = isPhaseLocked
        ? `Complete Module ${contest.phases[pIdx - 1].phaseNumber} to unlock`
        : undefined;

      let prevTaskCompleted = true;
      const phaseTasks: AssessmentTaskNavOption[] = [];

      for (let tIdx = 0; tIdx < (p.tasks || []).length; tIdx++) {
        const t = p.tasks[tIdx];
        const sub = userSubMap.get(t.id);

        // Check if all questions have recorded answers/files
        const hasAnswersForAllQuestions =
          (t.questions?.length || 0) > 0 &&
          (t.questions || []).every((q) => {
            const a = (sub?.answers || []).find((ans) => ans.questionId === q.id);
            if (!a) return false;
            if (q.type === "MCQ") return Boolean(a.selectedOption);
            if (q.type === "WRITTEN") return Boolean(a.writtenText?.trim());
            return Boolean(a.fileKey || a.fileName);
          });

        const isSub =
          sub?.status === "SUBMITTED" ||
          sub?.status === "GRADED" ||
          sub?.status === "PUBLISHED";

        let isTaskLocked = false;
        let taskUnlockText: string | undefined = undefined;

        if (enforce) {
          if (isPhaseLocked) {
            isTaskLocked = true;
            taskUnlockText = phaseUnlockText;
          } else if (tIdx > 0 && !prevTaskCompleted) {
            isTaskLocked = true;
            const prevT = p.tasks[tIdx - 1];
            taskUnlockText = `Complete Unit ${p.phaseNumber}.${prevT.taskNumber} to unlock`;
          }
        }

        prevTaskCompleted = isSub;

        const hasDraft = (sub?.status === "DRAFT" && (sub.answers?.length || 0) > 0 && !isSub) || false;
        const qTypes = Array.from(new Set((t.questions || []).map((q) => q.type)));

        const taskOpt: AssessmentTaskNavOption = {
          id: t.id,
          taskNumber: t.taskNumber,
          title: t.title,
          totalPoints: t.totalPoints,
          questionCount: (t.questions || []).length,
          questionTypes: qTypes,
          isSubmitted: Boolean(isSub),
          hasDraft,
          isLocked: isTaskLocked,
          unlockRequirementText: taskUnlockText,
          phaseId: p.id,
          phaseNumber: p.phaseNumber,
          phaseTitle: p.title,
        };

        phaseTasks.push(taskOpt);
        allTasks.push(taskOpt);
      }

      prevPhaseCompleted = phaseTasks.every((t) => t.isSubmitted);

      allPhases.push({
        id: p.id,
        phaseNumber: p.phaseNumber,
        title: p.title,
        status: p.status,
        isLocked: isPhaseLocked,
        unlockRequirementText: phaseUnlockText,
        deadline: p.deadline.toISOString(),
        deadlineFormatted: p.deadline.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }),
        tasks: phaseTasks,
      });
    }

    // 6. Resolve target phase and target task with Sequential Locking Guard
    // Find active unit: first unlocked & unsubmitted task, or first unlocked task
    const firstActiveTaskOpt =
      allTasks.find((t) => !t.isLocked && !t.isSubmitted) ||
      allTasks.find((t) => !t.isLocked) ||
      allTasks[0];

    let targetPhase = contest.phases.find((p) => p.id === firstActiveTaskOpt?.phaseId) || contest.phases[0];
    let targetTask = targetPhase?.tasks?.find((t) => t.id === firstActiveTaskOpt?.id) || targetPhase?.tasks?.[0];
    let isRedirectedFromLocked = false;
    let redirectTargetTaskId: string | undefined = undefined;
    let lockedRedirectMessage: string | undefined = undefined;

    if (taskId) {
      const requestedTaskOpt = allTasks.find((t) => t.id === taskId);
      if (requestedTaskOpt && requestedTaskOpt.isLocked) {
        // SERVER-SIDE GUARD: Participant tried to access a locked unit directly via URL!
        // Redirect back to the current active unit
        isRedirectedFromLocked = true;
        redirectTargetTaskId = firstActiveTaskOpt?.id;
        lockedRedirectMessage = `Unit ${requestedTaskOpt.phaseNumber}.${requestedTaskOpt.taskNumber} is locked. Redirected to your active unit.`;

        if (firstActiveTaskOpt) {
          for (const p of contest.phases) {
            const found = p.tasks.find((t) => t.id === firstActiveTaskOpt.id);
            if (found) {
              targetPhase = p;
              targetTask = found;
              break;
            }
          }
        }
      } else {
        for (const p of contest.phases) {
          const found = p.tasks.find((t) => t.id === taskId);
          if (found) {
            targetPhase = p;
            targetTask = found;
            break;
          }
        }
      }
    }

    // 7. Graceful empty state when phase has no tasks
    if (!targetTask) {
      return {
        state: "NO_TASKS",
        emptyState: "NO_TASKS",
        message: `No active tasks found in phase "${targetPhase.title}".`,
        contestStatus: contest.status,
        contest: {
          id: contest.id,
          title: contest.title,
          slug: contest.slug,
          status: contest.status,
          startDate: contest.startDate.toISOString(),
          endDate: contest.endDate.toISOString(),
          endDateFormatted: contest.endDate.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
        },
        phase: {
          id: targetPhase.id,
          phaseNumber: targetPhase.phaseNumber,
          title: targetPhase.title,
          status: targetPhase.status,
          deadline: targetPhase.deadline.toISOString(),
        },
        task: {
          id: "",
          contestId: contest.id,
          title: "No Tasks Configured",
          instructions: "Tasks for this stage are currently being finalized.",
          totalPoints: 0,
          phaseTitle: `Phase ${targetPhase.phaseNumber}: ${targetPhase.title}`,
          contestTitle: contest.title,
          deadline: targetPhase.deadline.toISOString(),
          deadlineFormatted: targetPhase.deadline.toLocaleDateString(),
          secondsLeft: 0,
        },
        questions: [],
        submission: {
          id: "",
          status: "DRAFT",
          submittedAt: null,
          autoSavedAt: now2.toISOString(),
          answers: [],
        },
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
        phases: allPhases,
        allTasks: allTasks,
      };
    }

    // Authoritative effective deadline bounded by shared contest lifecycle rules
    const {
      effectiveDeadline,
      isConcluded: isContestEnded,
      secondsLeft,
    } = getAuthoritativeContestDeadline(contest, targetPhase, now2);

    // 8. Strict security: Strip answerKey from questions using sanitizeQuestionForParticipant
    const sanitizedQuestions = targetTask.questions.map((q) => sanitizeQuestionForParticipant(q));

    // 9. Ensure or fetch submission record
    let submission = await prisma.submission.findUnique({
      where: {
        taskId_userId: {
          taskId: targetTask.id,
          userId: user.id,
        },
      },
      include: {
        answers: true,
      },
    });

    if (!submission && !isContestEnded) {
      submission = await prisma.submission.create({
        data: {
          contestId: contest.id,
          phaseId: targetPhase.id,
          taskId: targetTask.id,
          userId: user.id,
          status: "DRAFT",
        },
        include: {
          answers: true,
        },
      });
    }

    // 10. Sanitize submission for participant (strips scores while contest is unpublished)
    const sanitizedSubmission = submission
      ? sanitizeSubmissionForParticipant(submission, contest.isPublished)
      : {
          id: "",
          status: "DRAFT",
          submittedAt: null,
          autoSavedAt: now2,
          answers: [],
        };

    const isSubmitted =
      sanitizedSubmission.status === "SUBMITTED" ||
      sanitizedSubmission.status === "GRADED" ||
      sanitizedSubmission.status === "PUBLISHED";

    const canSubmit = !isContestEnded && !isSubmitted && secondsLeft > 0;

    return {
      state: "READY",
      isContestEnded,
      canSubmit,
      contestStatus: contest.status,
      isRedirectedFromLocked,
      redirectTargetTaskId,
      lockedRedirectMessage,
      contest: {
        id: contest.id,
        title: contest.title,
        slug: contest.slug,
        track: contest.track,
        description: contest.description,
        status: contest.status,
        startDate: contest.startDate.toISOString(),
        endDate: contest.endDate.toISOString(),
        endDateFormatted: contest.endDate.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }),
        enforceSequentialProgress: contest.enforceSequentialProgress ?? true,
      },
      phase: {
        id: targetPhase.id,
        phaseNumber: targetPhase.phaseNumber,
        title: targetPhase.title,
        status: targetPhase.status,
        deadline: effectiveDeadline.toISOString(),
      },
      task: {
        id: targetTask.id,
        taskNumber: targetTask.taskNumber,
        contestId: contest.id,
        title: targetTask.title,
        instructions: targetTask.instructions,
        totalPoints: targetTask.totalPoints,
        phaseTitle: `Phase ${targetPhase.phaseNumber}: ${targetPhase.title}`,
        contestTitle: contest.title,
        deadline: effectiveDeadline.toISOString(),
        deadlineFormatted: effectiveDeadline.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }),
        secondsLeft,
        references: (targetTask.references || []).map((r) => ({
          id: r.id,
          title: r.title,
          fileKey: r.fileKey,
          fileSizeBytes: Number(r.fileSizeBytes),
          mimeType: r.mimeType,
          version: r.version,
        })),
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
        submittedAt: (sanitizedSubmission as unknown as { submittedAt?: Date | string | null }).submittedAt
          ? new Date(
              (sanitizedSubmission as unknown as { submittedAt?: Date | string }).submittedAt!
            ).toISOString()
          : null,
        autoSavedAt: (sanitizedSubmission as unknown as { autoSavedAt?: Date | string | null }).autoSavedAt
          ? new Date(
              (sanitizedSubmission as unknown as { autoSavedAt?: Date | string }).autoSavedAt!
            ).toISOString()
          : now2.toISOString(),
        answers: sanitizedSubmission.answers
          ? (
              sanitizedSubmission.answers as Array<{
                questionId: string;
                selectedOption?: string | null;
                writtenText?: string | null;
                fileName?: string | null;
                fileKey?: string | null;
                fileSizeBytes?: number | bigint | null;
                fileSha256?: string | null;
                wordCount?: number | null;
              }>
            ).map((a) => ({
              questionId: a.questionId,
              selectedOption: a.selectedOption ?? null,
              writtenText: a.writtenText ?? null,
              fileName: a.fileName ?? null,
              fileKey: a.fileKey ?? null,
              fileSizeBytes: a.fileSizeBytes ? Number(a.fileSizeBytes) : null,
              fileSha256: a.fileSha256 || null,
              wordCount: a.wordCount ?? null,
            }))
          : [],
      },
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
      phases: allPhases,
      allTasks: allTasks,
    };
  } catch (error) {
    console.error("Error getting task assessment data:", error);
    throw error;
  }
}

/**
 * Lightweight heartbeat query for real-time timer synchronization.
 * Computes authoritative Asia/Dhaka deadline and secondsLeft without payload bloat.
 */
export async function getContestDeadlineAction(contestId: string, phaseId?: string) {
  try {
    const contest = await prisma.contest.findUnique({
      where: { id: contestId },
      include: {
        phases: { orderBy: { phaseNumber: "asc" } },
      },
    });

    if (!contest) {
      return { success: false, error: "Contest not found." };
    }

    const targetPhase = phaseId
      ? contest.phases.find((p) => p.id === phaseId)
      : contest.phases.find((p) => p.status === "OPEN") || contest.phases[0];

    const now = new Date();
    const {
      effectiveDeadline,
      effectiveDeadlineMs,
      isConcluded,
      secondsLeft,
      controllingSource,
    } = getAuthoritativeContestDeadline(contest, targetPhase, now);

    return {
      success: true,
      contestId: contest.id,
      phaseId: targetPhase?.id,
      deadline: effectiveDeadline.toISOString(),
      deadlineMs: effectiveDeadlineMs,
      secondsLeft,
      isConcluded,
      contestStatus: contest.status,
      controllingSource,
      formattedDhaka: effectiveDeadline.toLocaleString("en-US", {
        timeZone: "Asia/Dhaka",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }),
    };
  } catch (error) {
    console.error("Error getting contest deadline:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to get deadline",
    };
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
  }
) {
  try {
    const session = await requireRole(["PARTICIPANT"]);

    // 1. Verify submission exists and belongs to participant
    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        user: true,
        phase: true,
        contest: true,
      },
    });

    if (!submission) {
      return { success: false, error: "Submission session not found." };
    }

    if (submission.userId !== session.userId) {
      return { success: false, error: "Unauthorized access: Cross-user submission modification is blocked." };
    }

    const isSubmitted =
      submission.status === "SUBMITTED" ||
      submission.status === "GRADED" ||
      submission.status === "PUBLISHED";
    if (isSubmitted) {
      return { success: false, error: "Assessment has already been finalized and locked." };
    }

    const now = new Date();
    // Check contest lifecycle status
    if (isContestConcluded(submission.contest, now)) {
      return { success: false, error: "Contest has concluded. Edits and submissions are locked." };
    }

    // 2. Server-side deadline check (60s network grace period)
    const { effectiveDeadline } = getAuthoritativeContestDeadline(
      submission.contest,
      submission.phase,
      now
    );
    const deadlineCheck = checkSubmissionDeadline(effectiveDeadline, now, 60);
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

export async function submitAssessmentAction(submissionId: string) {
  try {
    const session = await requireRole(["PARTICIPANT"]);

    // 1. Fetch submission with task, phase, and answers
    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        user: true,
        phase: true,
        contest: true,
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

    if (submission.userId !== session.userId) {
      return { success: false, error: "Unauthorized access: Cross-user submission finalization is blocked." };
    }

    // Helper to query contest progression and detect if this is the final contest task
    async function determineContestProgression(targetContestId: string, targetTaskId: string, targetUserId: string) {
      const contestStructure = await prisma.contest.findUnique({
        where: { id: targetContestId },
        include: {
          phases: {
            orderBy: { phaseNumber: "asc" },
            include: {
              tasks: {
                orderBy: { taskNumber: "asc" },
                select: { id: true, phaseId: true, taskNumber: true },
              },
            },
          },
        },
      });

      const allTasksFlat: Array<{ id: string; phaseId: string; taskNumber: number; phaseNumber: number }> = [];
      if (contestStructure) {
        for (const ph of contestStructure.phases) {
          for (const t of ph.tasks) {
            allTasksFlat.push({
              id: t.id,
              phaseId: ph.id,
              taskNumber: t.taskNumber,
              phaseNumber: ph.phaseNumber,
            });
          }
        }
      }

      const currentTaskIndex = allTasksFlat.findIndex((t) => t.id === targetTaskId);
      const isLastTask = currentTaskIndex >= 0 && currentTaskIndex === allTasksFlat.length - 1;

      const candidateSubmissions = await prisma.submission.findMany({
        where: {
          contestId: targetContestId,
          userId: targetUserId,
        },
        select: { taskId: true, status: true },
      });

      const submittedTaskIds = new Set(
        candidateSubmissions
          .filter((s) => s.status === "SUBMITTED" || s.status === "GRADED" || s.status === "PUBLISHED" || s.taskId === targetTaskId)
          .map((s) => s.taskId)
      );

      const allContestTasksSubmitted = allTasksFlat.length > 0 && allTasksFlat.every((t) => submittedTaskIds.has(t.id));

      // Find next required unsubmitted task
      const nextUnsubmittedAfterCurrent = currentTaskIndex >= 0
        ? allTasksFlat.slice(currentTaskIndex + 1).find((t) => !submittedTaskIds.has(t.id))
        : undefined;

      const firstUnsubmitted = allTasksFlat.find((t) => !submittedTaskIds.has(t.id));

      const nextTask =
        nextUnsubmittedAfterCurrent ||
        firstUnsubmitted ||
        (!allContestTasksSubmitted && currentTaskIndex >= 0 && currentTaskIndex < allTasksFlat.length - 1
          ? allTasksFlat[currentTaskIndex + 1]
          : null);

      const isFinal = allContestTasksSubmitted || (isLastTask && !nextTask);

      return {
        isFinalSubmission: isFinal,
        nextTaskId: !isFinal ? nextTask?.id : undefined,
        nextPhaseId: !isFinal ? nextTask?.phaseId : undefined,
      };
    }

    const isSubmitted =
      submission.status === "SUBMITTED" ||
      submission.status === "GRADED" ||
      submission.status === "PUBLISHED";

    if (isSubmitted) {
      const prog = await determineContestProgression(submission.contestId, submission.taskId, submission.userId);
      return {
        success: true,
        message: "Already submitted.",
        status: submission.status,
        submittedAt: submission.submittedAt ? submission.submittedAt.toISOString() : new Date().toISOString(),
        isFinalSubmission: prog.isFinalSubmission,
        contestId: submission.contestId,
        nextTaskId: prog.nextTaskId,
        nextPhaseId: prog.nextPhaseId,
      };
    }

    const now = new Date();
    // Check contest lifecycle status
    if (isContestConcluded(submission.contest, now)) {
      return { success: false, error: "Contest has concluded. Further submissions are closed." };
    }

    // 2. Server-side deadline check
    const { effectiveDeadline } = getAuthoritativeContestDeadline(
      submission.contest,
      submission.phase,
      now
    );
    const deadlineCheck = checkSubmissionDeadline(effectiveDeadline, now, 60);
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

    // 6. Compute progression to guide redirect vs advancement
    const progression = await determineContestProgression(submission.contestId, submission.taskId, submission.userId);

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

    safeRevalidatePath("/assessment");
    safeRevalidatePath("/assessment", "layout");
    safeRevalidatePath("/dashboard");
    safeRevalidatePath("/dashboard", "layout");
    safeRevalidatePath(`/dashboard/contests/${submission.contestId}`);
    safeRevalidatePath(`/dashboard/leaderboard`);
    safeRevalidatePath(`/assessment/${submission.contestId}/${submission.phaseId}/${submission.taskId}`);
    safeRevalidatePath("/admin/contests");
    safeRevalidatePath("/admin/submissions");

    return {
      success: true,
      status: updated.status,
      submittedAt: submittedAt.toISOString(),
      isLate,
      isFinalSubmission: progression.isFinalSubmission,
      contestId: submission.contestId,
      nextTaskId: progression.nextTaskId,
      nextPhaseId: progression.nextPhaseId,
    };
  } catch (error) {
    console.error("Error submitting assessment:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to submit assessment" };
  }
}
