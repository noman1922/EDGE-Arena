import { prisma } from "../lib/prisma";
import { UserRole, ContestStatus, PhaseStatus, QuestionType } from "@prisma/client";

export const PILOT_CONTEST_ID = "f276718f-528b-47f6-9ae7-b32549840aaf";
export const PILOT_PARTICIPANT_EMAIL = "s.jenkins@campus.edu";
export const PILOT_EVALUATOR_EMAIL = "evaluator.demo@example.com";
export const PILOT_ADMIN_EMAIL = "admin.demo@example.com";

export const TASK_12_ID = "60e233e5-9d1f-4c2e-96c3-d7603f0a1fa0";
export const TASK_21_ID = "92e1c776-68c9-46c5-882b-797c05e2f6b7";

export async function ensurePilotContest() {
  // Ensure users
  try {
    await prisma.user.upsert({
      where: { id: "00000000-0000-4000-8000-000000000000" },
      update: { email: PILOT_ADMIN_EMAIL, role: UserRole.ADMIN },
      create: {
        id: "00000000-0000-4000-8000-000000000000",
        email: PILOT_ADMIN_EMAIL,
        name: "Platform Administrator",
        role: UserRole.ADMIN,
      },
    });
  } catch {
    // Parallel test suite worker already created admin
  }

  try {
    await prisma.user.upsert({
      where: { id: "00000000-0000-4000-8000-000000000001" },
      update: { email: PILOT_EVALUATOR_EMAIL, role: UserRole.EVALUATOR },
      create: {
        id: "00000000-0000-4000-8000-000000000001",
        email: PILOT_EVALUATOR_EMAIL,
        name: "Demo Evaluator",
        role: UserRole.EVALUATOR,
      },
    });
  } catch {
    // Parallel test suite worker already created evaluator
  }

  let participant = await prisma.user.findFirst({ where: { email: PILOT_PARTICIPANT_EMAIL } });
  if (!participant) {
    try {
      participant = await prisma.user.create({
        data: {
          id: "00000000-0000-4000-8000-000000000002",
          email: PILOT_PARTICIPANT_EMAIL,
          name: "Sarah Jenkins",
          candidateId: "CAND-SARAH-001",
          role: UserRole.PARTICIPANT,
        },
      });
    } catch {
      participant = await prisma.user.findFirst({ where: { email: PILOT_PARTICIPANT_EMAIL } });
    }
  }

  // Ensure contest
  await prisma.contest.upsert({
    where: { id: PILOT_CONTEST_ID },
    update: {
      status: ContestStatus.LIVE,
      startDate: new Date("2025-01-01T00:00:00Z"),
      endDate: new Date("2026-12-31T23:59:59Z"),
      enforceSequentialProgress: true,
    },
    create: {
      id: PILOT_CONTEST_ID,
      title: "ACI Career EDGE Campus Leader Pilot 2026",
      slug: "aci-career-edge-campus-leader-pilot-2026",
      track: "Strategic Operations",
      status: ContestStatus.LIVE,
      startDate: new Date("2025-01-01T00:00:00Z"),
      endDate: new Date("2026-12-31T23:59:59Z"),
      enforceSequentialProgress: true,
    },
  });

  const participantId = participant?.id || "00000000-0000-4000-8000-000000000002";

  // Enroll participant
  await prisma.contestParticipant.upsert({
    where: {
      contestId_userId: {
        contestId: PILOT_CONTEST_ID,
        userId: participantId,
      },
    },
    update: { status: "ACTIVE" },
    create: {
      contestId: PILOT_CONTEST_ID,
      userId: participantId,
      status: "ACTIVE",
    },
  });

  // Ensure Phase 1
  const phase1 = await prisma.phase.upsert({
    where: {
      contestId_phaseNumber: {
        contestId: PILOT_CONTEST_ID,
        phaseNumber: 1,
      },
    },
    update: {
      status: PhaseStatus.OPEN,
    },
    create: {
      contestId: PILOT_CONTEST_ID,
      phaseNumber: 1,
      title: "Phase 1: Diagnostic Assessment",
      weightPercentage: 50,
      deadline: new Date("2026-11-30T23:59:59Z"),
      status: PhaseStatus.OPEN,
    },
  });

  // Ensure Phase 2
  const phase2 = await prisma.phase.upsert({
    where: {
      contestId_phaseNumber: {
        contestId: PILOT_CONTEST_ID,
        phaseNumber: 2,
      },
    },
    update: {},
    create: {
      contestId: PILOT_CONTEST_ID,
      phaseNumber: 2,
      title: "Phase 2: Strategy Proposal",
      weightPercentage: 50,
      deadline: new Date("2026-12-15T23:59:59Z"),
      status: PhaseStatus.UPCOMING,
    },
  });

  // Ensure Tasks in Phase 1
  const task11 = await prisma.task.upsert({
    where: {
      phaseId_taskNumber: {
        phaseId: phase1.id,
        taskNumber: 1,
      },
    },
    update: {},
    create: {
      phaseId: phase1.id,
      taskNumber: 1,
      title: "Task 1.1 MCQ Diagnostic",
      totalPoints: 25,
    },
  });

  const existingQ11 = await prisma.question.findFirst({
    where: { taskId: task11.id, questionNumber: 1 },
  });
  if (!existingQ11) {
    await prisma.question.create({
      data: {
        taskId: task11.id,
        questionNumber: 1,
        type: QuestionType.MCQ,
        prompt: "Pilot question 1 prompt",
        points: 25,
        options: {
          create: [
            { optionKey: "A", text: "Option A" },
            { optionKey: "B", text: "Option B" },
          ],
        },
      },
    });
  }

  const task12 = await prisma.task.upsert({
    where: { id: TASK_12_ID },
    update: {
      phaseId: phase1.id,
      taskNumber: 2,
    },
    create: {
      id: TASK_12_ID,
      phaseId: phase1.id,
      taskNumber: 2,
      title: "Task 1.2 PDF Report",
      totalPoints: 25,
    },
  });

  const existingQ12 = await prisma.question.findFirst({
    where: { taskId: task12.id, questionNumber: 1 },
  });
  if (!existingQ12) {
    await prisma.question.create({
      data: {
        taskId: task12.id,
        questionNumber: 1,
        type: QuestionType.FILE_UPLOAD,
        prompt: "Upload Phase 1 Report PDF",
        points: 25,
      },
    });
  }

  // Ensure Tasks in Phase 2
  const task21 = await prisma.task.upsert({
    where: { id: TASK_21_ID },
    update: {
      phaseId: phase2.id,
      taskNumber: 1,
    },
    create: {
      id: TASK_21_ID,
      phaseId: phase2.id,
      taskNumber: 1,
      title: "Task 2.1 Essay",
      totalPoints: 25,
    },
  });

  const existingQ21 = await prisma.question.findFirst({
    where: { taskId: task21.id, questionNumber: 1 },
  });
  if (!existingQ21) {
    await prisma.question.create({
      data: {
        taskId: task21.id,
        questionNumber: 1,
        type: QuestionType.WRITTEN,
        prompt: "Write operational strategy essay",
        points: 25,
      },
    });
  }

  try {
    await prisma.task.upsert({
      where: {
        phaseId_taskNumber: {
          phaseId: phase2.id,
          taskNumber: 2,
        },
      },
      update: {},
      create: {
        phaseId: phase2.id,
        taskNumber: 2,
        title: "Task 2.2 PDF Deliverable",
        totalPoints: 25,
      },
    });
  } catch {
    // Handled race condition in concurrent test executions
  }
}
