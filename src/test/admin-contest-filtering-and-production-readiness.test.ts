/**
 * EDGE-Arena / ACI Career EDGE Assess
 * Admin Contest Filtering & Production Readiness Test Suite
 *
 * Verifies:
 * 1. Global unique enrolled candidates counting prevents double-counting across multiple contests.
 * 2. Contest-specific enrolled candidate counting strictly reflects the selected contest.
 * 3. getAdminOverviewSummaryAction returns accurate scope, globalUniqueEnrolled, and contestSpecificEnrollments.
 * 4. Submissions queries (getSubmissionsForGrading & getAdminSubmissionsList) filter accurately by contest scope and support "ALL".
 * 5. Production UI text integrity: checks that demo-style labels, hardcoded diagnostic strings,
 *    and unverified status badges are eliminated from production dashboard files.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { setTestSession } from "@/lib/auth";
import {
  getAdminOverviewSummaryAction,
  getAdminContestOptions,
} from "@/app/actions/contest-actions";
import { getSubmissionsForGrading } from "@/app/actions/evaluator-actions";
import { getAdminSubmissionsList } from "@/app/actions/results-actions";

// Deterministic Test Identifiers
const TEST_ADMIN_ID = "33333333-0000-4000-8000-000000000001";
const TEST_ADMIN_EMAIL = "admin.production.test@edge-arena.internal";

const TEST_CONTEST_A_ID = "44444444-0000-4000-8000-000000000001";
const TEST_CONTEST_B_ID = "44444444-0000-4000-8000-000000000002";

const TEST_CANDIDATE_1_ID = "55555555-0000-4000-8000-000000000001"; // Enrolled in Contest A & Contest B (cross-contest)
const TEST_CANDIDATE_2_ID = "55555555-0000-4000-8000-000000000002"; // Enrolled in Contest A only
const TEST_CANDIDATE_3_ID = "55555555-0000-4000-8000-000000000003"; // Enrolled in Contest B only

test.describe("Admin Contest Filtering & Production Readiness", () => {
  test.before(async () => {
    // Authenticate as Admin
    setTestSession({
      userId: TEST_ADMIN_ID,
      email: TEST_ADMIN_EMAIL,
      role: "ADMIN",
      name: "Production System Administrator",
    });

    // Clean up test artifacts if leftover from prior interrupted runs
    await prisma.submission.deleteMany({
      where: { contestId: { in: [TEST_CONTEST_A_ID, TEST_CONTEST_B_ID] } },
    });
    await prisma.contestParticipant.deleteMany({
      where: { contestId: { in: [TEST_CONTEST_A_ID, TEST_CONTEST_B_ID] } },
    });
    await prisma.contest.deleteMany({
      where: { id: { in: [TEST_CONTEST_A_ID, TEST_CONTEST_B_ID] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [TEST_ADMIN_ID, TEST_CANDIDATE_1_ID, TEST_CANDIDATE_2_ID, TEST_CANDIDATE_3_ID] } },
    });

    // 1. Create Admin User
    await prisma.user.create({
      data: {
        id: TEST_ADMIN_ID,
        email: TEST_ADMIN_EMAIL,
        name: "Production System Administrator",
        role: "ADMIN",
        passwordHash: "test_pw_hash",
      },
    });

    // 2. Create 3 Candidates
    await prisma.user.createMany({
      data: [
        {
          id: TEST_CANDIDATE_1_ID,
          email: "candidate1.filtertest@example.com",
          name: "Filter Candidate Alpha",
          role: "PARTICIPANT",
          passwordHash: "test_hash",
        },
        {
          id: TEST_CANDIDATE_2_ID,
          email: "candidate2.filtertest@example.com",
          name: "Filter Candidate Beta",
          role: "PARTICIPANT",
          passwordHash: "test_hash",
        },
        {
          id: TEST_CANDIDATE_3_ID,
          email: "candidate3.filtertest@example.com",
          name: "Filter Candidate Gamma",
          role: "PARTICIPANT",
          passwordHash: "test_hash",
        },
      ],
    });

    // 3. Create Contest A and Contest B
    const now = new Date();
    const startDate = new Date(now.getTime() - 3600000);
    const endDate = new Date(now.getTime() + 86400000);

    await prisma.contest.create({
      data: {
        id: TEST_CONTEST_A_ID,
        slug: "test-contest-filtering-alpha",
        title: "Contest Filtering Scope Alpha",
        track: "Executive Diagnostics",
        status: "LIVE",
        startDate,
        endDate,
      },
    });

    await prisma.contest.create({
      data: {
        id: TEST_CONTEST_B_ID,
        slug: "test-contest-filtering-beta",
        title: "Contest Filtering Scope Beta",
        track: "Technical Architecture",
        status: "LIVE",
        startDate,
        endDate,
      },
    });

    // 4. Enroll Candidates:
    // Candidate 1 -> Contest A AND Contest B
    // Candidate 2 -> Contest A only
    // Candidate 3 -> Contest B only
    // Total contest enrollments = 4 rows (A: 2, B: 2)
    // Total unique enrolled candidates across these two = 3 unique users (NO double counting!)
    await prisma.contestParticipant.createMany({
      data: [
        {
          contestId: TEST_CONTEST_A_ID,
          userId: TEST_CANDIDATE_1_ID,
          status: "ENROLLED",
        },
        {
          contestId: TEST_CONTEST_A_ID,
          userId: TEST_CANDIDATE_2_ID,
          status: "ENROLLED",
        },
        {
          contestId: TEST_CONTEST_B_ID,
          userId: TEST_CANDIDATE_1_ID,
          status: "ENROLLED",
        },
        {
          contestId: TEST_CONTEST_B_ID,
          userId: TEST_CANDIDATE_3_ID,
          status: "ENROLLED",
        },
      ],
    });
  });

  test.after(async () => {
    // Teardown test records
    await prisma.submission.deleteMany({
      where: { contestId: { in: [TEST_CONTEST_A_ID, TEST_CONTEST_B_ID] } },
    });
    await prisma.contestParticipant.deleteMany({
      where: { contestId: { in: [TEST_CONTEST_A_ID, TEST_CONTEST_B_ID] } },
    });
    await prisma.contest.deleteMany({
      where: { id: { in: [TEST_CONTEST_A_ID, TEST_CONTEST_B_ID] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [TEST_ADMIN_ID, TEST_CANDIDATE_1_ID, TEST_CANDIDATE_2_ID, TEST_CANDIDATE_3_ID] } },
    });
  });

  test("1. Global Enrolled Candidates prevents double-counting across multiple contests", async () => {
    // Fetch global overview summary
    const globalSummary = await getAdminOverviewSummaryAction("ALL");

    assert.equal(globalSummary.scope, "ALL", "Scope must be 'ALL'");
    assert.ok(globalSummary.globalUniqueEnrolled > 0, "Global unique candidates must be greater than zero");
    assert.equal(
      globalSummary.totalEnrolled,
      globalSummary.globalUniqueEnrolled,
      "In global scope, totalEnrolled must equal globalUniqueEnrolled"
    );

    // Verify against direct distinct userId count in DB
    const distinctUsersInDb = await prisma.contestParticipant.findMany({
      select: { userId: true },
      distinct: ["userId"],
    });
    const totalParticipantRowsInDb = await prisma.contestParticipant.count();

    assert.equal(
      globalSummary.globalUniqueEnrolled,
      distinctUsersInDb.length,
      "globalUniqueEnrolled must exactly match distinct user count in database"
    );

    // Since candidate 1 is enrolled in both Alpha and Beta, distinct count must be strictly less than total rows
    assert.ok(
      distinctUsersInDb.length < totalParticipantRowsInDb,
      "Double-counting check: distinct candidate count must be less than total enrollment rows"
    );
  });

  test("2. Contest-specific scope returns accurate scoped candidate count and title", async () => {
    // Scoped to Contest Alpha
    const summaryA = await getAdminOverviewSummaryAction(TEST_CONTEST_A_ID);
    assert.equal(summaryA.scope, TEST_CONTEST_A_ID, "Scope must be Contest A ID");
    assert.equal(summaryA.selectedContestTitle, "Contest Filtering Scope Alpha");
    assert.equal(summaryA.totalEnrolled, 2, "Contest A has exactly 2 enrolled candidates (Candidate 1 & 2)");
    assert.equal(summaryA.contestSpecificEnrollments, 2);

    // Scoped to Contest Beta
    const summaryB = await getAdminOverviewSummaryAction(TEST_CONTEST_B_ID);
    assert.equal(summaryB.scope, TEST_CONTEST_B_ID, "Scope must be Contest B ID");
    assert.equal(summaryB.selectedContestTitle, "Contest Filtering Scope Beta");
    assert.equal(summaryB.totalEnrolled, 2, "Contest B has exactly 2 enrolled candidates (Candidate 1 & 3)");
    assert.equal(summaryB.contestSpecificEnrollments, 2);

    // Both scoped results retain the de-duplicated globalUniqueEnrolled reference
    assert.equal(summaryA.globalUniqueEnrolled, summaryB.globalUniqueEnrolled);
  });

  test("3. getAdminContestOptions returns test contests with active status", async () => {
    const options = await getAdminContestOptions();
    assert.ok(Array.isArray(options), "Options must be an array");

    const optionA = options.find((o) => o.id === TEST_CONTEST_A_ID);
    const optionB = options.find((o) => o.id === TEST_CONTEST_B_ID);

    assert.ok(optionA, "Contest A must be included in options");
    assert.equal(optionA?.title, "Contest Filtering Scope Alpha");
    assert.ok(optionB, "Contest B must be included in options");
    assert.equal(optionB?.title, "Contest Filtering Scope Beta");
  });

  test("4. Submissions scoping filters strictly by contest and supports ALL", async () => {
    // Create a phase and task for Contest A
    const phaseA = await prisma.phase.create({
      data: {
        contestId: TEST_CONTEST_A_ID,
        title: "Phase 1 - Diagnostic",
        phaseNumber: 1,
        weightPercentage: 100,
        deadline: new Date(Date.now() + 86400000),
        status: "OPEN",
      },
    });

    const taskA = await prisma.task.create({
      data: {
        phaseId: phaseA.id,
        title: "Task Alpha 1",
        taskNumber: 1,
        totalPoints: 100,
      },
    });

    // Create a submission for Candidate 1 in Contest A
    const subA = await prisma.submission.create({
      data: {
        contest: { connect: { id: TEST_CONTEST_A_ID } },
        phase: { connect: { id: phaseA.id } },
        task: { connect: { id: taskA.id } },
        user: { connect: { id: TEST_CANDIDATE_1_ID } },
        status: "SUBMITTED",
        autoGradeScore: 40,
        manualGradeScore: null,
        finalScore: 40,
        submittedAt: new Date(),
      },
    });

    // Query submissions scoped to Contest A
    const subsA = await getSubmissionsForGrading(TEST_CONTEST_A_ID);
    const foundSubA = subsA.find((s) => s.id === subA.id);
    assert.ok(foundSubA, "Submission for Contest A must be found when querying Contest A");

    // Query submissions scoped to Contest B -> must NOT contain Contest A submission
    const subsB = await getSubmissionsForGrading(TEST_CONTEST_B_ID);
    const foundInB = subsB.find((s) => s.id === subA.id);
    assert.equal(foundInB, undefined, "Submission for Contest A must NOT appear in Contest B query");

    // getAdminSubmissionsList with "ALL" scope
    const listAll = await getAdminSubmissionsList("ALL");
    assert.equal(listAll.selectedContestId, "ALL");
    assert.equal(listAll.contestTitle, "All Contests (Global Scope)");
    assert.ok(listAll.submissions.some((s) => s.id === subA.id), "Contest A submission must appear in ALL scope");

    // getAdminSubmissionsList scoped to Contest A
    const listA = await getAdminSubmissionsList(TEST_CONTEST_A_ID);
    assert.equal(listA.selectedContestId, TEST_CONTEST_A_ID);
    assert.equal(listA.contestTitle, "Contest Filtering Scope Alpha");
    assert.ok(listA.submissions.some((s) => s.id === subA.id));

    // getAdminSubmissionsList scoped to Contest B
    const listB = await getAdminSubmissionsList(TEST_CONTEST_B_ID);
    assert.equal(listB.selectedContestId, TEST_CONTEST_B_ID);
    assert.equal(listB.submissions.filter((s) => s.id === subA.id).length, 0);

    // Clean up task & phase
    await prisma.submission.delete({ where: { id: subA.id } });
    await prisma.task.delete({ where: { id: taskA.id } });
    await prisma.phase.delete({ where: { id: phaseA.id } });
  });

  test("5. Audit production dashboard files for obsolete demo and placeholder strings", () => {
    const filesToAudit = [
      "src/app/admin/page.tsx",
      "src/app/admin/submissions/page.tsx",
      "src/app/admin/results/page.tsx",
      "src/components/layout/admin-header.tsx",
      "src/components/layout/admin-sidebar.tsx",
      "src/components/layout/participant-header.tsx",
    ];

    const forbiddenPatterns = [
      { pattern: /Cohort CLP-2025 \(Demo\)/i, desc: "Cohort CLP-2025 (Demo) inconsistency" },
      { pattern: /Admin Authorized/i, desc: "Hardcoded Admin Authorized badge" },
      { pattern: /Enterprise Diagnostic/i, desc: "Misleading Enterprise Diagnostic banner" },
      { pattern: /Proctoring V4\.2 active/i, desc: "Fake Proctoring V4.2 active status" },
      { pattern: /evaluator\.demo@example\.com/i, desc: "Demo evaluator email" },
      { pattern: /DEMO-CANDIDATE-01/i, desc: "Demo candidate ID fallback" },
    ];

    const projectRoot = path.resolve(__dirname, "../../");

    for (const fileRel of filesToAudit) {
      const fullPath = path.join(projectRoot, fileRel);
      assert.ok(fs.existsSync(fullPath), `Audit target file must exist: ${fileRel}`);
      const content = fs.readFileSync(fullPath, "utf-8");

      for (const { pattern, desc } of forbiddenPatterns) {
        const match = content.match(pattern);
        assert.equal(
          match,
          null,
          `File ${fileRel} must not contain forbidden pattern: "${desc}" (found match: "${match?.[0]}")`
        );
      }
    }
  });
});
