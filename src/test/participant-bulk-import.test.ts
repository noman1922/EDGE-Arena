import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { setTestSession } from "../lib/auth";
import { UserRole, ContestStatus } from "@prisma/client";
import { verifyPassword } from "../lib/credentials";
import {
  previewParticipantImportCsvAction,
  executeParticipantImportAction,
} from "../app/actions/participant-actions";
import { bulkEnrollParticipantsCsvAction } from "../app/actions/contest-actions";

describe("Bulk Participant Import & Contest Enrollment Workflow", () => {
  const testContestId = "88000000-0000-4000-8000-000000000001";
  const testCohortId = "88000000-0000-4000-8000-000000000002";

  const testCandidateEmail1 = "test.cl.participant1@acitest.local";
  const testCandidateEmail2 = "test.cl.participant2@acitest.local";
  const testCandidateEmail3 = "test.cl.participant3@acitest.local";
  const testCandidateEmail4 = "test.cl.participant4@acitest.local";
  const testExistingEmail = "test.cl.existing@acitest.local";

  const adminSession = {
    userId: "admin-bulk-test-user-id",
    email: "admin@gmail.com",
    role: "ADMIN" as const,
    name: "Admin User",
  };

  const participantSession = {
    userId: "participant-bulk-test-user-id",
    email: "participant@acitest.local",
    role: "PARTICIPANT" as const,
    name: "Participant User",
  };

  before(async () => {
    // 1. Create test contest
    await prisma.contest.upsert({
      where: { id: testContestId },
      update: {
        title: "CL Sales Assessment Test Contest",
        slug: "cl-sales-assessment-test-contest",
        status: ContestStatus.LIVE,
        startDate: new Date("2026-01-01T00:00:00Z"),
        endDate: new Date("2026-12-31T23:59:59Z"),
        isPublished: false,
      },
      create: {
        id: testContestId,
        title: "CL Sales Assessment Test Contest",
        slug: "cl-sales-assessment-test-contest",
        track: "Sales Leadership",
        status: ContestStatus.LIVE,
        startDate: new Date("2026-01-01T00:00:00Z"),
        endDate: new Date("2026-12-31T23:59:59Z"),
        isPublished: false,
      },
    });

    // 2. Pre-create an existing user to test existing-account handling
    await prisma.user.upsert({
      where: { email: testExistingEmail },
      update: {
        candidateId: "CL9999",
        institution: "Team 9",
        role: UserRole.PARTICIPANT,
      },
      create: {
        id: "88000000-0000-4000-8000-000000000099",
        email: testExistingEmail,
        name: "Existing Participant",
        candidateId: "CL9999",
        institution: "Team 9",
        role: UserRole.PARTICIPANT,
        isActive: true,
        mustChangePassword: true,
      },
    });

    setTestSession(adminSession);
  });

  after(async () => {
    // Clean up test enrollments
    await prisma.contestParticipant.deleteMany({
      where: { contestId: testContestId },
    });

    // Clean up test users
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            testCandidateEmail1,
            testCandidateEmail2,
            testCandidateEmail3,
            testCandidateEmail4,
            testExistingEmail,
          ],
        },
      },
    });

    // Clean up test contest
    await prisma.contest.delete({
      where: { id: testContestId },
    }).catch(() => {});
  });

  test("1. previewParticipantImportCsvAction validates CSV and never exposes raw passwords", async () => {
    setTestSession(adminSession);

    const csvContent =
      "Name,Email,Password,Team Number\n" +
      `K. M. Shajin,${testCandidateEmail1},TESTCL01,Team 1\n` +
      `Sk Ishraaq Arefin,${testCandidateEmail2},TESTCL02,Team 2\n`;

    const preview = await previewParticipantImportCsvAction(csvContent, testContestId);

    assert.equal(preview.success, true);
    assert.equal(preview.totalRows, 2);
    assert.equal(preview.readyCount, 2);
    assert.equal(preview.invalidCount, 0);
    assert.equal(preview.duplicateInFileCount, 0);

    // SECURITY CHECK: Raw passwords must never be present in preview rows
    assert.equal((preview.previewRows[0] as unknown as Record<string, unknown>).password, undefined);
    assert.equal((preview.previewRows[1] as unknown as Record<string, unknown>).password, undefined);

    assert.equal(preview.previewRows[0].candidateId, "TESTCL01");
    assert.equal(preview.previewRows[0].teamNumber, "Team 1");
    assert.equal(preview.previewRows[0].status, "READY");
  });

  test("2. previewParticipantImportCsvAction detects invalid rows and in-file duplicates", async () => {
    setTestSession(adminSession);

    const csvContent =
      "Name,Email,Password,Team Number\n" +
      ",missingname@acitest.local,TESTCL03,Team 1\n" + // Invalid: missing name
      "Bad Email,not-an-email,TESTCL04,Team 1\n" + // Invalid: bad email
      "No Password,nopass@acitest.local,,Team 1\n" + // Invalid: missing password
      "No Team,noteam@acitest.local,TESTCL05,\n" + // Invalid: missing team
      `Duplicate One,${testCandidateEmail3},TESTCL06,Team 3\n` +
      `Duplicate Two,${testCandidateEmail3},TESTCL07,Team 3\n`; // Duplicate email in file

    const preview = await previewParticipantImportCsvAction(csvContent);

    assert.equal(preview.success, true);
    assert.equal(preview.totalRows, 6);
    assert.equal(preview.readyCount, 1);
    assert.equal(preview.invalidCount, 4);
    assert.equal(preview.duplicateInFileCount, 1);

    const dupRow = preview.previewRows.find((r) => r.status === "DUPLICATE_IN_FILE");
    assert.ok(dupRow);
    assert.equal(dupRow.email, testCandidateEmail3);
  });

  test("3. executeParticipantImportAction securely hashes passwords, sets mustChangePassword, and assigns team", async () => {
    setTestSession(adminSession);

    const csvContent =
      "Name,Email,Password,Team Number\n" +
      `K. M. Shajin,${testCandidateEmail1},TESTCL01,Team 1\n`;

    const result = await executeParticipantImportAction({
      csvText: csvContent,
      contestId: testContestId,
    });

    assert.equal(result.success, true);
    assert.equal(result.createdCount, 1);
    assert.equal(result.enrolledCount, 1);
    assert.equal(result.failedCount, 0);

    // Verify persisted database record
    const user = await prisma.user.findUnique({
      where: { email: testCandidateEmail1 },
    });

    assert.ok(user !== null);
    assert.equal(user.name, "K. M. Shajin");
    assert.equal(user.candidateId, "TESTCL01");
    assert.equal(user.institution, "Team 1");
    assert.equal(user.role, UserRole.PARTICIPANT);
    assert.equal(user.mustChangePassword, true);
    assert.equal(user.isActive, true);

    // Password must be hashed with Scrypt and salt
    assert.ok(user.passwordHash && user.passwordHash.length > 30);
    assert.ok(user.passwordSalt && user.passwordSalt.length > 10);

    // Initial password / code must verify correctly
    const isPasswordValid = verifyPassword("TESTCL01", user.passwordHash, user.passwordSalt);
    assert.equal(isPasswordValid, true);

    // Wrong password must fail
    const isWrongPasswordValid = verifyPassword("WRONGPASS", user.passwordHash, user.passwordSalt);
    assert.equal(isWrongPasswordValid, false);
  });

  test("4. executeParticipantImportAction enrolls new participants into the contest", async () => {
    const enrollment = await prisma.contestParticipant.findFirst({
      where: {
        contestId: testContestId,
        user: { email: testCandidateEmail1 },
      },
    });

    assert.ok(enrollment !== null);
    assert.equal(enrollment.status, "ACTIVE");
  });

  test("5. executeParticipantImportAction handles existing accounts idempotently without duplication", async () => {
    setTestSession(adminSession);

    // Import with testExistingEmail that already exists in DB
    const csvContent =
      "Name,Email,Password,Team Number\n" +
      `Existing Candidate,${testExistingEmail},CL9999,Team 9\n`;

    const result = await executeParticipantImportAction({
      csvText: csvContent,
      contestId: testContestId,
      enrollExistingAccounts: true,
    });

    assert.equal(result.success, true);
    assert.equal(result.createdCount, 0); // Not created again
    assert.equal(result.enrolledCount, 1); // Enrolled into contest
    assert.equal(result.failedCount, 0);

    // Verify existing user was enrolled
    const enrollment = await prisma.contestParticipant.findFirst({
      where: {
        contestId: testContestId,
        user: { email: testExistingEmail },
      },
    });
    assert.ok(enrollment !== null);

    // Run again to verify idempotency (should skip when already enrolled)
    const secondResult = await executeParticipantImportAction({
      csvText: csvContent,
      contestId: testContestId,
      enrollExistingAccounts: true,
    });

    assert.equal(secondResult.createdCount, 0);
    assert.equal(secondResult.enrolledCount, 0);
    assert.equal(secondResult.skippedCount, 1);
    assert.equal(secondResult.details[0].status, "SKIPPED_EXISTING");
  });

  test("6. executeParticipantImportAction supports import without immediate contest enrollment", async () => {
    setTestSession(adminSession);

    const csvContent =
      "Name,Email,Password,Team Number\n" +
      `Standalone User,${testCandidateEmail4},CL0199,Team 5\n`;

    // No contestId passed
    const result = await executeParticipantImportAction({
      csvText: csvContent,
    });

    assert.equal(result.success, true);
    assert.equal(result.createdCount, 1);
    assert.equal(result.enrolledCount, 0);
    assert.equal(result.details[0].status, "CREATED");

    // Verify account exists but is not enrolled in test contest
    const user = await prisma.user.findUnique({
      where: { email: testCandidateEmail4 },
    });
    assert.ok(user !== null);

    const enrollment = await prisma.contestParticipant.findFirst({
      where: {
        contestId: testContestId,
        userId: user.id,
      },
    });
    assert.equal(enrollment, null);
  });

  test("7. Server actions strictly reject non-admin users", async () => {
    setTestSession(participantSession);

    const csvContent =
      "Name,Email,Password,Team Number\n" +
      "Hacker User,hacker@acitest.local,CL9999,Team 1\n";

    // Non-admin preview
    const previewRes = await previewParticipantImportCsvAction(csvContent);
    assert.equal(previewRes.success, false);
    assert.ok(
      previewRes.error?.toLowerCase().includes("unauthorized") ||
        previewRes.error?.toLowerCase().includes("admin") ||
        previewRes.error?.toLowerCase().includes("access denied") ||
        previewRes.error?.toLowerCase().includes("forbidden")
    );

    // Non-admin execute
    const execRes = await executeParticipantImportAction({
      csvText: csvContent,
    });
    assert.equal(execRes.success, false);
    assert.ok(
      execRes.error?.toLowerCase().includes("unauthorized") ||
        execRes.error?.toLowerCase().includes("admin") ||
        execRes.error?.toLowerCase().includes("access denied") ||
        execRes.error?.toLowerCase().includes("forbidden")
    );
  });

  test("8. Backward compatibility: Existing contest enrollment CSV (Email,CandidateId,Notes) remains functional", async () => {
    setTestSession(adminSession);

    // The legacy bulk enrollment importer in contest-actions.ts expects existing accounts with Email,CandidateId,Notes
    const legacyCsv =
      "Email,CandidateId,Notes\n" +
      `${testCandidateEmail4},CL0199,Enrolled via legacy CSV format\n`;

    const enrollRes = await bulkEnrollParticipantsCsvAction(testContestId, legacyCsv);

    assert.equal(enrollRes.success, true);
    assert.equal(enrollRes.enrolledCount, 1);
    assert.equal(enrollRes.invalidCount, 0);

    const enrollment = await prisma.contestParticipant.findFirst({
      where: {
        contestId: testContestId,
        user: { email: testCandidateEmail4 },
      },
    });
    assert.ok(enrollment !== null);
    assert.equal(enrollment.status, "ACTIVE");
  });
});
