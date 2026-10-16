import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { setTestSession } from "../lib/auth";
import { UserRole, ContestStatus, PhaseStatus, QuestionType } from "@prisma/client";
import {
  getTaskAssessmentData,
  getParticipantDashboard,
  saveAnswerDraftAction,
  submitAssessmentAction,
} from "../app/actions/assessment-actions";
import { updateContestAction } from "../app/actions/contest-actions";
import { isContestUpcoming } from "../lib/contest-lifecycle";

describe("Workflow Fixes: Completion Detection, Pre-Contest Gate, and Sequential Progression", () => {
  const contestId = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
  const candidateEmail = "workflow.candidate@test.aciedge.edu";
  let candidateUserId = "";
  let phase1Id = "";
  let phase2Id = "";
  let task11Id = "";
  let task12Id = "";
  let task21Id = "";
  let task22Id = "";

  before(async () => {
    // 1. Create or upsert test candidate
    const user = await prisma.user.upsert({
      where: { email: candidateEmail },
      update: { role: UserRole.PARTICIPANT },
      create: {
        id: "10000000-0000-4000-8000-000000000099",
        email: candidateEmail,
        name: "Workflow Test Candidate",
        candidateId: "CAND-WORKFLOW-01",
        role: UserRole.PARTICIPANT,
      },
    });
    candidateUserId = user.id;

    // 2. Create or upsert test contest
    await prisma.contest.upsert({
      where: { id: contestId },
      update: {
        title: "Workflow Progression Benchmark Contest",
        track: "Executive Strategy",
        status: ContestStatus.LIVE,
        startDate: new Date("2025-01-01T00:00:00Z"),
        endDate: new Date("2026-12-31T23:59:59Z"),
        enforceSequentialProgress: true,
      },
      create: {
        id: contestId,
        slug: "workflow-progression-benchmark-contest",
        title: "Workflow Progression Benchmark Contest",
        track: "Executive Strategy",
        status: ContestStatus.LIVE,
        startDate: new Date("2025-01-01T00:00:00Z"),
        endDate: new Date("2026-12-31T23:59:59Z"),
        enforceSequentialProgress: true,
      },
    });

    // 3. Enroll candidate
    await prisma.contestParticipant.upsert({
      where: {
        contestId_userId: {
          contestId,
          userId: candidateUserId,
        },
      },
      update: { status: "ACTIVE" },
      create: {
        contestId,
        userId: candidateUserId,
        status: "ACTIVE",
      },
    });

    // 4. Create Phase 1 and Phase 2
    const p1 = await prisma.phase.upsert({
      where: { contestId_phaseNumber: { contestId, phaseNumber: 1 } },
      update: { status: PhaseStatus.OPEN },
      create: {
        contestId,
        phaseNumber: 1,
        title: "Phase 1: Foundation",
        weightPercentage: 50,
        deadline: new Date("2026-12-01T00:00:00Z"),
        status: PhaseStatus.OPEN,
      },
    });
    phase1Id = p1.id;

    const p2 = await prisma.phase.upsert({
      where: { contestId_phaseNumber: { contestId, phaseNumber: 2 } },
      update: { status: PhaseStatus.OPEN },
      create: {
        contestId,
        phaseNumber: 2,
        title: "Phase 2: Execution",
        weightPercentage: 50,
        deadline: new Date("2026-12-15T00:00:00Z"),
        status: PhaseStatus.OPEN,
      },
    });
    phase2Id = p2.id;

    // 5. Create 4 Tasks (2 in Phase 1, 2 in Phase 2)
    const t11 = await prisma.task.upsert({
      where: { phaseId_taskNumber: { phaseId: phase1Id, taskNumber: 1 } },
      update: {},
      create: {
        phaseId: phase1Id,
        taskNumber: 1,
        title: "Task 1.1 MCQ Diagnostics",
        totalPoints: 25,
      },
    });
    task11Id = t11.id;

    const t12 = await prisma.task.upsert({
      where: { phaseId_taskNumber: { phaseId: phase1Id, taskNumber: 2 } },
      update: {},
      create: {
        phaseId: phase1Id,
        taskNumber: 2,
        title: "Task 1.2 Strategy PDF Deliverable",
        totalPoints: 25,
      },
    });
    task12Id = t12.id;

    const t21 = await prisma.task.upsert({
      where: { phaseId_taskNumber: { phaseId: phase2Id, taskNumber: 1 } },
      update: {},
      create: {
        phaseId: phase2Id,
        taskNumber: 1,
        title: "Task 2.1 Operational Essay",
        totalPoints: 25,
      },
    });
    task21Id = t21.id;

    const t22 = await prisma.task.upsert({
      where: { phaseId_taskNumber: { phaseId: phase2Id, taskNumber: 2 } },
      update: {},
      create: {
        phaseId: phase2Id,
        taskNumber: 2,
        title: "Task 2.2 Case Synthesis PDF",
        totalPoints: 25,
      },
    });
    task22Id = t22.id;

    // 6. Ensure questions on all 4 tasks
    const existingQ11 = await prisma.question.findFirst({ where: { taskId: task11Id, questionNumber: 1 } });
    if (!existingQ11) {
      await prisma.question.create({
        data: {
          taskId: task11Id,
          questionNumber: 1,
          type: QuestionType.MCQ,
          prompt: "Select strategy direction",
          points: 25,
          options: {
            create: [
              { optionKey: "A", text: "Organic Expansion" },
              { optionKey: "B", text: "Acquisition" },
            ],
          },
        },
      });
    }

    const existingQ12 = await prisma.question.findFirst({ where: { taskId: task12Id, questionNumber: 1 } });
    if (!existingQ12) {
      await prisma.question.create({
        data: {
          taskId: task12Id,
          questionNumber: 1,
          type: QuestionType.FILE_UPLOAD,
          prompt: "Upload Phase 1 Strategy PDF",
          points: 25,
        },
      });
    }

    const existingQ21 = await prisma.question.findFirst({ where: { taskId: task21Id, questionNumber: 1 } });
    if (!existingQ21) {
      await prisma.question.create({
        data: {
          taskId: task21Id,
          questionNumber: 1,
          type: QuestionType.WRITTEN,
          prompt: "Write execution rationale",
          points: 25,
        },
      });
    }

    const existingQ22 = await prisma.question.findFirst({ where: { taskId: task22Id, questionNumber: 1 } });
    if (!existingQ22) {
      await prisma.question.create({
        data: {
          taskId: task22Id,
          questionNumber: 1,
          type: QuestionType.FILE_UPLOAD,
          prompt: "Upload Phase 2 Synthesis PDF",
          points: 25,
        },
      });
    }

    // Clean any prior submissions for this candidate
    await prisma.submission.deleteMany({
      where: { contestId, userId: candidateUserId },
    });
  });

  test("1. Fresh contest with sequential progression locks subsequent tasks and Phase 2", async () => {
    setTestSession({
      userId: candidateUserId,
      email: candidateEmail,
      role: "PARTICIPANT",
      name: "Workflow Test Candidate",
    });

    const data = await getTaskAssessmentData(contestId);
    assert.equal(data.state, "READY");

    const allTasks = data.allTasks || [];
    assert.equal(allTasks.length, 4, "Must have 4 units");

    const unit11 = allTasks.find((t) => t.id === task11Id);
    const unit12 = allTasks.find((t) => t.id === task12Id);
    const unit21 = allTasks.find((t) => t.id === task21Id);
    const unit22 = allTasks.find((t) => t.id === task22Id);

    // Unit 1.1 must be unlocked
    assert.equal(unit11?.isLocked, false, "Unit 1.1 must be unlocked");
    assert.equal(unit11?.isSubmitted, false);

    // Unit 1.2 must be locked
    assert.equal(unit12?.isLocked, true, "Unit 1.2 must be locked until Unit 1.1 is completed");
    assert.ok(unit12?.unlockRequirementText?.includes("Unit 1.1"));

    // Phase 2 tasks must be locked
    assert.equal(unit21?.isLocked, true, "Unit 2.1 must be locked");
    assert.equal(unit22?.isLocked, true, "Unit 2.2 must be locked");

    // Phase 2 must be locked
    const phase2 = data.phases?.find((p) => p.id === phase2Id);
    assert.equal(phase2?.isLocked, true, "Phase 2 must be locked until Phase 1 is done");
  });

  test("2. Direct URL access to locked unit redirects back to current active unit", async () => {
    setTestSession({
      userId: candidateUserId,
      email: candidateEmail,
      role: "PARTICIPANT",
      name: "Workflow Test Candidate",
    });

    // Participant tries to access locked task 2.1 directly
    const data = await getTaskAssessmentData(contestId, task21Id);

    assert.equal(data.state, "READY");
    assert.equal(data.isRedirectedFromLocked, true, "Must flag redirection from locked unit");
    assert.equal(data.redirectTargetTaskId, task11Id, "Must redirect to active Unit 1.1");
    assert.equal(data.task.id, task11Id, "Target task must be resolved as Unit 1.1");
  });

  test("3. Auto-finalizing or completing all 4 units results in 4 of 4 completed (100%)", async () => {
    setTestSession({
      userId: candidateUserId,
      email: candidateEmail,
      role: "PARTICIPANT",
      name: "Workflow Test Candidate",
    });

    // Step 1: Complete Unit 1.1
    const data11 = await getTaskAssessmentData(contestId, task11Id);
    assert.ok(data11.submission?.id);
    const q11 = data11.questions[0];
    await saveAnswerDraftAction(data11.submission.id, q11.id, { selectedOption: "A" });
    await submitAssessmentAction(data11.submission.id);

    // Step 2: Now Unit 1.2 should be unlocked
    const data12 = await getTaskAssessmentData(contestId, task12Id);
    assert.equal(data12.task.id, task12Id, "Unit 1.2 should now be accessible");
    assert.ok(data12.submission?.id);
    const q12 = data12.questions[0];
    await saveAnswerDraftAction(data12.submission.id, q12.id, {
      fileName: "strategy.pdf",
      fileKey: "mock-strategy-key",
    });
    await submitAssessmentAction(data12.submission.id);

    // Step 3: Phase 1 is complete! Phase 2 (Unit 2.1) unlocks
    const data21 = await getTaskAssessmentData(contestId, task21Id);
    assert.equal(data21.task.id, task21Id, "Unit 2.1 should now be unlocked");
    assert.ok(data21.submission?.id);
    const q21 = data21.questions[0];
    await saveAnswerDraftAction(data21.submission.id, q21.id, {
      writtenText: "This is a detailed operational execution essay meeting all criteria.",
    });
    await submitAssessmentAction(data21.submission.id);

    // Step 4: Unit 2.2 unlocks
    const data22 = await getTaskAssessmentData(contestId, task22Id);
    assert.equal(data22.task.id, task22Id, "Unit 2.2 should now be unlocked");
    assert.ok(data22.submission?.id);
    const q22 = data22.questions[0];
    await saveAnswerDraftAction(data22.submission.id, q22.id, {
      fileName: "case-synthesis.pdf",
      fileKey: "mock-synthesis-key",
    });
    await submitAssessmentAction(data22.submission.id);

    // Verify Dashboard progress: all 4 units completed (100%)
    const dashboard = await getParticipantDashboard(candidateEmail);
    const contestCard = dashboard.contests.find((c) => c.contestId === contestId);

    assert.ok(contestCard);
    assert.equal(contestCard.totalTasks, 4);
    assert.equal(contestCard.completedTasks, 4, "Must show 4 of 4 completed");
    assert.equal(contestCard.progressPercent, 100, "Progress must be 100%");
    assert.equal(contestCard.status, "SUBMITTED");

    // Verify all 4 units in getTaskAssessmentData show isSubmitted === true
    const finalData = await getTaskAssessmentData(contestId);
    const finalTasks = finalData.allTasks || [];
    assert.equal(finalTasks.length, 4);
    assert.ok(finalTasks.every((t) => t.isSubmitted === true), "All 4 units must be isSubmitted === true");
  });

  test("4. Pre-Contest Gate: Contest starting in future returns CONTEST_NOT_STARTED and blocks tasks", async () => {
    setTestSession({
      userId: candidateUserId,
      email: candidateEmail,
      role: "ADMIN",
      name: "Platform Admin",
    });

    // Update contest start date 2 hours into the future
    const futureDate = new Date(Date.now() + 2 * 60 * 60 * 1000);
    await updateContestAction(contestId, {
      startDate: futureDate.toISOString(),
      status: "LIVE",
    });

    // Switch back to participant
    setTestSession({
      userId: candidateUserId,
      email: candidateEmail,
      role: "PARTICIPANT",
      name: "Workflow Test Candidate",
    });

    const contestRecord = await prisma.contest.findUnique({ where: { id: contestId } });
    assert.ok(contestRecord);
    const upcoming = isContestUpcoming(contestRecord, new Date());
    assert.equal(upcoming, true, "isContestUpcoming must return true for future start date");

    const data = await getTaskAssessmentData(contestId);
    assert.equal(data.state, "CONTEST_NOT_STARTED", "State must be CONTEST_NOT_STARTED");
    assert.equal(data.isContestUpcoming, true);
    assert.ok(data.secondsUntilStart && data.secondsUntilStart > 0);
    assert.equal(data.phases?.length || 0, 0, "No phases must be returned when upcoming");
    assert.equal(data.allTasks?.length || 0, 0, "No tasks must be returned when upcoming");

    // Reset contest start date to past for clean teardown
    setTestSession({
      userId: candidateUserId,
      email: candidateEmail,
      role: "ADMIN",
      name: "Platform Admin",
    });
    await updateContestAction(contestId, {
      startDate: new Date("2025-01-01T00:00:00Z").toISOString(),
      status: "LIVE",
    });
  });

  test("5. Disabling sequential progression unlocks all tasks for flexible access", async () => {
    setTestSession({
      userId: candidateUserId,
      email: candidateEmail,
      role: "ADMIN",
      name: "Platform Admin",
    });

    // Disable sequential progression
    await updateContestAction(contestId, {
      enforceSequentialProgress: false,
    });

    // Switch to participant
    setTestSession({
      userId: candidateUserId,
      email: candidateEmail,
      role: "PARTICIPANT",
      name: "Workflow Test Candidate",
    });

    const data = await getTaskAssessmentData(contestId);
    const allTasks = data.allTasks || [];

    // All units must have isLocked === false
    for (const t of allTasks) {
      assert.equal(t.isLocked, false, `Unit ${t.taskNumber} must be unlocked when sequential progress is disabled`);
    }
  });
});
