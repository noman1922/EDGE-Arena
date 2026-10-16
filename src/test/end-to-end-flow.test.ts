import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { setTestSession, SessionPayload } from "../lib/auth";
import {
  createContestAction,
  assignParticipantAction,
  getAdminContests,
  getAvailableParticipantsAction,
  batchEnrollParticipantsAction,
  bulkEnrollParticipantsCsvAction,
} from "../app/actions/contest-actions";
import {
  createPhaseAction,
  createTaskAction,
  createQuestionAction,
  getContestPhasesAndTasks,
} from "../app/actions/task-builder-actions";
import {
  getParticipantDashboard,
  getTaskAssessmentData,
  saveAnswerDraftAction,
  submitAssessmentAction,
} from "../app/actions/assessment-actions";

describe("EDGE-Arena Assessment & Contest Management End-to-End Verification", () => {
  const adminEmail = "admin.verify@edge.internal";
  const participant1Email = "alice.participant@edge.internal";
  const participant2Email = "bob.participant@edge.internal";
  const participant3Email = "carol.participant@edge.internal";
  const unenrolledEmail = "david.unenrolled@edge.internal";

  let contest1Id = "";
  let contest2Id = "";
  let createdPhaseId = "";
  let createdTaskId = "";
  let createdMcqQuestionId = "";
  let createdWrittenQuestionId = "";

  let adminUserId = "";
  let participant1Id = "";
  let participant2Id = "";
  let participant3Id = "";
  let unenrolledUserId = "";

  const adminSession: SessionPayload = {
    userId: "",
    email: adminEmail,
    role: "ADMIN",
    name: "Verification Administrator",
    issuedAt: Date.now(),
    expiresAt: Date.now() + 3600000,
  };

  before(async () => {
    // Clean up any stale test records from previous runs
    await prisma.submissionAnswer.deleteMany({
      where: { submission: { user: { email: { in: [participant1Email, participant2Email, participant3Email, unenrolledEmail] } } } },
    });
    await prisma.submission.deleteMany({
      where: { user: { email: { in: [participant1Email, participant2Email, participant3Email, unenrolledEmail] } } },
    });
    await prisma.contestParticipant.deleteMany({
      where: { user: { email: { in: [participant1Email, participant2Email, participant3Email, unenrolledEmail] } } },
    });
    await prisma.contest.deleteMany({
      where: { title: { in: ["Contest Alpha - Live Verification", "Contest Beta - Secondary Isolation"] } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: [adminEmail, participant1Email, participant2Email, participant3Email, unenrolledEmail] } },
    });

    // Create Admin user
    const adminUser = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        email: adminEmail,
        name: "Verification Administrator",
        role: "ADMIN",
      },
    });
    adminUserId = adminUser.id;
    adminSession.userId = adminUserId;

    // Create existing PARTICIPANT users (system requirement: only existing accounts can be enrolled)
    const p1 = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        email: participant1Email,
        name: "Alice Participant",
        role: "PARTICIPANT",
        candidateId: "CAND-ALICE-101",
      },
    });
    participant1Id = p1.id;

    const p2 = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        email: participant2Email,
        name: "Bob Participant",
        role: "PARTICIPANT",
        candidateId: "CAND-BOB-102",
      },
    });
    participant2Id = p2.id;

    const p3 = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        email: participant3Email,
        name: "Carol Participant",
        role: "PARTICIPANT",
        candidateId: "CAND-CAROL-103",
      },
    });
    participant3Id = p3.id;

    const unenrolled = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        email: unenrolledEmail,
        name: "David Unenrolled",
        role: "PARTICIPANT",
        candidateId: "CAND-DAVID-104",
      },
    });
    unenrolledUserId = unenrolled.id;
  });

  after(async () => {
    setTestSession(undefined);
    try {
      if (contest1Id || contest2Id) {
        await prisma.contest.deleteMany({ where: { id: { in: [contest1Id, contest2Id].filter(Boolean) } } });
      }
      await prisma.user.deleteMany({
        where: { email: { in: [adminEmail, participant1Email, participant2Email, participant3Email, unenrolledEmail] } },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  // ---------------------------------------------------------------------------
  // 1. Fresh contest creation: starts with 0 phases, 0 tasks, 0 questions
  // ---------------------------------------------------------------------------
  it("1. Fresh contest creation initially has zero phases, zero tasks, and zero questions", async () => {
    setTestSession(adminSession);

    const now = new Date();
    const future = new Date(Date.now() + 7 * 24 * 3600 * 1000);

    const result = await createContestAction({
      title: "Contest Alpha - Live Verification",
      track: "Track Alpha · Strategic Operations",
      description: "Clean contest testing zero initial phases and tasks.",
      startDate: now.toISOString(),
      endDate: future.toISOString(),
      status: "LIVE",
    });

    assert.equal(result.success, true, `Contest creation failed: ${result.error}`);
    assert.ok(result.contestId);
    contest1Id = result.contestId!;

    // Verify in database: strictly 0 phases and 0 tasks
    const dbContest = await prisma.contest.findUnique({
      where: { id: contest1Id },
      include: { phases: { include: { tasks: true } } },
    });

    assert.ok(dbContest);
    assert.equal(dbContest.status, "LIVE");
    assert.equal(dbContest.phases.length, 0, "Fresh contest must start with 0 phases");

    // Also verify via task-builder query
    const builderData = await getContestPhasesAndTasks(contest1Id);
    assert.equal(builderData.phases.length, 0, "Task builder must report 0 phases for fresh contest");
  });

  // ---------------------------------------------------------------------------
  // 2. Admin creates a real phase, task, and questions in Admin
  // ---------------------------------------------------------------------------
  it("2. Admin creates a real phase, task, and questions (MCQ + Written)", async () => {
    setTestSession(adminSession);

    // Create Phase 1
    const phaseRes = await createPhaseAction({
      contestId: contest1Id,
      phaseNumber: 1,
      title: "Diagnostic Stage 1: Core Analysis",
      description: "Foundational strategic challenge.",
      deadline: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    });
    assert.equal(phaseRes.success, true, `Phase creation failed: ${phaseRes.error}`);
    assert.ok(phaseRes.phaseId);
    createdPhaseId = phaseRes.phaseId!;

    // Create Task 1
    const taskRes = await createTaskAction({
      phaseId: createdPhaseId,
      taskNumber: 1,
      title: "Executive Scenario Assessment",
      instructions: "Answer the multiple-choice diagnostic and formulate an operational proposal.",
      totalPoints: 100,
    });
    assert.equal(taskRes.success, true, `Task creation failed: ${taskRes.error}`);
    assert.ok(taskRes.taskId);
    createdTaskId = taskRes.taskId!;

    // Create MCQ Question
    const mcqRes = await createQuestionAction({
      taskId: createdTaskId,
      type: "MCQ",
      questionNumber: 1,
      prompt: "What is the optimal target reduction for Scope 1 emissions in Phase 1?",
      points: 25,
      options: [
        { optionKey: "A", text: "15% reduction via fleet electrification" },
        { optionKey: "B", text: "35% reduction via process optimization" },
        { optionKey: "C", text: "50% reduction via carbon offsets" },
        { optionKey: "D", text: "5% reduction via awareness campaigns" },
      ],
      correctOptionKey: "B",
      explanation: "Process optimization yields the highest verified Scope 1 reduction with minimal operational disruption.",
      scoringGuide: "Private evaluator guideline: 25 points if B selected, 0 otherwise.",
    });
    assert.equal(mcqRes.success, true, `MCQ Question creation failed: ${mcqRes.error}`);
    assert.ok(mcqRes.questionId);
    createdMcqQuestionId = mcqRes.questionId!;

    // Create Written Question
    const writtenRes = await createQuestionAction({
      taskId: createdTaskId,
      type: "WRITTEN",
      questionNumber: 2,
      prompt: "Formulate a 300-word implementation roadmap addressing operational bottlenecks.",
      instructions: "Include milestone timelines and risk mitigation strategies.",
      points: 75,
      minWords: 150,
      maxWords: 500,
      scoringGuide: "Private evaluator rubric: Clarity (25 pts), Feasibility (25 pts), Risk controls (25 pts).",
    });
    assert.equal(writtenRes.success, true, `Written Question creation failed: ${writtenRes.error}`);
    assert.ok(writtenRes.questionId);
    createdWrittenQuestionId = writtenRes.questionId!;

    // Confirm real items exist in database
    const verifyData = await getContestPhasesAndTasks(contest1Id);
    assert.equal(verifyData.phases.length, 1);
    assert.equal(verifyData.phases[0].tasks.length, 1);
    assert.equal(verifyData.phases[0].tasks[0].questions.length, 2);
  });

  // ---------------------------------------------------------------------------
  // 3. Enroll existing participant through dropdown / batch selection
  // ---------------------------------------------------------------------------
  it("3. Enroll existing participant through dropdown and verify persistence", async () => {
    setTestSession(adminSession);

    // Check available participants list
    const available = await getAvailableParticipantsAction(contest1Id);
    assert.ok(available.length >= 3);
    const alice = available.find((u) => u.email === participant1Email);
    assert.ok(alice);
    assert.equal(alice.isEnrolled, false);

    // Enroll Alice via batch enroll
    const batchRes = await batchEnrollParticipantsAction(contest1Id, [participant1Id]);
    assert.equal(batchRes.success, true);
    assert.equal(batchRes.enrolledCount, 1);

    // Confirm enrollment exists in database
    const enrollment = await prisma.contestParticipant.findFirst({
      where: { contestId: contest1Id, userId: participant1Id },
    });
    assert.ok(enrollment, "Alice must be enrolled in contest 1");
    assert.equal(enrollment.status, "ACTIVE");

    // Enrolling a non-existent account must be rejected
    const invalidAssign = await assignParticipantAction(
      contest1Id,
      "nonexistent.account.xyz999@edge.internal"
    );
    assert.equal(invalidAssign.success, false, "Must not implicitly create accounts from enrollment");
  });

  // ---------------------------------------------------------------------------
  // 4. CSV bulk enrollment with duplicate and error reporting
  // ---------------------------------------------------------------------------
  it("4. Bulk enroll participants via CSV with duplicate and error reporting", async () => {
    setTestSession(adminSession);

    // CSV contains:
    // Row 1: Alice (already enrolled -> should be skipped)
    // Row 2: Bob (existing account by candidateId -> should be enrolled)
    // Row 3: Carol (existing account by email -> should be enrolled)
    // Row 4: Nonexistent user -> should be marked invalid
    // Row 5: Duplicate of Bob within same CSV -> should be skipped
    const csvContent = `Email,CandidateId,Notes
${participant1Email},CAND-ALICE-101,Already enrolled test
,CAND-BOB-102,Candidate ID enrollment
${participant3Email},,Email enrollment
ghost.candidate@nowhere.com,CAND-999,Non-existent account
,CAND-BOB-102,Duplicate in CSV`;

    const bulkRes = await bulkEnrollParticipantsCsvAction(contest1Id, csvContent);
    assert.equal(bulkRes.success, true);
    assert.equal(bulkRes.enrolledCount, 2, "Bob and Carol should be newly enrolled");
    assert.equal(bulkRes.skippedCount, 2, "Alice and duplicate Bob should be skipped");
    assert.equal(bulkRes.invalidCount, 1, "Nonexistent user should be invalid");

    // Verify Bob and Carol are now enrolled in database
    const bobEnrollment = await prisma.contestParticipant.findFirst({
      where: { contestId: contest1Id, userId: participant2Id },
    });
    assert.ok(bobEnrollment, "Bob must be enrolled");

    const carolEnrollment = await prisma.contestParticipant.findFirst({
      where: { contestId: contest1Id, userId: participant3Id },
    });
    assert.ok(carolEnrollment, "Carol must be enrolled");
  });

  // ---------------------------------------------------------------------------
  // 5. Enrolled participant logs in: sees real contest and real questions
  // ---------------------------------------------------------------------------
  it("5. Enrolled participant confirms exact real phase, task, and questions appear", async () => {
    // Log in as Alice (enrolled)
    setTestSession({
      userId: participant1Id,
      email: participant1Email,
      role: "PARTICIPANT",
      name: "Alice Participant",
      issuedAt: Date.now(),
      expiresAt: Date.now() + 3600000,
    });

    // Dashboard check
    const dashboard = await getParticipantDashboard();
    assert.equal(dashboard.candidate.email, participant1Email);
    const assigned = dashboard.contests.find((c) => c.contestId === contest1Id);
    assert.ok(assigned, "Assigned contest must appear on participant dashboard");
    assert.equal(assigned.canContinue, true);

    // Assessment query: loads real data
    const assessmentData = await getTaskAssessmentData(contest1Id, createdTaskId);

    assert.equal(assessmentData.contest?.id, contest1Id);
    assert.equal(assessmentData.phase?.id, createdPhaseId);
    assert.equal(assessmentData.task.id, createdTaskId);
    assert.equal(assessmentData.task.title, "Executive Scenario Assessment");

    // Real questions verification
    assert.equal(assessmentData.questions.length, 2, "Must return exact 2 real questions created by admin");

    const q1 = assessmentData.questions.find((q) => q.type === "MCQ")!;
    assert.ok(q1);
    assert.equal(q1.prompt, "What is the optimal target reduction for Scope 1 emissions in Phase 1?");
    assert.equal(q1.options?.length, 4);

    const q2 = assessmentData.questions.find((q) => q.type === "WRITTEN")!;
    assert.ok(q2);
    assert.equal(q2.prompt, "Formulate a 300-word implementation roadmap addressing operational bottlenecks.");
    assert.equal(q2.minWords, 150);
    assert.equal(q2.maxWords, 500);
  });

  // ---------------------------------------------------------------------------
  // 6. Security isolation: Answer keys and evaluator data remain strictly hidden
  // ---------------------------------------------------------------------------
  it("6. Security: Answer keys, correct options, and evaluator rubrics remain strictly hidden", async () => {
    setTestSession({
      userId: participant1Id,
      email: participant1Email,
      role: "PARTICIPANT",
      name: "Alice Participant",
      issuedAt: Date.now(),
      expiresAt: Date.now() + 3600000,
    });

    const assessmentData = await getTaskAssessmentData(contest1Id, createdTaskId);

    for (const q of assessmentData.questions) {
      // Must not leak answerKey or correctOptionKey
      assert.equal("answerKey" in q, false, "answerKey property must not exist on participant question");
      assert.equal("correctOptionKey" in q, false, "correctOptionKey must not exist on participant question");
      assert.equal((q as any).correctOptionKey, undefined);
      assert.equal((q as any).answerKey, undefined);

      // Must not leak private scoringGuide or evaluator rubric instructions
      assert.equal("scoringGuide" in q, false, "scoringGuide must not be sent to participant");
      assert.equal((q as any).scoringGuide, undefined);
    }
  });

  // ---------------------------------------------------------------------------
  // 7. Unenrolled participant: safe empty state, NOT an uncaught server exception
  // ---------------------------------------------------------------------------
  it("7. Unenrolled participant gets safe empty state without server exception", async () => {
    // Log in as David (not enrolled in contest 1)
    setTestSession({
      userId: unenrolledUserId,
      email: unenrolledEmail,
      role: "PARTICIPANT",
      name: "David Unenrolled",
      issuedAt: Date.now(),
      expiresAt: Date.now() + 3600000,
    });

    // Querying assessment for contest 1 must NOT throw error, but return emptyState
    const assessmentData = await getTaskAssessmentData(contest1Id);
    assert.ok(assessmentData.emptyState, "Unenrolled participant should receive emptyState");
    assert.equal(assessmentData.emptyState, "NO_ENROLLMENT");
    assert.equal(assessmentData.questions.length, 0);

    // Dashboard must not display contest 1 as an active enrolled contest
    const dashboard = await getParticipantDashboard();
    const found = dashboard.contests.find((c) => c.contestId === contest1Id);
    assert.equal(found, undefined, "Unenrolled contest must not appear on candidate dashboard");
  });

  // ---------------------------------------------------------------------------
  // 8. Contest Isolation: Content between two contests never mixes
  // ---------------------------------------------------------------------------
  it("8. Switch between two contests in Admin: content is strictly scoped and never mixes", async () => {
    setTestSession(adminSession);

    // Create Contest 2 (Beta)
    const contest2Res = await createContestAction({
      title: "Contest Beta - Secondary Isolation",
      track: "Track Beta · AI & Robotics",
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(),
      status: "LIVE",
    });
    assert.equal(contest2Res.success, true);
    contest2Id = contest2Res.contestId!;

    // Create Phase and Task in Contest 2
    const phaseBetaRes = await createPhaseAction({
      contestId: contest2Id,
      phaseNumber: 1,
      title: "Beta Phase: Robotics Automation",
      deadline: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(),
    });
    assert.equal(phaseBetaRes.success, true);

    const taskBetaRes = await createTaskAction({
      phaseId: phaseBetaRes.phaseId!,
      taskNumber: 1,
      title: "Robotic Telemetry Diagnostics",
    });
    assert.equal(taskBetaRes.success, true);

    // Query Contest 1 tasks
    const contest1Data = await getContestPhasesAndTasks(contest1Id);
    assert.equal(contest1Data.phases.length, 1);
    assert.equal(contest1Data.phases[0].title, "Diagnostic Stage 1: Core Analysis");
    assert.equal(contest1Data.phases[0].tasks[0].title, "Executive Scenario Assessment");

    // Query Contest 2 tasks
    const contest2Data = await getContestPhasesAndTasks(contest2Id);
    assert.equal(contest2Data.phases.length, 1);
    assert.equal(contest2Data.phases[0].title, "Beta Phase: Robotics Automation");
    assert.equal(contest2Data.phases[0].tasks[0].title, "Robotic Telemetry Diagnostics");

    // Verify zero cross-contamination
    const betaHasAlpha = contest2Data.phases.some((p) =>
      p.tasks.some((t) => t.title === "Executive Scenario Assessment")
    );
    assert.equal(betaHasAlpha, false, "Contest 2 must not contain Contest 1 tasks");

    const alphaHasBeta = contest1Data.phases.some((p) =>
      p.tasks.some((t) => t.title === "Robotic Telemetry Diagnostics")
    );
    assert.equal(alphaHasBeta, false, "Contest 1 must not contain Contest 2 tasks");
  });

  // ---------------------------------------------------------------------------
  // 9. Participant Submission Flow on Real Content
  // ---------------------------------------------------------------------------
  it("9. Participant saves answers to real questions and finalizes submission", async () => {
    setTestSession({
      userId: participant1Id,
      email: participant1Email,
      role: "PARTICIPANT",
      name: "Alice Participant",
      issuedAt: Date.now(),
      expiresAt: Date.now() + 3600000,
    });

    const assessmentData = await getTaskAssessmentData(contest1Id, createdTaskId);
    const submissionId = assessmentData.submission.id;
    assert.ok(submissionId);

    // Answer real MCQ
    const saveMcq = await saveAnswerDraftAction(submissionId, createdMcqQuestionId, {
      selectedOption: "B", // Correct option configured in question 1
    });
    assert.equal(saveMcq.success, true);

    // Answer real Written
    const saveWritten = await saveAnswerDraftAction(submissionId, createdWrittenQuestionId, {
      writtenText: "Detailed implementation roadmap addressing operational bottlenecks with 15-day milestone checkpoints and proactive supplier redundancy protocols.",
    });
    assert.equal(saveWritten.success, true);

    // Submit assessment
    const submitRes = await submitAssessmentAction(submissionId);
    assert.equal(submitRes.success, true);
    assert.equal(submitRes.status, "SUBMITTED");

    // Verify in database: MCQ auto-graded 25 points, status is SUBMITTED
    const dbSub = await prisma.submission.findUnique({
      where: { id: submissionId },
    });
    assert.equal(dbSub?.status, "SUBMITTED");
    assert.equal(Number(dbSub?.autoGradeScore), 25);
  });
});
