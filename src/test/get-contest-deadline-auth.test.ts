import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { prisma } from "../lib/prisma";
import { setTestSession } from "../lib/auth";
import { getContestDeadlineAction } from "../app/actions/assessment-actions";

describe("Security Hardening: getContestDeadlineAction Authorization & Isolation", () => {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  const adminId = crypto.randomUUID();
  const inactiveAdminId = crypto.randomUUID();
  const evalAssignedId = crypto.randomUUID();
  const evalContestOnlyId = crypto.randomUUID();
  const evalUnassignedId = crypto.randomUUID();
  const partAId = crypto.randomUUID();
  const partA2Id = crypto.randomUUID();
  const partNonEnrolledId = crypto.randomUUID();

  const contest1Id = crypto.randomUUID();
  const contest2Id = crypto.randomUUID();
  const phase1AId = crypto.randomUUID();
  const phase1BId = crypto.randomUUID();
  const phase2AId = crypto.randomUUID();
  const task1AId = crypto.randomUUID();
  const task1A2Id = crypto.randomUUID();
  const task2AId = crypto.randomUUID();
  const mcqQ1Id = crypto.randomUUID();

  const subPartAExpiredId = crypto.randomUUID();
  const subPartA2ActiveId = crypto.randomUUID();
  const subPartAContest2Id = crypto.randomUUID();

  before(async () => {
    const now = new Date();
    const pastStart = new Date(now.getTime() - 2 * 24 * 3600 * 1000);
    const futureEnd = new Date(now.getTime() + 5 * 24 * 3600 * 1000);
    const futurePhase = new Date(now.getTime() + 3 * 24 * 3600 * 1000);

    await prisma.user.createMany({
      data: [
        {
          id: adminId,
          email: `deadline.admin.${suffix}@edge-test.internal`,
          name: "Deadline Test Admin",
          role: "ADMIN",
          isActive: true,
        },
        {
          id: inactiveAdminId,
          email: `deadline.inactive.admin.${suffix}@edge-test.internal`,
          name: "Inactive Admin",
          role: "ADMIN",
          isActive: false,
        },
        {
          id: evalAssignedId,
          email: `deadline.eval.assigned.${suffix}@edge-test.internal`,
          name: "Assigned Evaluator",
          role: "EVALUATOR",
          isActive: true,
        },
        {
          id: evalContestOnlyId,
          email: `deadline.eval.contestonly.${suffix}@edge-test.internal`,
          name: "Contest-Only Evaluator",
          role: "EVALUATOR",
          isActive: true,
        },
        {
          id: evalUnassignedId,
          email: `deadline.eval.unassigned.${suffix}@edge-test.internal`,
          name: "Unassigned Evaluator",
          role: "EVALUATOR",
          isActive: true,
        },
        {
          id: partAId,
          email: `deadline.parta.${suffix}@edge-test.internal`,
          name: "Participant Alpha",
          role: "PARTICIPANT",
          candidateId: `DL-A-${suffix}`,
          isActive: true,
        },
        {
          id: partA2Id,
          email: `deadline.parta2.${suffix}@edge-test.internal`,
          name: "Participant Alpha Two",
          role: "PARTICIPANT",
          candidateId: `DL-A2-${suffix}`,
          isActive: true,
        },
        {
          id: partNonEnrolledId,
          email: `deadline.nonenrolled.${suffix}@edge-test.internal`,
          name: "Non-Enrolled User",
          role: "PARTICIPANT",
          candidateId: `DL-NE-${suffix}`,
          isActive: true,
        },
      ],
    });

    await prisma.contest.create({
      data: {
        id: contest1Id,
        slug: `dl-contest-1-${suffix}`,
        title: "Deadline Auth Test Contest 1",
        track: "Strategy",
        status: "LIVE",
        startDate: pastStart,
        endDate: futureEnd,
      },
    });

    await prisma.contest.create({
      data: {
        id: contest2Id,
        slug: `dl-contest-2-${suffix}`,
        title: "Deadline Auth Test Contest 2",
        track: "Finance",
        status: "LIVE",
        startDate: pastStart,
        endDate: futureEnd,
      },
    });

    await prisma.phase.createMany({
      data: [
        {
          id: phase1AId,
          contestId: contest1Id,
          phaseNumber: 1,
          title: "Phase 1A",
          weightPercentage: 50,
          deadline: futurePhase,
          durationMinutes: 60,
          status: "OPEN",
        },
        {
          id: phase1BId,
          contestId: contest1Id,
          phaseNumber: 2,
          title: "Phase 1B",
          weightPercentage: 50,
          deadline: futurePhase,
          durationMinutes: 45,
          status: "UPCOMING",
        },
        {
          id: phase2AId,
          contestId: contest2Id,
          phaseNumber: 1,
          title: "Phase 2A",
          weightPercentage: 100,
          deadline: futurePhase,
          status: "OPEN",
        },
      ],
    });

    await prisma.task.createMany({
      data: [
        {
          id: task1AId,
          phaseId: phase1AId,
          taskNumber: 1,
          title: "Task 1A",
          totalPoints: 20,
          durationMinutes: 15,
        },
        {
          id: task1A2Id,
          phaseId: phase1AId,
          taskNumber: 2,
          title: "Task 1A2",
          totalPoints: 20,
          durationMinutes: 30,
        },
        {
          id: task2AId,
          phaseId: phase2AId,
          taskNumber: 1,
          title: "Task 2A",
          totalPoints: 20,
        },
      ],
    });

    await prisma.question.create({
      data: {
        id: mcqQ1Id,
        taskId: task1AId,
        questionNumber: 1,
        type: "MCQ",
        prompt: "Test MCQ Question",
        points: 20,
        options: {
          create: [
            { optionKey: "A", text: "Wrong" },
            { optionKey: "B", text: "Right" },
          ],
        },
        answerKey: {
          create: { correctOptionKey: "B" },
        },
      },
    });

    // Enroll partA & partA2 in contest1; partA also in contest2; partNonEnrolled in neither
    await prisma.contestParticipant.createMany({
      data: [
        { contestId: contest1Id, userId: partAId, status: "ACTIVE" },
        { contestId: contest1Id, userId: partA2Id, status: "ENROLLED" },
        { contestId: contest2Id, userId: partAId, status: "ACTIVE" },
      ],
    });

    // Evaluator assignments in Contest 1
    const ceAssigned = await prisma.contestEvaluator.create({
      data: { contestId: contest1Id, userId: evalAssignedId },
    });
    await prisma.contestEvaluator.create({
      data: { contestId: contest1Id, userId: evalContestOnlyId },
    });
    await prisma.evaluatorCandidateAssignment.create({
      data: {
        contestId: contest1Id,
        contestEvaluatorId: ceAssigned.id,
        evaluatorId: evalAssignedId,
        participantId: partAId,
      },
    });

    // Hierarchical PhaseAttempts
    await prisma.phaseAttempt.createMany({
      data: [
        {
          contestId: contest1Id,
          phaseId: phase1AId,
          userId: partAId,
          status: "IN_PROGRESS",
          startedAt: new Date(now.getTime() - 25 * 60 * 1000),
          expiresAt: new Date(now.getTime() + 35 * 60 * 1000),
        },
        {
          contestId: contest1Id,
          phaseId: phase1AId,
          userId: partA2Id,
          status: "IN_PROGRESS",
          startedAt: new Date(now.getTime() - 5 * 60 * 1000),
          expiresAt: new Date(now.getTime() + 55 * 60 * 1000),
        },
      ],
    });

    // Submissions: Participant A has an expired DRAFT submission in Contest 1; Participant A2 has an active DRAFT
    await prisma.submission.create({
      data: {
        id: subPartAExpiredId,
        contestId: contest1Id,
        phaseId: phase1AId,
        taskId: task1AId,
        userId: partAId,
        status: "DRAFT",
        startedAt: new Date(now.getTime() - 20 * 60 * 1000),
        expiresAt: new Date(now.getTime() - 5 * 60 * 1000), // expired 5 mins ago
        answers: {
          create: {
            questionId: mcqQ1Id,
            selectedOption: "B",
          },
        },
      },
    });

    await prisma.submission.create({
      data: {
        id: subPartA2ActiveId,
        contestId: contest1Id,
        phaseId: phase1AId,
        taskId: task1A2Id,
        userId: partA2Id,
        status: "DRAFT",
        startedAt: new Date(now.getTime() - 5 * 60 * 1000),
        expiresAt: new Date(now.getTime() + 25 * 60 * 1000),
      },
    });

    await prisma.submission.create({
      data: {
        id: subPartAContest2Id,
        contestId: contest2Id,
        phaseId: phase2AId,
        taskId: task2AId,
        userId: partAId,
        status: "DRAFT",
        startedAt: now,
      },
    });
  });

  after(async () => {
    setTestSession(undefined);
    await prisma.contest.deleteMany({ where: { id: { in: [contest1Id, contest2Id] } } });
    await prisma.user.deleteMany({
      where: {
        id: {
          in: [
            adminId,
            inactiveAdminId,
            evalAssignedId,
            evalContestOnlyId,
            evalUnassignedId,
            partAId,
            partA2Id,
            partNonEnrolledId,
          ],
        },
      },
    });
  });

  test("1. Unauthenticated request is rejected and never finalizes expired submission", async () => {
    setTestSession(null);
    const res = await getContestDeadlineAction(contest1Id, phase1AId, task1AId, subPartAExpiredId);
    assert.equal(res.success, false);
    assert.match(res.error || "", /Unauthorized/i);
    assert.equal(res.deadline, undefined);

    const subAfter = await prisma.submission.findUnique({ where: { id: subPartAExpiredId } });
    assert.equal(subAfter?.status, "DRAFT", "Unauthenticated call must never finalize submission");
  });

  test("2. Non-enrolled participant is rejected and never finalizes submission", async () => {
    setTestSession({
      userId: partNonEnrolledId,
      email: `deadline.nonenrolled.${suffix}@edge-test.internal`,
      role: "PARTICIPANT",
      name: "Non-Enrolled User",
    });

    const withoutSub = await getContestDeadlineAction(contest1Id, phase1AId);
    assert.equal(withoutSub.success, false);
    assert.match(withoutSub.error || "", /Unauthorized/i);
    assert.equal(withoutSub.deadline, undefined);

    const withSub = await getContestDeadlineAction(contest1Id, phase1AId, task1AId, subPartAExpiredId);
    assert.equal(withSub.success, false);
    assert.match(withSub.error || "", /Unauthorized/i);
    assert.equal(withSub.deadline, undefined);

    const subAfter = await prisma.submission.findUnique({ where: { id: subPartAExpiredId } });
    assert.equal(subAfter?.status, "DRAFT");
  });

  test("3. Enrolled Participant A2 cannot access Participant A's expired submission", async () => {
    setTestSession({
      userId: partA2Id,
      email: `deadline.parta2.${suffix}@edge-test.internal`,
      role: "PARTICIPANT",
      name: "Participant Alpha Two",
    });

    const res = await getContestDeadlineAction(contest1Id, phase1AId, task1AId, subPartAExpiredId);
    assert.equal(res.success, false);
    assert.match(res.error || "", /Unauthorized/i);
    assert.equal(res.deadline, undefined);

    const subAfter = await prisma.submission.findUnique({ where: { id: subPartAExpiredId } });
    assert.equal(subAfter?.status, "DRAFT", "Cross-participant request must never finalize submission");
  });

  test("4. Mismatched contestId is rejected even for submission owner enrolled in both contests", async () => {
    setTestSession({
      userId: partAId,
      email: `deadline.parta.${suffix}@edge-test.internal`,
      role: "PARTICIPANT",
      name: "Participant Alpha",
    });

    const res = await getContestDeadlineAction(contest2Id, phase1AId, task1AId, subPartAExpiredId);
    assert.equal(res.success, false);
    assert.match(res.error || "", /Unauthorized/i);
    assert.equal(res.deadline, undefined);

    const subAfter = await prisma.submission.findUnique({ where: { id: subPartAExpiredId } });
    assert.equal(subAfter?.status, "DRAFT");
  });

  test("5. Mismatched phaseId (wrong phase in same contest or foreign phase) is rejected", async () => {
    setTestSession({
      userId: partAId,
      email: `deadline.parta.${suffix}@edge-test.internal`,
      role: "PARTICIPANT",
      name: "Participant Alpha",
    });

    const sameContestWrongPhase = await getContestDeadlineAction(
      contest1Id,
      phase1BId,
      task1AId,
      subPartAExpiredId
    );
    assert.equal(sameContestWrongPhase.success, false);
    assert.match(sameContestWrongPhase.error || "", /Unauthorized/i);
    assert.equal(sameContestWrongPhase.deadline, undefined);

    const foreignPhase = await getContestDeadlineAction(
      contest1Id,
      phase2AId,
      task1AId,
      subPartAExpiredId
    );
    assert.equal(foreignPhase.success, false);
    assert.match(foreignPhase.error || "", /Unauthorized/i);

    const subAfter = await prisma.submission.findUnique({ where: { id: subPartAExpiredId } });
    assert.equal(subAfter?.status, "DRAFT");
  });

  test("6. Evaluator authorization checks enforce contest and candidate assignment without mutating DRAFT", async () => {
    // A. Unassigned evaluator rejected
    setTestSession({
      userId: evalUnassignedId,
      email: `deadline.eval.unassigned.${suffix}@edge-test.internal`,
      role: "EVALUATOR",
      name: "Unassigned Evaluator",
    });
    const unassignedRes = await getContestDeadlineAction(contest1Id, phase1AId);
    assert.equal(unassignedRes.success, false);
    assert.match(unassignedRes.error || "", /Unauthorized/i);

    // B. Contest-only evaluator cannot inspect unassigned candidate's submission
    setTestSession({
      userId: evalContestOnlyId,
      email: `deadline.eval.contestonly.${suffix}@edge-test.internal`,
      role: "EVALUATOR",
      name: "Contest-Only Evaluator",
    });
    const unassignedCandRes = await getContestDeadlineAction(
      contest1Id,
      phase1AId,
      task1AId,
      subPartAExpiredId
    );
    assert.equal(unassignedCandRes.success, false);
    assert.match(unassignedCandRes.error || "", /Unauthorized/i);

    // C. Assigned evaluator can inspect assigned candidate deadline without auto-finalizing DRAFT
    setTestSession({
      userId: evalAssignedId,
      email: `deadline.eval.assigned.${suffix}@edge-test.internal`,
      role: "EVALUATOR",
      name: "Assigned Evaluator",
    });
    const assignedRes = await getContestDeadlineAction(
      contest1Id,
      phase1AId,
      task1AId,
      subPartAExpiredId
    );
    assert.equal(assignedRes.success, true);
    assert.ok(assignedRes.deadline);

    const subAfter = await prisma.submission.findUnique({ where: { id: subPartAExpiredId } });
    assert.equal(subAfter?.status, "DRAFT", "Evaluator read must not auto-finalize candidate draft");
  });

  test("7. Admin authorization verifies active ADMIN user and contest/phase boundaries", async () => {
    // Deactivated admin rejected
    setTestSession({
      userId: inactiveAdminId,
      email: `deadline.inactive.admin.${suffix}@edge-test.internal`,
      role: "ADMIN",
      name: "Inactive Admin",
    });
    const inactiveRes = await getContestDeadlineAction(contest1Id, phase1AId);
    assert.equal(inactiveRes.success, false);
    assert.match(inactiveRes.error || "", /Unauthorized/i);

    // Active admin rejected on mismatched contestId
    setTestSession({
      userId: adminId,
      email: `deadline.admin.${suffix}@edge-test.internal`,
      role: "ADMIN",
      name: "Deadline Test Admin",
    });
    const mismatchRes = await getContestDeadlineAction(contest2Id, phase1AId, task1AId, subPartAExpiredId);
    assert.equal(mismatchRes.success, false);

    // Active admin succeeds on valid contest + phase + submission without auto-finalizing DRAFT
    const validAdminRes = await getContestDeadlineAction(contest1Id, phase1AId, task1AId, subPartAExpiredId);
    assert.equal(validAdminRes.success, true);
    const subAfter = await prisma.submission.findUnique({ where: { id: subPartAExpiredId } });
    assert.equal(subAfter?.status, "DRAFT");
  });

  test("8. Authorized participant receives hierarchical PhaseAttempt deadline and own expired DRAFT auto-finalizes", async () => {
    // Participant A2 with active submission preserves hierarchical timer (<= PhaseAttempt expiry / task expiry)
    setTestSession({
      userId: partA2Id,
      email: `deadline.parta2.${suffix}@edge-test.internal`,
      role: "PARTICIPANT",
      name: "Participant Alpha Two",
    });
    const activeRes = await getContestDeadlineAction(contest1Id, phase1AId, task1A2Id, subPartA2ActiveId);
    assert.equal(activeRes.success, true);
    assert.equal(activeRes.controllingSource, "TASK_ATTEMPT_EXPIRY");
    assert.ok((activeRes.secondsLeft ?? 0) > 0);
    assert.equal(activeRes.isAttemptExpired, false);

    // Participant A owning expired DRAFT submission triggers auto-finalization with MCQ grading
    setTestSession({
      userId: partAId,
      email: `deadline.parta.${suffix}@edge-test.internal`,
      role: "PARTICIPANT",
      name: "Participant Alpha",
    });
    const expiredOwnRes = await getContestDeadlineAction(contest1Id, phase1AId, task1AId, subPartAExpiredId);
    assert.equal(expiredOwnRes.success, true);
    assert.equal(expiredOwnRes.isAttemptExpired, true);
    assert.equal(expiredOwnRes.secondsLeft, 0);

    const subFinalized = await prisma.submission.findUnique({ where: { id: subPartAExpiredId } });
    assert.equal(subFinalized?.status, "SUBMITTED");
    assert.equal(Number(subFinalized?.autoGradeScore), 20);
  });

  test("9. taskId supplied without submissionId validates contest and phase membership cleanly", async () => {
    setTestSession({
      userId: partA2Id,
      email: `deadline.parta2.${suffix}@edge-test.internal`,
      role: "PARTICIPANT",
      name: "Participant Alpha Two",
    });

    // Valid taskId in matching contest & phase succeeds and preserves hierarchical PhaseAttempt deadline
    const validWithPhase = await getContestDeadlineAction(contest1Id, phase1AId, task1A2Id);
    assert.equal(validWithPhase.success, true);
    assert.equal(validWithPhase.phaseId, phase1AId);
    assert.ok((validWithPhase.secondsLeft ?? 0) > 0);

    // Valid taskId with omitted phaseId resolves its parent phase cleanly
    const validWithoutPhase = await getContestDeadlineAction(contest1Id, undefined, task1A2Id);
    assert.equal(validWithoutPhase.success, true);
    assert.equal(validWithoutPhase.phaseId, phase1AId);

    // Valid taskId with mismatched phaseId in same contest is rejected
    const wrongPhaseRes = await getContestDeadlineAction(contest1Id, phase1BId, task1A2Id);
    assert.equal(wrongPhaseRes.success, false);
    assert.match(wrongPhaseRes.error || "", /Unauthorized/i);
    assert.equal(wrongPhaseRes.deadline, undefined);

    // Foreign contest taskId is rejected
    const foreignTaskRes = await getContestDeadlineAction(contest1Id, phase1AId, task2AId);
    assert.equal(foreignTaskRes.success, false);
    assert.match(foreignTaskRes.error || "", /Unauthorized/i);
    assert.equal(foreignTaskRes.deadline, undefined);

    // Nonexistent taskId is rejected safely
    const missingTaskRes = await getContestDeadlineAction(contest1Id, phase1AId, crypto.randomUUID());
    assert.equal(missingTaskRes.success, false);
    assert.match(missingTaskRes.error || "", /Unauthorized/i);
    assert.equal(missingTaskRes.deadline, undefined);

    // Active submission remains untouched as DRAFT
    const activeSubAfter = await prisma.submission.findUnique({ where: { id: subPartA2ActiveId } });
    assert.equal(activeSubAfter?.status, "DRAFT");
  });
});

