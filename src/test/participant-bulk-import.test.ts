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

describe("Bulk Participant Import & Contest Enrollment Workflow (Separate Candidate ID & Password)", () => {
  const testContestId = "88000000-0000-4000-8000-000000000001";

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
    // 0. Clean up any leftover test data using isolated test identifiers
    await prisma.contestParticipant.deleteMany({
      where: { contestId: testContestId },
    });
    await prisma.user.deleteMany({
      where: {
        OR: [
          {
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
          {
            email: {
              endsWith: "@acitest50.local",
            },
          },
          {
            candidateId: {
              startsWith: "TESTCID_",
            },
          },
        ],
      },
    });

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
        candidateId: "TESTCID_9999",
        institution: "Freedom CareerEdge Program",
        role: UserRole.PARTICIPANT,
      },
      create: {
        id: "88000000-0000-4000-8000-000000000099",
        email: testExistingEmail,
        name: "Existing Participant",
        candidateId: "TESTCID_9999",
        institution: "Freedom CareerEdge Program",
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
        OR: [
          {
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
          {
            email: {
              endsWith: "@acitest50.local",
            },
          },
          {
            candidateId: {
              startsWith: "TESTCID_",
            },
          },
        ],
      },
    });

    // Clean up test contest
    await prisma.contest.delete({
      where: { id: testContestId },
    }).catch(() => {});
  });

  test("1. previewParticipantImportCsvAction validates 5-column CSV with separate Candidate ID and Password", async () => {
    setTestSession(adminSession);

    const csvContent =
      "Name,Email,Candidate ID,Password,Team Number\n" +
      `Test User 1,${testCandidateEmail1},TESTCID_001,12345678,Freedom CareerEdge Program\n` +
      `Test User 2,${testCandidateEmail2},TESTCID_002,12345678,Freedom CareerEdge Program\n`;

    const preview = await previewParticipantImportCsvAction(csvContent, testContestId);

    assert.equal(preview.success, true);
    assert.equal(preview.totalRows, 2);
    assert.equal(preview.readyCount, 2);
    assert.equal(preview.invalidCount, 0);
    assert.equal(preview.duplicateInFileCount, 0);

    // Verify separate Candidate ID and Password fields in preview rows
    assert.equal(preview.previewRows[0].candidateId, "TESTCID_001");
    assert.equal(preview.previewRows[0].password, "12345678");
    assert.equal(preview.previewRows[0].teamNumber, "Freedom CareerEdge Program");
    assert.equal(preview.previewRows[0].status, "READY");

    assert.equal(preview.previewRows[1].candidateId, "TESTCID_002");
    assert.equal(preview.previewRows[1].password, "12345678");
    assert.equal(preview.previewRows[1].teamNumber, "Freedom CareerEdge Program");
    assert.equal(preview.previewRows[1].status, "READY");
  });

  test("2. previewParticipantImportCsvAction detects invalid rows and in-file duplicates", async () => {
    setTestSession(adminSession);

    const csvContent =
      "Name,Email,Candidate ID,Password,Team Number\n" +
      ",missingname@acitest.local,TESTCID_003,12345678,Freedom CareerEdge Program\n" + // Missing name
      "Bad Email,not-an-email,TESTCID_004,12345678,Freedom CareerEdge Program\n" + // Bad email
      "No Candidate ID,nocid@acitest.local,,12345678,Freedom CareerEdge Program\n" + // Missing Candidate ID
      "No Password,nopass@acitest.local,TESTCID_005,,Freedom CareerEdge Program\n" + // Missing password
      "Short Password,shortpass@acitest.local,TESTCID_006,123,Freedom CareerEdge Program\n" + // Short password (< 8 chars)
      "No Team,noteam@acitest.local,TESTCID_007,12345678,\n" + // Missing team
      `Duplicate Email One,${testCandidateEmail3},TESTCID_008,12345678,Freedom CareerEdge Program\n` +
      `Duplicate Email Two,${testCandidateEmail3},TESTCID_009,12345678,Freedom CareerEdge Program\n` + // Duplicate email in file
      `Duplicate CID One,diff1@acitest.local,TESTCID_010,12345678,Freedom CareerEdge Program\n` +
      `Duplicate CID Two,diff2@acitest.local,TESTCID_010,12345678,Freedom CareerEdge Program\n`; // Duplicate candidate ID in file

    const preview = await previewParticipantImportCsvAction(csvContent);

    assert.equal(preview.success, true);
    assert.equal(preview.totalRows, 10);
    assert.equal(preview.invalidCount, 6);
    assert.equal(preview.duplicateInFileCount, 2);

    const dupEmailRow = preview.previewRows.find(
      (r) => r.status === "DUPLICATE_IN_FILE" && r.email === testCandidateEmail3
    );
    assert.ok(dupEmailRow);

    const dupCidRow = preview.previewRows.find(
      (r) => r.status === "DUPLICATE_IN_FILE" && r.candidateId === "TESTCID_010"
    );
    assert.ok(dupCidRow);
  });

  test("3. executeParticipantImportAction stores separate Candidate ID and Password, sets mustChangePassword: true", async () => {
    setTestSession(adminSession);

    const csvContent =
      "Name,Email,Candidate ID,Password,Team Number\n" +
      `Test User 1,${testCandidateEmail1},TESTCID_001,12345678,Freedom CareerEdge Program\n`;

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
    assert.equal(user.name, "Test User 1");
    assert.equal(user.candidateId, "TESTCID_001");
    assert.equal(user.institution, "Freedom CareerEdge Program");
    assert.equal(user.role, UserRole.PARTICIPANT);
    assert.equal(user.mustChangePassword, true);
    assert.equal(user.isActive, true);

    // Password must be hashed with Scrypt and salt
    assert.ok(user.passwordHash && user.passwordHash.length > 30);
    assert.ok(user.passwordSalt && user.passwordSalt.length > 10);

    // Initial password 12345678 must verify correctly
    const isPasswordValid = verifyPassword("12345678", user.passwordHash, user.passwordSalt);
    assert.equal(isPasswordValid, true);

    // Candidate ID is NOT the password
    const isCidPasswordValid = verifyPassword("TESTCID_001", user.passwordHash, user.passwordSalt);
    assert.equal(isCidPasswordValid, false);
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
      "Name,Email,Candidate ID,Password,Team Number\n" +
      `Existing Participant,${testExistingEmail},TESTCID_9999,12345678,Freedom CareerEdge Program\n`;

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
      "Name,Email,Candidate ID,Password,Team Number\n" +
      `Standalone User,${testCandidateEmail4},TESTCID_099,12345678,Freedom CareerEdge Program\n`;

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
    assert.equal(user.candidateId, "TESTCID_099");

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
      "Name,Email,Candidate ID,Password,Team Number\n" +
      "Hacker User,hacker@acitest.local,TESTCID_9998,12345678,Freedom CareerEdge Program\n";

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
      `${testCandidateEmail4},TESTCID_099,Enrolled via legacy CSV format\n`;

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

  test("9. Bulk import 50 participants with same initial password (12345678) and unique Candidate IDs (TESTCID_50_001 - TESTCID_50_050)", async () => {
    setTestSession(adminSession);

    // Generate CSV for 50 participants
    const csvRows = ["Name,Email,Candidate ID,Password,Team Number"];
    for (let i = 1; i <= 50; i++) {
      const padIndex = String(i).padStart(3, "0");
      const name = `Participant Test ${i}`;
      const email = `participant${i}.test50@acitest50.local`;
      const candidateId = `TESTCID_50_${padIndex}`;
      const password = "12345678";
      const teamNumber = "Freedom CareerEdge Program";
      csvRows.push(`${name},${email},${candidateId},${password},${teamNumber}`);
    }
    const fiftyCsvContent = csvRows.join("\n");

    // 1. Pre-flight preview test
    const preview = await previewParticipantImportCsvAction(fiftyCsvContent, testContestId);
    assert.equal(preview.success, true);
    assert.equal(preview.totalRows, 50);
    assert.equal(preview.readyCount, 50);
    assert.equal(preview.invalidCount, 0);
    assert.equal(preview.duplicateInFileCount, 0);

    // Verify all 50 preview rows have separate candidateId and password
    for (let i = 0; i < 50; i++) {
      const padIndex = String(i + 1).padStart(3, "0");
      assert.equal(preview.previewRows[i].candidateId, `TESTCID_50_${padIndex}`);
      assert.equal(preview.previewRows[i].password, "12345678");
      assert.equal(preview.previewRows[i].teamNumber, "Freedom CareerEdge Program");
      assert.equal(preview.previewRows[i].status, "READY");
    }

    // 2. Execute import for all 50 participants
    const execResult = await executeParticipantImportAction({
      csvText: fiftyCsvContent,
      contestId: testContestId,
      enrollExistingAccounts: true,
    });

    assert.equal(execResult.success, true);
    assert.equal(execResult.totalRows, 50);
    assert.equal(execResult.createdCount, 50);
    assert.equal(execResult.enrolledCount, 50);
    assert.equal(execResult.failedCount, 0);

    // 3. Database verification for all 50 accounts
    const createdUsers = await prisma.user.findMany({
      where: {
        email: {
          endsWith: "@acitest50.local",
        },
      },
      include: {
        participants: {
          where: { contestId: testContestId },
        },
      },
    });

    assert.equal(createdUsers.length, 50);

    // Verify unique candidate IDs and credential constraints across all 50 records
    const candidateIdSet = new Set<string>();
    for (const u of createdUsers) {
      assert.ok(u.candidateId);
      assert.equal(candidateIdSet.has(u.candidateId), false, `Duplicate Candidate ID found: ${u.candidateId}`);
      candidateIdSet.add(u.candidateId);

      // Verify fields
      assert.equal(u.institution, "Freedom CareerEdge Program");
      assert.equal(u.role, UserRole.PARTICIPANT);
      assert.equal(u.mustChangePassword, true);
      assert.equal(u.isActive, true);

      // Verify initial password: must verify with 12345678
      assert.ok(u.passwordHash && u.passwordSalt);
      const isInitialPassValid = verifyPassword("12345678", u.passwordHash, u.passwordSalt);
      assert.equal(isInitialPassValid, true, `Password verification failed for user ${u.email}`);

      // Candidate ID must NOT be the password
      const isCidPassValid = verifyPassword(u.candidateId, u.passwordHash, u.passwordSalt);
      assert.equal(isCidPassValid, false, `Candidate ID should not work as password for ${u.email}`);

      // Verify contest enrollment
      assert.equal(u.participants.length, 1);
      assert.equal(u.participants[0].status, "ACTIVE");
    }

    assert.equal(candidateIdSet.size, 50);
  });
});
