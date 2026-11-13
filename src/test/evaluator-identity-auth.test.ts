import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { prisma } from "../lib/prisma";
import { setTestSession } from "../lib/auth";
import {
  gradeSubmissionAction,
  saveRubricScoreAction,
  type GradeSubmissionInput,
  type SaveRubricScoreInput,
} from "../app/actions/evaluator-actions";

describe("Security Hardening: Evaluator Identity & Spoofing Protection (A2)", () => {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  const adminActiveId = crypto.randomUUID();
  const adminInactiveId = crypto.randomUUID();
  const evalAId = crypto.randomUUID();
  const evalBId = crypto.randomUUID();
  const evalUnassignedId = crypto.randomUUID();
  const evalInactiveId = crypto.randomUUID();
  const partMismatchId = crypto.randomUUID();
  const partP1Id = crypto.randomUUID();
  const partP2Id = crypto.randomUUID();

  const adminActiveEmail = `a2.admin.active.${suffix}@edge-test.internal`;
  const adminInactiveEmail = `a2.admin.inactive.${suffix}@edge-test.internal`;
  const evalAEmail = `a2.eval.a.${suffix}@edge-test.internal`;
  const evalBEmail = `a2.eval.b.${suffix}@edge-test.internal`;
  const evalUnassignedEmail = `a2.eval.unassigned.${suffix}@edge-test.internal`;
  const evalInactiveEmail = `a2.eval.inactive.${suffix}@edge-test.internal`;
  const partMismatchEmail = `a2.part.mismatch.${suffix}@edge-test.internal`;
  const partP1Email = `a2.part.p1.${suffix}@edge-test.internal`;
  const partP2Email = `a2.part.p2.${suffix}@edge-test.internal`;

  const contestId = crypto.randomUUID();
  const phaseId = crypto.randomUUID();
  const taskId = crypto.randomUUID();
  const questionId = crypto.randomUUID();
  const rubricId = crypto.randomUUID();
  const contestEvalAId = crypto.randomUUID();
  const contestEvalBId = crypto.randomUUID();
  const contestEvalInactiveId = crypto.randomUUID();
  const subP1Id = crypto.randomUUID();
  const subP2Id = crypto.randomUUID();

  before(async () => {
    const now = new Date();
    const pastStart = new Date(now.getTime() - 2 * 24 * 3600 * 1000);
    const futureEnd = new Date(now.getTime() + 5 * 24 * 3600 * 1000);

    await prisma.user.createMany({
      data: [
        {
          id: adminActiveId,
          email: adminActiveEmail,
          name: "A2 Active Admin",
          role: "ADMIN",
          isActive: true,
        },
        {
          id: adminInactiveId,
          email: adminInactiveEmail,
          name: "A2 Inactive Admin",
          role: "ADMIN",
          isActive: false,
        },
        {
          id: evalAId,
          email: evalAEmail,
          name: "A2 Evaluator A",
          role: "EVALUATOR",
          isActive: true,
        },
        {
          id: evalBId,
          email: evalBEmail,
          name: "A2 Evaluator B",
          role: "EVALUATOR",
          isActive: true,
        },
        {
          id: evalUnassignedId,
          email: evalUnassignedEmail,
          name: "A2 Unassigned Evaluator",
          role: "EVALUATOR",
          isActive: true,
        },
        {
          id: evalInactiveId,
          email: evalInactiveEmail,
          name: "A2 Inactive Evaluator",
          role: "EVALUATOR",
          isActive: false,
        },
        {
          id: partMismatchId,
          email: partMismatchEmail,
          name: "A2 Mismatch Participant",
          role: "PARTICIPANT",
          isActive: true,
        },
        {
          id: partP1Id,
          email: partP1Email,
          name: "A2 Candidate P1",
          role: "PARTICIPANT",
          isActive: true,
        },
        {
          id: partP2Id,
          email: partP2Email,
          name: "A2 Candidate P2",
          role: "PARTICIPANT",
          isActive: true,
        },
      ],
    });

    await prisma.contest.create({
      data: {
        id: contestId,
        slug: `a2-identity-security-${suffix}`,
        title: `A2 Identity Security Contest ${suffix}`,
        track: "Management",
        startDate: pastStart,
        endDate: futureEnd,
        status: "LIVE",
        isPublished: true,
      },
    });

    await prisma.phase.create({
      data: {
        id: phaseId,
        contestId,
        phaseNumber: 1,
        title: "A2 Phase 1",
        weightPercentage: 100,
        deadline: futureEnd,
        status: "OPEN",
      },
    });

    await prisma.task.create({
      data: {
        id: taskId,
        phaseId,
        taskNumber: 1,
        title: "A2 Case Study Task",
        totalPoints: 100,
      },
    });

    await prisma.question.create({
      data: {
        id: questionId,
        taskId,
        questionNumber: 1,
        type: "WRITTEN",
        prompt: "Outline a scaling strategy.",
        points: 50,
      },
    });

    await prisma.rubricCriterion.create({
      data: {
        id: rubricId,
        taskId,
        name: "Strategic Depth",
        weightPercentage: 100,
        maxPoints: 50,
      },
    });

    await prisma.contestParticipant.createMany({
      data: [
        { contestId, userId: partP1Id },
        { contestId, userId: partP2Id },
      ],
    });

    await prisma.contestEvaluator.createMany({
      data: [
        { id: contestEvalAId, contestId, userId: evalAId },
        { id: contestEvalBId, contestId, userId: evalBId },
        { id: contestEvalInactiveId, contestId, userId: evalInactiveId },
      ],
    });

    await prisma.evaluatorCandidateAssignment.createMany({
      data: [
        {
          contestId,
          contestEvaluatorId: contestEvalAId,
          evaluatorId: evalAId,
          participantId: partP1Id,
        },
        {
          contestId,
          contestEvaluatorId: contestEvalBId,
          evaluatorId: evalBId,
          participantId: partP2Id,
        },
        {
          contestId,
          contestEvaluatorId: contestEvalInactiveId,
          evaluatorId: evalInactiveId,
          participantId: partP1Id,
        },
      ],
    });

    await prisma.submission.createMany({
      data: [
        {
          id: subP1Id,
          contestId,
          phaseId,
          taskId,
          userId: partP1Id,
          status: "SUBMITTED",
          submittedAt: now,
        },
        {
          id: subP2Id,
          contestId,
          phaseId,
          taskId,
          userId: partP2Id,
          status: "SUBMITTED",
          submittedAt: now,
        },
      ],
    });

    await prisma.submissionAnswer.createMany({
      data: [
        {
          submissionId: subP1Id,
          questionId,
          writtenText: "Candidate P1 written response.",
        },
        {
          submissionId: subP2Id,
          questionId,
          writtenText: "Candidate P2 written response.",
        },
      ],
    });
  });

  after(async () => {
    setTestSession(null);

    await prisma.auditLog.deleteMany({
      where: {
        actorId: {
          in: [
            adminActiveId,
            adminInactiveId,
            evalAId,
            evalBId,
            evalUnassignedId,
            evalInactiveId,
          ],
        },
      },
    });
    await prisma.evaluationScore.deleteMany({
      where: { submissionId: { in: [subP1Id, subP2Id] } },
    });
    await prisma.submissionAnswer.deleteMany({
      where: { submissionId: { in: [subP1Id, subP2Id] } },
    });
    await prisma.submission.deleteMany({
      where: { id: { in: [subP1Id, subP2Id] } },
    });
    await prisma.evaluatorCandidateAssignment.deleteMany({
      where: { contestId },
    });
    await prisma.contestEvaluator.deleteMany({
      where: { contestId },
    });
    await prisma.contestParticipant.deleteMany({
      where: { contestId },
    });
    await prisma.rubricCriterion.deleteMany({
      where: { taskId },
    });
    await prisma.question.deleteMany({
      where: { taskId },
    });
    await prisma.task.deleteMany({
      where: { id: taskId },
    });
    await prisma.phase.deleteMany({
      where: { id: phaseId },
    });
    await prisma.contest.deleteMany({
      where: { id: contestId },
    });
    await prisma.user.deleteMany({
      where: {
        id: {
          in: [
            adminActiveId,
            adminInactiveId,
            evalAId,
            evalBId,
            evalUnassignedId,
            evalInactiveId,
            partMismatchId,
            partP1Id,
            partP2Id,
          ],
        },
      },
    });
  });

  it("1. Rejects unauthenticated callers on both gradeSubmissionAction and saveRubricScoreAction", async () => {
    setTestSession(undefined);

    const res1 = await gradeSubmissionAction({
      submissionId: subP1Id,
      overallFeedback: "Unauth grade",
      questionGrades: [{ questionId, score: 40 }],
      rubricScores: [{ rubricId, scoreAwarded: 40 }],
    });
    assert.equal(res1.success, false);
    assert.match(res1.error || "", /unauthorized|authentication/i);

    setTestSession(null);

    const res2 = await saveRubricScoreAction({
      submissionId: subP1Id,
      overallFeedback: "Unauth rubric",
      scores: [{ rubricId, scoreAwarded: 40 }],
    });
    assert.equal(res2.success, false);
    assert.match(res2.error || "", /unauthorized|authentication/i);
  });

  it("2. Rejects PARTICIPANT session role on both actions", async () => {
    setTestSession({
      userId: partP1Id,
      email: partP1Email,
      name: "A2 Candidate P1",
      role: "PARTICIPANT",
    });

    const res1 = await gradeSubmissionAction({
      submissionId: subP1Id,
      questionGrades: [{ questionId, score: 50 }],
    });
    assert.equal(res1.success, false);
    assert.match(res1.error || "", /forbidden|unauthorized/i);

    const res2 = await saveRubricScoreAction({
      submissionId: subP1Id,
      scores: [{ rubricId, scoreAwarded: 50 }],
    });
    assert.equal(res2.success, false);
    assert.match(res2.error || "", /forbidden|unauthorized/i);
  });

  it("3. Rejects missing DB user account and NEVER creates User records during grading", async () => {
    const missingUserId = crypto.randomUUID();
    const nonexistentEmail = `never.create.${suffix}@edge-test.internal`;
    const userCountBefore = await prisma.user.count();

    setTestSession({
      userId: missingUserId,
      email: nonexistentEmail,
      name: "Phantom Evaluator",
      role: "EVALUATOR",
    });

    const gradePayload = {
      submissionId: subP1Id,
      evaluatorEmail: nonexistentEmail,
      questionGrades: [{ questionId, score: 45 }],
      rubricScores: [{ rubricId, scoreAwarded: 45 }],
    } as unknown as GradeSubmissionInput;

    const res1 = await gradeSubmissionAction(gradePayload);
    assert.equal(res1.success, false);
    assert.match(res1.error || "", /not found|unauthorized/i);

    const rubricPayload = {
      submissionId: subP1Id,
      evaluatorEmail: nonexistentEmail,
      scores: [{ rubricId, scoreAwarded: 45 }],
    } as unknown as SaveRubricScoreInput;

    const res2 = await saveRubricScoreAction(rubricPayload);
    assert.equal(res2.success, false);
    assert.match(res2.error || "", /not found|unauthorized/i);

    const userCountAfter = await prisma.user.count();
    assert.equal(userCountAfter, userCountBefore, "Grading must never create User records");
    const createdById = await prisma.user.findUnique({ where: { id: missingUserId } });
    assert.equal(createdById, null);
    const createdByEmail = await prisma.user.findUnique({ where: { email: nonexistentEmail } });
    assert.equal(createdByEmail, null);
  });

  it("4. Rejects inactive evaluator and inactive admin accounts", async () => {
    setTestSession({
      userId: evalInactiveId,
      email: evalInactiveEmail,
      name: "A2 Inactive Evaluator",
      role: "EVALUATOR",
    });

    const evalGradeRes = await gradeSubmissionAction({
      submissionId: subP1Id,
      questionGrades: [{ questionId, score: 30 }],
    });
    assert.equal(evalGradeRes.success, false);
    assert.match(evalGradeRes.error || "", /inactive|unauthorized/i);

    const evalRubricRes = await saveRubricScoreAction({
      submissionId: subP1Id,
      scores: [{ rubricId, scoreAwarded: 30 }],
    });
    assert.equal(evalRubricRes.success, false);
    assert.match(evalRubricRes.error || "", /inactive|unauthorized/i);

    setTestSession({
      userId: adminInactiveId,
      email: adminInactiveEmail,
      name: "A2 Inactive Admin",
      role: "ADMIN",
    });

    const adminGradeRes = await gradeSubmissionAction({
      submissionId: subP1Id,
      questionGrades: [{ questionId, score: 30 }],
    });
    assert.equal(adminGradeRes.success, false);
    assert.match(adminGradeRes.error || "", /inactive|unauthorized/i);

    const adminRubricRes = await saveRubricScoreAction({
      submissionId: subP1Id,
      scores: [{ rubricId, scoreAwarded: 30 }],
    });
    assert.equal(adminRubricRes.success, false);
    assert.match(adminRubricRes.error || "", /inactive|unauthorized/i);
  });

  it("5. Rejects DB role mismatch against session role", async () => {
    setTestSession({
      userId: partMismatchId,
      email: partMismatchEmail,
      name: "A2 Mismatch Participant",
      role: "EVALUATOR",
    });

    const res1 = await gradeSubmissionAction({
      submissionId: subP1Id,
      questionGrades: [{ questionId, score: 25 }],
    });
    assert.equal(res1.success, false);
    assert.match(res1.error || "", /mismatch|unauthorized/i);

    setTestSession({
      userId: evalBId,
      email: evalBEmail,
      name: "A2 Evaluator B",
      role: "ADMIN",
    });

    const res2 = await saveRubricScoreAction({
      submissionId: subP1Id,
      scores: [{ rubricId, scoreAwarded: 25 }],
    });
    assert.equal(res2.success, false);
    assert.match(res2.error || "", /mismatch|unauthorized/i);
  });

  it("6. Rejects evaluator not assigned to the contest", async () => {
    setTestSession({
      userId: evalUnassignedId,
      email: evalUnassignedEmail,
      name: "A2 Unassigned Evaluator",
      role: "EVALUATOR",
    });

    const res1 = await gradeSubmissionAction({
      submissionId: subP1Id,
      questionGrades: [{ questionId, score: 35 }],
    });
    assert.equal(res1.success, false);
    assert.match(res1.error || "", /not assigned to evaluate this contest/i);

    const res2 = await saveRubricScoreAction({
      submissionId: subP1Id,
      scores: [{ rubricId, scoreAwarded: 35 }],
    });
    assert.equal(res2.success, false);
    assert.match(res2.error || "", /not assigned to evaluate this contest/i);
  });

  it("7. Blocks Evaluator B from spoofing Evaluator A's email to grade Candidate P1", async () => {
    setTestSession({
      userId: evalBId,
      email: evalBEmail,
      name: "A2 Evaluator B",
      role: "EVALUATOR",
    });

    const spoofGradePayload = {
      submissionId: subP1Id,
      evaluatorEmail: evalAEmail,
      overallFeedback: "Spoofed attempt from Evaluator B",
      questionGrades: [{ questionId, score: 10 }],
      rubricScores: [{ rubricId, scoreAwarded: 10 }],
    } as unknown as GradeSubmissionInput;

    const res1 = await gradeSubmissionAction(spoofGradePayload);
    assert.equal(res1.success, false);
    assert.match(res1.error || "", /not assigned to evaluate this candidate/i);

    const spoofRubricPayload = {
      submissionId: subP1Id,
      evaluatorEmail: evalAEmail,
      overallFeedback: "Spoofed rubric attempt from Evaluator B",
      scores: [{ rubricId, scoreAwarded: 10 }],
    } as unknown as SaveRubricScoreInput;

    const res2 = await saveRubricScoreAction(spoofRubricPayload);
    assert.equal(res2.success, false);
    assert.match(res2.error || "", /not assigned to evaluate this candidate/i);

    const subAfter = await prisma.submission.findUniqueOrThrow({ where: { id: subP1Id } });
    assert.equal(subAfter.status, "SUBMITTED");
    assert.equal(subAfter.finalScore, null);
  });

  it("8. Attributes scores to session.userId and ignores client-supplied evaluatorEmail when authorized", async () => {
    const userCountBefore = await prisma.user.count();
    const syntheticSpoofEmail = `synthetic.spoof.${suffix}@edge-test.internal`;

    setTestSession({
      userId: evalAId,
      email: evalAEmail,
      name: "A2 Evaluator A",
      role: "EVALUATOR",
    });

    const res1 = await gradeSubmissionAction({
      submissionId: subP1Id,
      evaluatorEmail: syntheticSpoofEmail,
      overallFeedback: "Legitimate Evaluator A feedback",
      questionGrades: [{ questionId, score: 42 }],
      rubricScores: [{ rubricId, scoreAwarded: 38 }],
    } as unknown as GradeSubmissionInput);

    assert.equal(res1.success, true);
    assert.equal(res1.finalScore, 76);
    assert.equal(res1.status, "GRADED");

    const scoresAfterGrade = await prisma.evaluationScore.findMany({
      where: { submissionId: subP1Id },
    });
    assert.equal(scoresAfterGrade.length, 1);
    assert.equal(scoresAfterGrade[0].evaluatorId, evalAId);
    assert.equal(Number(scoresAfterGrade[0].scoreAwarded), 38);

    const res2 = await saveRubricScoreAction({
      submissionId: subP1Id,
      evaluatorEmail: evalBEmail,
      overallFeedback: "Updated via saveRubricScoreAction",
      questionGrades: [{ questionId, score: 45 }],
      scores: [{ rubricId, scoreAwarded: 40 }],
    } as unknown as SaveRubricScoreInput);

    assert.equal(res2.success, true);
    assert.equal(res2.finalScore, 80);

    const scoresAfterRubric = await prisma.evaluationScore.findMany({
      where: { submissionId: subP1Id },
    });
    assert.equal(scoresAfterRubric.length, 1);
    assert.equal(scoresAfterRubric[0].evaluatorId, evalAId);
    assert.equal(Number(scoresAfterRubric[0].scoreAwarded), 40);

    const userCountAfter = await prisma.user.count();
    assert.equal(userCountAfter, userCountBefore);
    assert.equal(
      await prisma.user.findUnique({ where: { email: syntheticSpoofEmail } }),
      null
    );
  });

  it("9. Active ADMIN can grade with explicit role check and stores admin session.userId (ignores spoofed email)", async () => {
    const userCountBefore = await prisma.user.count();

    setTestSession({
      userId: adminActiveId,
      email: adminActiveEmail,
      name: "A2 Active Admin",
      role: "ADMIN",
    });

    const res = await saveRubricScoreAction({
      submissionId: subP2Id,
      evaluatorEmail: evalAEmail,
      overallFeedback: "Admin oversight score",
      questionGrades: [{ questionId, score: 48 }],
      scores: [{ rubricId, scoreAwarded: 44 }],
    } as unknown as SaveRubricScoreInput);

    assert.equal(res.success, true);
    assert.equal(res.finalScore, 88);
    assert.equal(res.status, "GRADED");

    const adminScores = await prisma.evaluationScore.findMany({
      where: { submissionId: subP2Id },
    });
    assert.equal(adminScores.length, 1);
    assert.equal(adminScores[0].evaluatorId, adminActiveId);
    assert.equal(Number(adminScores[0].scoreAwarded), 44);

    const userCountAfter = await prisma.user.count();
    assert.equal(userCountAfter, userCountBefore);
  });
});
