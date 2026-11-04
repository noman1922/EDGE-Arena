import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { setTestSession } from "../lib/auth";
import { UserRole, ContestStatus, PhaseStatus, SubmissionStatus } from "@prisma/client";
import { updateParticipantProfileAction } from "../app/actions/participant-nav-actions";
import { updateParticipantByAdminAction } from "../app/actions/participant-actions";
import { updatePhaseAction } from "../app/actions/task-builder-actions";

describe("Stage 1: Participant Profile Editing & Phase Editing", () => {
  const testAdminId = "88000000-0000-4000-8000-000000000001";
  const testParticipant1Id = "88000000-0000-4000-8000-000000000002";
  const testParticipant2Id = "88000000-0000-4000-8000-000000000003";
  const testEvaluatorId = "88000000-0000-4000-8000-000000000004";

  const testContestId = "88000000-0000-4000-8000-000000000010";
  const testPhase1Id = "88000000-0000-4000-8000-000000000011";
  const testPhase2Id = "88000000-0000-4000-8000-000000000012";
  const testTaskId = "88000000-0000-4000-8000-000000000013";

  before(async () => {
    // 1. Seed admin
    await prisma.user.upsert({
      where: { id: testAdminId },
      update: { role: UserRole.ADMIN },
      create: {
        id: testAdminId,
        email: "stage1.admin@aciedge.edu",
        name: "Stage 1 Admin",
        role: UserRole.ADMIN,
      },
    });

    // 2. Seed participant 1
    await prisma.user.upsert({
      where: { id: testParticipant1Id },
      update: { role: UserRole.PARTICIPANT, name: "Initial Part One", institution: "Initial Inst" },
      create: {
        id: testParticipant1Id,
        email: "stage1.part1@aciedge.edu",
        name: "Initial Part One",
        candidateId: "STAGE1-CAND-01",
        institution: "Initial Inst",
        role: UserRole.PARTICIPANT,
      },
    });

    // 3. Seed participant 2
    await prisma.user.upsert({
      where: { id: testParticipant2Id },
      update: { role: UserRole.PARTICIPANT },
      create: {
        id: testParticipant2Id,
        email: "stage1.part2@aciedge.edu",
        name: "Initial Part Two",
        candidateId: "STAGE1-CAND-02",
        institution: "Initial Inst Two",
        role: UserRole.PARTICIPANT,
      },
    });

    // 4. Seed evaluator
    await prisma.user.upsert({
      where: { id: testEvaluatorId },
      update: { role: UserRole.EVALUATOR },
      create: {
        id: testEvaluatorId,
        email: "stage1.eval@aciedge.edu",
        name: "Stage 1 Evaluator",
        role: UserRole.EVALUATOR,
      },
    });

    // 5. Seed contest with 2 phases and a task
    await prisma.contest.upsert({
      where: { id: testContestId },
      update: {
        title: "Stage 1 Contest",
        slug: "stage-1-contest-test",
        status: ContestStatus.LIVE,
        startDate: new Date("2026-01-01T00:00:00Z"),
        endDate: new Date("2026-12-31T23:59:59Z"),
      },
      create: {
        id: testContestId,
        title: "Stage 1 Contest",
        slug: "stage-1-contest-test",
        track: "General",
        status: ContestStatus.LIVE,
        startDate: new Date("2026-01-01T00:00:00Z"),
        endDate: new Date("2026-12-31T23:59:59Z"),
      },
    });

    await prisma.phase.upsert({
      where: { id: testPhase1Id },
      update: {
        title: "Initial Phase One",
        phaseNumber: 1,
        weightPercentage: 40,
        status: PhaseStatus.OPEN,
      },
      create: {
        id: testPhase1Id,
        contestId: testContestId,
        phaseNumber: 1,
        title: "Initial Phase One",
        description: "Initial description",
        weightPercentage: 40,
        status: PhaseStatus.OPEN,
        deadline: new Date("2026-06-01T18:00:00Z"),
      },
    });

    await prisma.phase.upsert({
      where: { id: testPhase2Id },
      update: {
        title: "Initial Phase Two",
        phaseNumber: 2,
        weightPercentage: 60,
        status: PhaseStatus.UPCOMING,
      },
      create: {
        id: testPhase2Id,
        contestId: testContestId,
        phaseNumber: 2,
        title: "Initial Phase Two",
        description: "Initial phase 2 description",
        weightPercentage: 60,
        status: PhaseStatus.UPCOMING,
        deadline: new Date("2026-09-01T18:00:00Z"),
      },
    });

    await prisma.task.upsert({
      where: { id: testTaskId },
      update: { title: "Preserved Task" },
      create: {
        id: testTaskId,
        phaseId: testPhase1Id,
        title: "Preserved Task",
        taskNumber: 1,
        totalPoints: 50,
      },
    });
  });

  after(async () => {
    setTestSession(null);
    // Clean up test records
    await prisma.task.deleteMany({ where: { phaseId: { in: [testPhase1Id, testPhase2Id] } } });
    await prisma.phase.deleteMany({ where: { contestId: testContestId } });
    await prisma.contest.deleteMany({ where: { id: testContestId } });
    await prisma.auditLog.deleteMany({
      where: {
        actorId: { in: [testAdminId, testParticipant1Id, testParticipant2Id, testEvaluatorId] },
      },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [testAdminId, testParticipant1Id, testParticipant2Id, testEvaluatorId] } },
    });
  });

  // ==========================================
  // 1. Participant Self-Service Profile Update
  // ==========================================
  describe("Participant Profile Editing", () => {
    test("allows participant to update their own name and institution", async () => {
      setTestSession({
        userId: testParticipant1Id,
        email: "stage1.part1@aciedge.edu",
        role: "PARTICIPANT",
        name: "Initial Part One",
        issuedAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      });

      const res = await updateParticipantProfileAction({
        name: "Updated Candidate Name",
        institution: "Dhaka University",
      });

      assert.equal(res.success, true);
      assert.equal(res.user?.name, "Updated Candidate Name");
      assert.equal(res.user?.institution, "Dhaka University");

      // Verify in DB
      const userInDb = await prisma.user.findUnique({ where: { id: testParticipant1Id } });
      assert.equal(userInDb?.name, "Updated Candidate Name");
      assert.equal(userInDb?.institution, "Dhaka University");
      // Protected fields untouched
      assert.equal(userInDb?.role, UserRole.PARTICIPANT);
      assert.equal(userInDb?.email, "stage1.part1@aciedge.edu");
      assert.equal(userInDb?.candidateId, "STAGE1-CAND-01");

      // Verify AuditLog
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          actorId: testParticipant1Id,
          action: "UPDATE_PROFILE",
        },
      });
      assert.ok(auditLog, "Audit log should exist for profile update");
    });

    test("validates name length and trims whitespace", async () => {
      setTestSession({
        userId: testParticipant1Id,
        email: "stage1.part1@aciedge.edu",
        role: "PARTICIPANT",
        name: "Updated Candidate Name",
        issuedAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      });

      // Too short name
      const resShort = await updateParticipantProfileAction({
        name: "A",
      });
      assert.equal(resShort.success, false);
      assert.match(resShort.error || "", /at least 2 characters/i);

      // Name with whitespace is trimmed
      const resTrim = await updateParticipantProfileAction({
        name: "   Trimmed Name   ",
        institution: "  Trimmed University  ",
      });
      assert.equal(resTrim.success, true);
      assert.equal(resTrim.user?.name, "Trimmed Name");
      assert.equal(resTrim.user?.institution, "Trimmed University");
    });

    test("rejects unauthenticated or non-participant callers", async () => {
      // Unauthenticated
      setTestSession(null);
      const resUnauth = await updateParticipantProfileAction({
        name: "Hacker Attempt",
      });
      assert.equal(resUnauth.success, false);

      // Evaluator session trying to call participant profile update
      setTestSession({
        userId: testEvaluatorId,
        email: "stage1.eval@aciedge.edu",
        role: "EVALUATOR",
        name: "Stage 1 Evaluator",
        issuedAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      });
      const resEval = await updateParticipantProfileAction({
        name: "Evaluator As Participant",
      });
      assert.equal(resEval.success, false);
      assert.match(resEval.error || "", /unauthorized|forbidden/i);
    });
  });

  // ==========================================
  // 2. Admin Participant Profile Management
  // ==========================================
  describe("Admin Participant Profile Management", () => {
    test("allows admin to update participant name, institution, and candidateId", async () => {
      setTestSession({
        userId: testAdminId,
        email: "stage1.admin@aciedge.edu",
        role: "ADMIN",
        name: "Stage 1 Admin",
        issuedAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      });

      const res = await updateParticipantByAdminAction({
        userId: testParticipant1Id,
        name: "Admin Edited Candidate",
        institution: "BUET",
        candidateId: "NEW-CAND-ID-01",
      });

      assert.equal(res.success, true);
      assert.equal(res.user?.name, "Admin Edited Candidate");
      assert.equal(res.user?.institution, "BUET");
      assert.equal(res.user?.candidateId, "NEW-CAND-ID-01");

      const dbUser = await prisma.user.findUnique({ where: { id: testParticipant1Id } });
      assert.equal(dbUser?.name, "Admin Edited Candidate");
      assert.equal(dbUser?.candidateId, "NEW-CAND-ID-01");
      assert.equal(dbUser?.institution, "BUET");
      // Protected fields untouched
      assert.equal(dbUser?.role, UserRole.PARTICIPANT);
      assert.equal(dbUser?.email, "stage1.part1@aciedge.edu");

      // Verify AuditLog
      const audit = await prisma.auditLog.findFirst({
        where: {
          actorId: testAdminId,
          action: "ADMIN_UPDATE_PARTICIPANT_PROFILE",
        },
      });
      assert.ok(audit, "Admin update audit log should be recorded");
    });

    test("enforces candidateId uniqueness across participants", async () => {
      setTestSession({
        userId: testAdminId,
        email: "stage1.admin@aciedge.edu",
        role: "ADMIN",
        name: "Stage 1 Admin",
        issuedAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      });

      // Attempt to assign participant 2's candidateId (STAGE1-CAND-02) to participant 1
      const resDup = await updateParticipantByAdminAction({
        userId: testParticipant1Id,
        name: "Admin Edited Candidate",
        candidateId: "STAGE1-CAND-02",
      });

      assert.equal(resDup.success, false);
      assert.match(resDup.error || "", /already assigned/i);
    });

    test("rejects non-admin calling admin update action", async () => {
      setTestSession({
        userId: testParticipant1Id,
        email: "stage1.part1@aciedge.edu",
        role: "PARTICIPANT",
        name: "Regular Participant",
        issuedAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      });

      const res = await updateParticipantByAdminAction({
        userId: testParticipant2Id,
        name: "Malicious Edit",
      });

      assert.equal(res.success, false);
      assert.match(res.error || "", /unauthorized|forbidden/i);
    });
  });

  // ==========================================
  // 3. Phase Name and Metadata Editing
  // ==========================================
  describe("Phase Name & Metadata Editing", () => {
    test("allows admin to update phase title, description, weight, and deadline in-place", async () => {
      setTestSession({
        userId: testAdminId,
        email: "stage1.admin@aciedge.edu",
        role: "ADMIN",
        name: "Stage 1 Admin",
        issuedAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      });

      const res = await updatePhaseAction({
        phaseId: testPhase1Id,
        title: "Renamed Stage 1 Assessment",
        description: "Updated description for phase 1",
        phaseNumber: 1,
        weightPercentage: 45,
        status: "OPEN",
        deadline: "2026-07-15T23:59",
      });

      assert.equal(res.success, true);
      assert.equal(res.phase?.title, "Renamed Stage 1 Assessment");
      assert.equal(res.phase?.weightPercentage, 45);

      // Verify in DB
      const dbPhase = await prisma.phase.findUnique({
        where: { id: testPhase1Id },
        include: { tasks: true },
      });
      assert.ok(dbPhase);
      assert.equal(dbPhase.title, "Renamed Stage 1 Assessment");
      assert.equal(dbPhase.description, "Updated description for phase 1");
      assert.equal(Number(dbPhase.weightPercentage), 45);
      assert.equal(dbPhase.phaseNumber, 1);

      // Verify related task is completely preserved (not deleted or orphaned)
      assert.equal(dbPhase.tasks.length, 1);
      assert.equal(dbPhase.tasks[0].id, testTaskId);
      assert.equal(dbPhase.tasks[0].title, "Preserved Task");

      // Verify AuditLog
      const audit = await prisma.auditLog.findFirst({
        where: {
          actorId: testAdminId,
          action: "UPDATE_PHASE",
        },
      });
      assert.ok(audit, "Phase update audit log should be recorded");
    });

    test("rejects duplicate phaseNumber within the same contest", async () => {
      setTestSession({
        userId: testAdminId,
        email: "stage1.admin@aciedge.edu",
        role: "ADMIN",
        name: "Stage 1 Admin",
        issuedAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      });

      // Attempt to change phase 1's number to 2 (which belongs to phase 2)
      const resDup = await updatePhaseAction({
        phaseId: testPhase1Id,
        title: "Phase Collision",
        phaseNumber: 2,
      });

      assert.equal(resDup.success, false);
      assert.match(resDup.error || "", /already used|already exists/i);
    });

    test("validates phase title length and weight percentage boundaries", async () => {
      setTestSession({
        userId: testAdminId,
        email: "stage1.admin@aciedge.edu",
        role: "ADMIN",
        name: "Stage 1 Admin",
        issuedAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      });

      // Empty title
      const resEmptyTitle = await updatePhaseAction({
        phaseId: testPhase1Id,
        title: " ",
      });
      assert.equal(resEmptyTitle.success, false);
      assert.match(resEmptyTitle.error || "", /at least 2 characters/i);

      // Invalid weight (> 100)
      const resWeight = await updatePhaseAction({
        phaseId: testPhase1Id,
        title: "Valid Title",
        weightPercentage: 150,
      });
      assert.equal(resWeight.success, false);
      assert.match(resWeight.error || "", /between 0 and 100/i);
    });

    test("rejects non-admin attempting to edit a phase", async () => {
      setTestSession({
        userId: testParticipant1Id,
        email: "stage1.part1@aciedge.edu",
        role: "PARTICIPANT",
        name: "Participant Attacker",
        issuedAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      });

      const res = await updatePhaseAction({
        phaseId: testPhase1Id,
        title: "Hacked Phase Name",
      });

      assert.equal(res.success, false);
      assert.match(res.error || "", /unauthorized|forbidden/i);
    });
  });
});
