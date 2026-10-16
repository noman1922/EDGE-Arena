import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { setTestSession, SessionPayload } from "../lib/auth";
import {
  createParticipantAccountAction,
  bulkImportUsersAction,
} from "../app/actions/participant-actions";
import {
  getContestMonitoringSettingsAction,
  saveContestMonitoringSettingsAction,
  recordMonitoringEventAction,
  getContestMonitoringDashboardAction,
  exportMonitoringRecordsCsvAction,
} from "../app/actions/monitoring-actions";
import { getTaskAssessmentData } from "../app/actions/assessment-actions";
import { getUserCredentials, verifyPassword } from "../lib/credentials";

describe("Monitoring Proctoring & Closed-Access Account Administration Tests", () => {
  let testContestId = "";
  let testPhaseId = "";
  let testTaskId = "";

  const adminSession: SessionPayload = {
    userId: "admin-mon-test-id",
    email: "admin.mon@example.com",
    role: "ADMIN",
    name: "Admin Mon Tester",
    issuedAt: Date.now(),
    expiresAt: Date.now() + 3600000,
  };

  const evaluatorSession: SessionPayload = {
    userId: "eval-mon-test-id",
    email: "evaluator.mon@example.com",
    role: "EVALUATOR",
    name: "Eval Mon Tester",
    issuedAt: Date.now(),
    expiresAt: Date.now() + 3600000,
  };

  const participantSession: SessionPayload = {
    userId: "part-mon-test-id",
    email: "participant.mon@example.com",
    role: "PARTICIPANT",
    name: "Participant Mon Tester",
    issuedAt: Date.now(),
    expiresAt: Date.now() + 3600000,
  };

  before(async () => {
    // Clean up any existing test records with these emails
    const testEmails = [
      "admin.mon@example.com",
      "evaluator.mon@example.com",
      "participant.mon@example.com",
      "bulk.one@test.edu",
      "bulk.two@test.edu",
      "new.part@test.edu",
      "new.eval@test.edu",
    ];
    await prisma.user.deleteMany({ where: { email: { in: testEmails } } });

    // Ensure test users exist
    await prisma.user.create({
      data: {
        id: adminSession.userId,
        email: adminSession.email,
        name: adminSession.name,
        role: "ADMIN",
      },
    });

    await prisma.user.create({
      data: {
        id: evaluatorSession.userId,
        email: evaluatorSession.email,
        name: evaluatorSession.name,
        role: "EVALUATOR",
      },
    });

    await prisma.user.create({
      data: {
        id: participantSession.userId,
        email: participantSession.email,
        name: participantSession.name,
        role: "PARTICIPANT",
      },
    });

    // Create a real contest for test
    const contest = await prisma.contest.create({
      data: {
        title: "Monitoring Benchmark Challenge",
        slug: `mon-test-${Date.now()}`,
        track: "Track A",
        status: "LIVE",
        startDate: new Date(),
        endDate: new Date(Date.now() + 86400000),
      },
    });
    testContestId = contest.id;

    // Enroll participant
    await prisma.contestParticipant.create({
      data: {
        contestId: testContestId,
        userId: participantSession.userId,
        status: "ACTIVE",
      },
    });

    // Create Phase and Task with question
    const phase = await prisma.phase.create({
      data: {
        contestId: testContestId,
        phaseNumber: 1,
        title: "Phase 1 - Diagnostic",
        status: "OPEN",
        deadline: new Date(Date.now() + 86400000),
        weightPercentage: 50.0,
      },
    });
    testPhaseId = phase.id;

    const task = await prisma.task.create({
      data: {
        phaseId: testPhaseId,
        taskNumber: 1,
        title: "Task 1 - Security Policy",
      },
    });
    testTaskId = task.id;

    await prisma.question.create({
      data: {
        taskId: testTaskId,
        questionNumber: 1,
        type: "MCQ",
        prompt: "What is zero-trust architecture?",
        points: 10,
        options: {
          create: [
            { optionKey: "A", text: "Never trust, always verify" },
            { optionKey: "B", text: "Trust internal network unconditionally" },
          ],
        },
        answerKey: {
          create: {
            correctOptionKey: "A",
            explanation: "Never trust, always verify is the core philosophy.",
          },
        },
      },
    });
  });

  after(async () => {
    setTestSession(null);
    if (testContestId) {
      await prisma.contest.delete({ where: { id: testContestId } }).catch(() => {});
    }
    const testEmails = [
      "admin.mon@example.com",
      "evaluator.mon@example.com",
      "participant.mon@example.com",
      "bulk.one@test.edu",
      "bulk.two@test.edu",
      "new.part@test.edu",
      "new.eval@test.edu",
    ];
    await prisma.user.deleteMany({ where: { email: { in: testEmails } } }).catch(() => {});
  });

  describe("1. Admin Account Management & Scrypt Password Hashing", () => {
    it("Admin can create participant account with initial password", async () => {
      setTestSession(adminSession);
      const res = await createParticipantAccountAction({
        name: "New Student",
        email: "new.part@test.edu",
        role: "PARTICIPANT",
        institution: "Engineering Faculty",
        initialPassword: "CandidateSecret#2025",
        assignContestId: testContestId,
      });

      assert.strictEqual(res.success, true);
      assert.ok(res.user?.id);

      // Verify credentials stored as scrypt hash
      const creds = await getUserCredentials(res.user.id);
      assert.ok(creds, "Credentials record must exist in audit vault");
      assert.notStrictEqual(creds.passwordHash, "CandidateSecret#2025", "Hash must not be plaintext");
      assert.strictEqual(creds.salt.length, 32, "Salt must be 16 bytes hex");

      // Verify password verification succeeds
      const isValid = verifyPassword("CandidateSecret#2025", creds.passwordHash, creds.salt);
      assert.strictEqual(isValid, true, "Valid password must verify");

      const isInvalid = verifyPassword("WrongPassword", creds.passwordHash, creds.salt);
      assert.strictEqual(isInvalid, false, "Wrong password must be rejected");
    });

    it("Admin can create evaluator account with initial password", async () => {
      setTestSession(adminSession);
      const res = await createParticipantAccountAction({
        name: "Dr. Evaluator",
        email: "new.eval@test.edu",
        role: "EVALUATOR",
        institution: "Academic Examination Panel",
        initialPassword: "EvalPassword#2025",
      });

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.user?.role, "EVALUATOR");
    });

    it("Rejects duplicate email account creation", async () => {
      setTestSession(adminSession);
      const res = await createParticipantAccountAction({
        name: "Duplicate User",
        email: "new.part@test.edu",
        role: "PARTICIPANT",
      });

      assert.strictEqual(res.success, false);
      assert.match(res.error || "", /already exists/i);
    });

    it("Participant is forbidden from creating accounts", async () => {
      setTestSession(participantSession);
      const res = await createParticipantAccountAction({
        name: "Unauthorized Attempt",
        email: "unauth@test.edu",
        role: "PARTICIPANT",
      });

      assert.strictEqual(res.success, false);
      assert.match(res.error || "", /Forbidden/i);
    });
  });

  describe("2. Bulk CSV Import with Row-Level Validation", () => {
    it("Valid CSV successfully imports multiple users", async () => {
      setTestSession(adminSession);
      const csv = `Name,Email,Role,CandidateId,Institution,InitialPassword\n"Bulk One","bulk.one@test.edu","PARTICIPANT","ACI-801","Test Univ","Pass#2025"\n"Bulk Two","bulk.two@test.edu","EVALUATOR","","Faculty Board","Pass#2025"`;

      const result = await bulkImportUsersAction(csv, testContestId);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.importedCount, 2);
      assert.strictEqual(result.failedCount, 0);
    });

    it("Reports row-level errors for invalid rows and duplicates", async () => {
      setTestSession(adminSession);
      const invalidCsv = `Name,Email,Role\n"Bad Email","not-an-email","PARTICIPANT"\n"Duplicate","bulk.one@test.edu","PARTICIPANT"\n"Invalid Role","valid@test.edu","SUPERADMIN"`;

      const result = await bulkImportUsersAction(invalidCsv);
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.failedCount, 3);
      assert.strictEqual(result.errors.length, 3);

      assert.strictEqual(result.errors[0].row, 2);
      assert.match(result.errors[0].error, /email/i);

      assert.strictEqual(result.errors[1].row, 3);
      assert.match(result.errors[1].error, /already exists/i);

      assert.strictEqual(result.errors[2].row, 4);
      assert.match(result.errors[2].error, /Invalid role/i);
    });
  });

  describe("3. Contest-Specific Monitoring Permissions", () => {
    it("Admin can save and persist monitoring settings per contest", async () => {
      setTestSession(adminSession);
      const saveRes = await saveContestMonitoringSettingsAction(testContestId, {
        cameraEnabled: true,
        micEnabled: false,
        fullscreenEnabled: true,
        tabSwitchEnabled: true,
      });

      assert.strictEqual(saveRes.success, true);

      const fetchRes = await getContestMonitoringSettingsAction(testContestId);
      assert.strictEqual(fetchRes.cameraEnabled, true);
      assert.strictEqual(fetchRes.micEnabled, false);
      assert.strictEqual(fetchRes.fullscreenEnabled, true);
      assert.strictEqual(fetchRes.tabSwitchEnabled, true);
      // Truthful constraint: live broadcasting defaults to false/not available
      assert.strictEqual(fetchRes.liveWebcamEnabled, false);
      assert.strictEqual(fetchRes.liveScreenShareEnabled, false);
    });

    it("Participant is forbidden from altering monitoring settings", async () => {
      setTestSession(participantSession);
      const saveRes = await saveContestMonitoringSettingsAction(testContestId, {
        cameraEnabled: false,
      });

      assert.strictEqual(saveRes.success, false);
      assert.match(saveRes.error || "", /Forbidden/i);
    });
  });

  describe("4. Telemetry Event Logging & Neutral Audit Labels", () => {
    it("Participant logs neutral telemetry events", async () => {
      setTestSession(participantSession);

      const tabRes = await recordMonitoringEventAction({
        contestId: testContestId,
        eventType: "TAB_SWITCH",
        status: "Tab switch detected",
        details: "Window blur / visibilitychange detected",
      });
      assert.strictEqual(tabRes.success, true);

      const fsRes = await recordMonitoringEventAction({
        contestId: testContestId,
        eventType: "FULLSCREEN_EXIT",
        status: "Fullscreen exit recorded",
        details: "Fullscreen element exited",
      });
      assert.strictEqual(fsRes.success, true);

      const camRes = await recordMonitoringEventAction({
        contestId: testContestId,
        eventType: "CAMERA_STATUS",
        status: "Permission Granted",
        details: "Candidate granted webcam permission",
      });
      assert.strictEqual(camRes.success, true);
    });

    it("Monitoring dashboard displays candidate session and alert counts", async () => {
      setTestSession(adminSession);
      const dash = await getContestMonitoringDashboardAction(testContestId);

      assert.strictEqual(dash.success, true);
      assert.ok(dash.dashboard);
      assert.ok(dash.dashboard.participants.length > 0);

      const candidateSession = dash.dashboard.participants.find(
        (p) => p.userId === participantSession.userId
      );
      assert.ok(candidateSession);
      assert.ok(candidateSession.alertCount >= 2, "Tab switch and fullscreen exit must increment alerts");
      assert.strictEqual(candidateSession.cameraState, "Permission Granted");
      assert.strictEqual(candidateSession.fullscreenState, "Exit Recorded");
    });

    it("CSV export excludes passwords, secrets, and answers", async () => {
      setTestSession(adminSession);
      const exportRes = await exportMonitoringRecordsCsvAction(testContestId);

      assert.strictEqual(exportRes.success, true);
      assert.ok(exportRes.csvContent);

      assert.match(exportRes.csvContent, /Participant ID,Candidate Name,Email/);
      assert.doesNotMatch(exportRes.csvContent, /password/i);
      assert.doesNotMatch(exportRes.csvContent, /answerKey/i);
      assert.doesNotMatch(exportRes.csvContent, /correctOption/i);
    });
  });

  describe("5. Participant Assessment Answer Key Security", () => {
    it("Assessment API strictly omits answer keys from candidate payload", async () => {
      setTestSession(participantSession);
      const assessData = await getTaskAssessmentData();

      assert.ok(assessData.questions.length > 0);
      for (const q of assessData.questions) {
        assert.strictEqual((q as any).answerKey, undefined, "answerKey must never be exposed to candidate");
        assert.strictEqual((q as any).correctOptionKey, undefined, "correctOptionKey must never be exposed");
      }
    });
  });
});
