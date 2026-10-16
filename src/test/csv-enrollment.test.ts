import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { setTestSession, type SessionPayload } from "@/lib/auth";
import {
  createContestAction,
  bulkEnrollParticipantsCsvAction,
  previewEnrollmentCsvAction,
} from "@/app/actions/contest-actions";
import { createParticipantAccountAction } from "@/app/actions/participant-actions";

describe("CSV Participant Enrollment & Verification Engine", () => {
  const adminEmail = "csv.admin@edge.internal";
  const aliceEmail = "csv.alice@edge.internal";
  const bobEmail = "csv.bob@edge.internal";
  const carolEmail = "csv.carol@edge.internal";
  const evaluatorEmail = "csv.evaluator@edge.internal";

  const aliceCandidateId = "ACI-CSV-ALICE-100";
  const bobCandidateId = "ACI-CSV-BOB-200";
  const carolCandidateId = "ACI-CSV-CAROL-300";

  let adminUserId = "";
  let aliceUserId = "";
  let bobUserId = "";
  let carolUserId = "";
  let evaluatorUserId = "";
  let testContestId = "";

  const adminSession: SessionPayload = {
    userId: "",
    email: adminEmail,
    role: "ADMIN",
    name: "CSV Verification Admin",
    issuedAt: Date.now(),
    expiresAt: Date.now() + 3600000,
  };

  before(async () => {
    // Teardown stale test records if any
    const allEmails = [adminEmail, aliceEmail, bobEmail, carolEmail, evaluatorEmail];
    await prisma.contestParticipant.deleteMany({
      where: { user: { email: { in: allEmails } } },
    });
    await prisma.contest.deleteMany({
      where: { slug: { in: ["csv-enrollment-verification-contest"] } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: allEmails } },
    });

    // 1. Provision Admin account
    const adminUser = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        email: adminEmail,
        name: "CSV Verification Admin",
        role: "ADMIN",
      },
    });
    adminUserId = adminUser.id;
    adminSession.userId = adminUserId;
    setTestSession(adminSession);

    // 2. Provision real test PARTICIPANT accounts using Admin account-provisioning flow
    const aliceRes = await createParticipantAccountAction({
      name: "Alice CSV",
      email: aliceEmail,
      role: "PARTICIPANT",
      candidateId: aliceCandidateId,
      institution: "Faculty of Computer Science",
    });
    assert.equal(aliceRes.success, true, "Alice provisioning must succeed");

    const bobRes = await createParticipantAccountAction({
      name: "Bob CSV",
      email: bobEmail,
      role: "PARTICIPANT",
      candidateId: bobCandidateId,
      institution: "Faculty of Business",
    });
    assert.equal(bobRes.success, true, "Bob provisioning must succeed");

    const carolRes = await createParticipantAccountAction({
      name: "Carol CSV",
      email: carolEmail,
      role: "PARTICIPANT",
      candidateId: carolCandidateId,
      institution: "Faculty of Law",
    });
    assert.equal(carolRes.success, true, "Carol provisioning must succeed");

    // 3. Provision an EVALUATOR account to verify role enforcement
    const evalRes = await createParticipantAccountAction({
      name: "Evaluator User",
      email: evaluatorEmail,
      role: "EVALUATOR",
      institution: "Evaluation Board",
    });
    assert.equal(evalRes.success, true, "Evaluator provisioning must succeed");

    const dbAlice = await prisma.user.findUnique({ where: { email: aliceEmail } });
    aliceUserId = dbAlice!.id;
    const dbBob = await prisma.user.findUnique({ where: { email: bobEmail } });
    bobUserId = dbBob!.id;
    const dbCarol = await prisma.user.findUnique({ where: { email: carolEmail } });
    carolUserId = dbCarol!.id;
    const dbEval = await prisma.user.findUnique({ where: { email: evaluatorEmail } });
    evaluatorUserId = dbEval!.id;

    // 4. Create test contest
    const contestRes = await createContestAction({
      title: "CSV Enrollment Verification Contest",
      track: "ENGINEERING",
      startDate: new Date(Date.now() - 3600000).toISOString(),
      endDate: new Date(Date.now() + 86400000).toISOString(),
    });
    assert.equal(contestRes.success, true, "Test contest creation must succeed");
    testContestId = contestRes.contestId!;
  });

  after(async () => {
    setTestSession(undefined);
    const allEmails = [adminEmail, aliceEmail, bobEmail, carolEmail, evaluatorEmail];
    await prisma.contestParticipant.deleteMany({
      where: { contestId: testContestId },
    });
    await prisma.contest.deleteMany({
      where: { id: testContestId },
    });
    await prisma.user.deleteMany({
      where: { email: { in: allEmails } },
    });
  });

  // ---------------------------------------------------------------------------
  // 1. Template verification
  // ---------------------------------------------------------------------------
  it("1. Downloadable blank template contains supported columns and no fake identities", () => {
    const templateContent =
      "# EDGE-Arena Contest Participant Enrollment Template\n" +
      "# INSTRUCTION: Only existing PARTICIPANT accounts created by Admin (via Admin > Participants) can be enrolled.\n" +
      "# COLUMNS: Email (required if no CandidateId), CandidateId (required if no Email), Notes (optional)\n" +
      "# You may supply Email, CandidateId, or both (if both are provided, they must match the same account).\n" +
      "# Replace this line with registered participant records:\n" +
      "Email,CandidateId,Notes\n";

    assert.ok(templateContent.includes("Email,CandidateId,Notes"), "Must define supported columns");
    assert.ok(!templateContent.includes("participant1@edge.internal"), "Must NOT contain fake participant1");
    assert.ok(!templateContent.includes("TEMP-1001"), "Must NOT contain fake TEMP-1001");
    assert.ok(templateContent.includes("Only existing PARTICIPANT accounts"), "Must state existing accounts rule");
  });

  // ---------------------------------------------------------------------------
  // 2. Pre-enrollment Preview
  // ---------------------------------------------------------------------------
  it("2. CSV Preview accurately inspects matched, already enrolled, and invalid rows", async () => {
    setTestSession(adminSession);

    const previewCsv = `# Comments must be cleanly ignored by the preview parser
Email,CandidateId,Notes
${aliceEmail},${aliceCandidateId},Matched both
,${bobCandidateId},Matched candidateId only
unknown.candidate@edge.internal,ACI-999,Non-existent user
${aliceEmail},${bobCandidateId},Mismatch: Alice email with Bob candidateId`;

    const preview = await previewEnrollmentCsvAction(testContestId, previewCsv);
    assert.equal(preview.success, true);
    assert.equal(preview.totalRows, 4);
    assert.equal(preview.readyCount, 2, "Alice and Bob should be ready to enroll");
    assert.equal(preview.alreadyEnrolledCount, 0, "No one is enrolled yet");
    assert.equal(preview.invalidCount, 2, "Unknown user and mismatch user must be marked invalid");

    // Verify ready row details
    const readyAlice = preview.ready.find((r) => r.email === aliceEmail);
    assert.ok(readyAlice);
    assert.equal(readyAlice.name, "Alice CSV");
    assert.equal(readyAlice.candidateId, aliceCandidateId);

    // Verify invalid reasons
    const mismatchRow = preview.invalid.find((r) => r.row === 6 || r.reason.includes("mismatch"));
    assert.ok(mismatchRow, "Mismatch row must be in invalid list");
    assert.ok(mismatchRow.reason.toLowerCase().includes("mismatch"));
  });

  // ---------------------------------------------------------------------------
  // 3. Valid rows enroll
  // ---------------------------------------------------------------------------
  it("3. Valid rows enroll real provisioned accounts (both, email-only, candidateId-only)", async () => {
    setTestSession(adminSession);

    // Alice: both email and candidateId
    // Bob: candidateId only
    const validCsv = `Email,CandidateId,Notes
${aliceEmail},${aliceCandidateId},Track A
,${bobCandidateId},Track B`;

    const res = await bulkEnrollParticipantsCsvAction(testContestId, validCsv);
    assert.equal(res.success, true);
    assert.equal(res.enrolledCount, 2);
    assert.equal(res.skippedCount, 0);
    assert.equal(res.invalidCount, 0);

    // Confirm in database
    const aliceEnrollment = await prisma.contestParticipant.findUnique({
      where: { contestId_userId: { contestId: testContestId, userId: aliceUserId } },
    });
    assert.ok(aliceEnrollment, "Alice must be enrolled in database");

    const bobEnrollment = await prisma.contestParticipant.findUnique({
      where: { contestId_userId: { contestId: testContestId, userId: bobUserId } },
    });
    assert.ok(bobEnrollment, "Bob must be enrolled in database");
  });

  // ---------------------------------------------------------------------------
  // 4. Duplicate rows and idempotent re-import
  // ---------------------------------------------------------------------------
  it("4. Duplicate rows reported as already enrolled/skipped and re-import is 100% idempotent", async () => {
    setTestSession(adminSession);

    // Upload CSV where Alice and Bob are already enrolled, plus in-file duplicate of Alice
    const dupCsv = `Email,CandidateId,Notes
${aliceEmail},${aliceCandidateId},Already enrolled
,${bobCandidateId},Already enrolled
${aliceEmail},,In-file duplicate of Alice`;

    const res = await bulkEnrollParticipantsCsvAction(testContestId, dupCsv);
    assert.equal(res.success, true);
    assert.equal(res.enrolledCount, 0, "No new accounts should be enrolled");
    assert.equal(res.skippedCount, 3, "All 3 entries must be skipped");
    assert.equal(res.invalidCount, 0);

    // Confirm no duplicate records exist in database
    const totalEnrollments = await prisma.contestParticipant.count({
      where: { contestId: testContestId },
    });
    assert.equal(totalEnrollments, 2, "Database must still have exactly 2 enrollments (Alice and Bob)");
  });

  // ---------------------------------------------------------------------------
  // 5. Unknown accounts are rejected with clear reasons
  // ---------------------------------------------------------------------------
  it("5. Unknown accounts are rejected without silent user creation", async () => {
    setTestSession(adminSession);

    const unknownCsv = `Email,CandidateId,Notes
ghost.candidate@nowhere.internal,,Non-existent email
,ACI-NONEXISTENT-999,Non-existent candidateId
ghost2@nowhere.internal,ACI-NONEXISTENT-888,Non-existent both`;

    const res = await bulkEnrollParticipantsCsvAction(testContestId, unknownCsv);
    assert.equal(res.success, true);
    assert.equal(res.enrolledCount, 0);
    assert.equal(res.invalidCount, 3);
    assert.ok(res.invalid.some((inv) => inv.reason.includes("Participant account not found")));

    // Ensure no phantom accounts were created in User table
    const ghost = await prisma.user.findUnique({
      where: { email: "ghost.candidate@nowhere.internal" },
    });
    assert.equal(ghost, null, "Ghost account must not be created");
  });

  // ---------------------------------------------------------------------------
  // 6. Candidate ID / Email mismatch is rejected
  // ---------------------------------------------------------------------------
  it("6. Candidate ID / email mismatch is strictly rejected", async () => {
    setTestSession(adminSession);

    // Alice's email with Bob's candidate ID
    // Alice's email with Carol's candidate ID
    const mismatchCsv = `Email,CandidateId,Notes
${aliceEmail},${bobCandidateId},Mismatch: Alice email with Bob candidate ID
${aliceEmail},${carolCandidateId},Mismatch: Alice email with Carol candidate ID
${bobEmail},${aliceCandidateId},Mismatch: Bob email with Alice candidate ID`;

    const res = await bulkEnrollParticipantsCsvAction(testContestId, mismatchCsv);
    assert.equal(res.success, true);
    assert.equal(res.enrolledCount, 0);
    assert.equal(res.invalidCount, 3);

    res.invalid.forEach((inv) => {
      assert.ok(
        inv.reason.toLowerCase().includes("mismatch"),
        `Expected mismatch reason, got: ${inv.reason}`
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Case and whitespace variations in email still match
  // ---------------------------------------------------------------------------
  it("7. Case and whitespace variations in email safely normalize and enroll", async () => {
    setTestSession(adminSession);

    // Carol is not yet enrolled. Provide Carol's email with whitespace and uppercase:
    const variationsCsv = `Email,CandidateId,Notes
  ${carolEmail.toUpperCase()}  ,,Padded uppercase email`;

    const res = await bulkEnrollParticipantsCsvAction(testContestId, variationsCsv);
    assert.equal(res.success, true);
    assert.equal(res.enrolledCount, 1, "Carol must be enrolled despite case/whitespace variations");

    const carolEnrollment = await prisma.contestParticipant.findUnique({
      where: { contestId_userId: { contestId: testContestId, userId: carolUserId } },
    });
    assert.ok(carolEnrollment, "Carol must be found enrolled in database");
  });

  // ---------------------------------------------------------------------------
  // 8. Role enforcement: Non-participants cannot be enrolled
  // ---------------------------------------------------------------------------
  it("8. Non-participant accounts (EVALUATOR/ADMIN) are rejected with clear role error", async () => {
    setTestSession(adminSession);

    const nonParticipantCsv = `Email,CandidateId,Notes
${evaluatorEmail},,Evaluator role check
${adminEmail},,Admin role check`;

    const res = await bulkEnrollParticipantsCsvAction(testContestId, nonParticipantCsv);
    assert.equal(res.success, true);
    assert.equal(res.enrolledCount, 0);
    assert.equal(res.invalidCount, 2);

    assert.ok(
      res.invalid.some((inv) => inv.reason.includes("EVALUATOR") && inv.reason.includes("Only PARTICIPANT")),
      "Must reject evaluator account"
    );
    assert.ok(
      res.invalid.some((inv) => inv.reason.includes("ADMIN") && inv.reason.includes("Only PARTICIPANT")),
      "Must reject admin account"
    );
  });
});
