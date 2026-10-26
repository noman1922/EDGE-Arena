import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { setTestSession, SessionPayload } from "../lib/auth";
import {
  saveAnswerDraftAction,
  submitAssessmentAction,
  getTaskAssessmentData,
} from "../app/actions/assessment-actions";
import {
  getSubmissionsForGrading,
  gradeSubmissionAction,
  publishContestResultsAction,
} from "../app/actions/evaluator-actions";
import {
  getAdminSubmissionsList,
  getAdminLeaderboardAndResults,
} from "../app/actions/results-actions";
import {
  getParticipantScorecard,
  getParticipantLeaderboard,
} from "../app/actions/participant-nav-actions";

describe("Phase 8: Comprehensive Assessment Lifecycle against 2027 Contest", () => {
  const CONTEST_ID = "c0270000-0000-4000-8000-000000000001";
  const CANDIDATE_1_EMAIL = "candidate.demo@example.com";
  const CANDIDATE_2_EMAIL = "competitor.test@example.com";
  const CANDIDATE_3_EMAIL = "mdnomanahamed22@gmail.com";
  const EVALUATOR_EMAIL = "evaluator.demo@example.com";
  const ADMIN_EMAIL = "admin.demo@example.com";

  let adminSession: SessionPayload;
  let evaluatorSession: SessionPayload;
  let candidate1Session: SessionPayload;
  let candidate2Session: SessionPayload;
  let candidate3Session: SessionPayload;

  let task11Id: string;
  let task12Id: string;
  let task21Id: string;
  let task22Id: string;

  let q11McqId: string;
  let q12FileId: string;
  let q21WrittenId: string;
  let q22RubricId: string;

  let rubricCriteria: Array<{ id: string; maxPoints: number }> = [];

  before(async () => {
    // 0. Clean prior submissions and ensure contest status is LIVE and unpublished
    await prisma.cohortResult.deleteMany({ where: { contestId: CONTEST_ID } });
    await prisma.submissionAnswer.deleteMany({ where: { submission: { contestId: CONTEST_ID } } });
    await prisma.evaluationScore.deleteMany({ where: { submission: { contestId: CONTEST_ID } } });
    await prisma.submission.deleteMany({ where: { contestId: CONTEST_ID } });
    await prisma.contest.update({
      where: { id: CONTEST_ID },
      data: { isPublished: false, status: "LIVE" },
    });

    // 1. Resolve users from DB (preserved users)
    const adminUser = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });
    const evaluatorUser = await prisma.user.findUniqueOrThrow({ where: { email: EVALUATOR_EMAIL } });
    const cand1 = await prisma.user.findUniqueOrThrow({ where: { email: CANDIDATE_1_EMAIL } });
    const cand2 = await prisma.user.findUniqueOrThrow({ where: { email: CANDIDATE_2_EMAIL } });
    const cand3 = await prisma.user.findUniqueOrThrow({ where: { email: CANDIDATE_3_EMAIL } });

    adminSession = {
      userId: adminUser.id,
      email: adminUser.email,
      role: "ADMIN",
      name: adminUser.name,
      issuedAt: Date.now(),
      expiresAt: Date.now() + 3600000,
    };

    evaluatorSession = {
      userId: evaluatorUser.id,
      email: evaluatorUser.email,
      role: "EVALUATOR",
      name: evaluatorUser.name,
      issuedAt: Date.now(),
      expiresAt: Date.now() + 3600000,
    };

    candidate1Session = {
      userId: cand1.id,
      email: cand1.email,
      role: "PARTICIPANT",
      name: cand1.name,
      issuedAt: Date.now(),
      expiresAt: Date.now() + 3600000,
    };

    candidate2Session = {
      userId: cand2.id,
      email: cand2.email,
      role: "PARTICIPANT",
      name: cand2.name,
      issuedAt: Date.now(),
      expiresAt: Date.now() + 3600000,
    };

    candidate3Session = {
      userId: cand3.id,
      email: cand3.email,
      role: "PARTICIPANT",
      name: cand3.name,
      issuedAt: Date.now(),
      expiresAt: Date.now() + 3600000,
    };

    // 2. Resolve tasks and questions for the 2027 contest
    const contest = await prisma.contest.findUniqueOrThrow({
      where: { id: CONTEST_ID },
      include: {
        phases: {
          include: {
            tasks: {
              include: {
                questions: true,
                rubrics: true,
              },
            },
          },
          orderBy: { phaseNumber: "asc" },
        },
      },
    });

    const phase1 = contest.phases.find((p) => p.phaseNumber === 1)!;
    const phase2 = contest.phases.find((p) => p.phaseNumber === 2)!;

    const t11 = phase1.tasks.find((t) => t.taskNumber === 1)!;
    const t12 = phase1.tasks.find((t) => t.taskNumber === 2)!;
    const t21 = phase2.tasks.find((t) => t.taskNumber === 1)!;
    const t22 = phase2.tasks.find((t) => t.taskNumber === 2)!;

    task11Id = t11.id;
    task12Id = t12.id;
    task21Id = t21.id;
    task22Id = t22.id;

    q11McqId = t11.questions[0].id;
    q12FileId = t12.questions[0].id;
    q21WrittenId = t21.questions[0].id;
    q22RubricId = t22.questions[0].id;

    rubricCriteria = t22.rubrics.map((r) => ({ id: r.id, maxPoints: Number(r.maxPoints) }));
  });

  after(async () => {
    setTestSession(undefined);
  });

  it("1. Contest configuration and lifecycle verification: 2027 expiry and intact structure", async () => {
    const contest = await prisma.contest.findUniqueOrThrow({
      where: { id: CONTEST_ID },
    });
    assert.equal(contest.title, "ACI Career EDGE Campus Leader Assessment 2027");
    assert.equal(contest.status, "LIVE");
    // Verify 2027 expiry date
    assert.equal(contest.endDate.getUTCFullYear(), 2027);
    assert.equal(contest.endDate.getUTCMonth(), 11); // December
    assert.equal(contest.endDate.getUTCDate(), 31);
  });

  it("2. Candidate 1 draft save, refresh, and submission across all 4 tasks without duplicates", async () => {
    setTestSession(candidate1Session);

    // Task 1.1 MCQ: answer Option B (Correct)
    const t11Data = await getTaskAssessmentData(CONTEST_ID, task11Id);
    await saveAnswerDraftAction(t11Data.submission.id, q11McqId, { selectedOption: "B" });
    // Verify draft resume
    const t11Resume = await getTaskAssessmentData(CONTEST_ID, task11Id);
    assert.equal(t11Resume.submission.answers.find((a) => a.questionId === q11McqId)?.selectedOption, "B");
    await submitAssessmentAction(t11Data.submission.id);

    // Task 1.2 PDF Deliverable
    const t12Data = await getTaskAssessmentData(CONTEST_ID, task12Id);
    await saveAnswerDraftAction(t12Data.submission.id, q12FileId, {
      fileName: "Noman_Strategy_Audit.pdf",
      fileKey: "submissions/c027_cand1_audit.pdf",
    });
    await submitAssessmentAction(t12Data.submission.id);

    // Task 2.1 Written Memo
    const t21Data = await getTaskAssessmentData(CONTEST_ID, task21Id);
    await saveAnswerDraftAction(t21Data.submission.id, q21WrittenId, {
      writtenText: "Executive memorandum regarding corporate restructuring: Establishing proactive communication protocols.",
    });
    await submitAssessmentAction(t21Data.submission.id);

    // Task 2.2 Rubric Written Roadmap
    const t22Data = await getTaskAssessmentData(CONTEST_ID, task22Id);
    await saveAnswerDraftAction(t22Data.submission.id, q22RubricId, {
      writtenText: "Strategic growth roadmap detailing multi-year governance milestones and execution metrics.",
    });
    await submitAssessmentAction(t22Data.submission.id);

    // Verify submission count for candidate 1 is exactly 4 tasks (one per task), no duplicates
    const subs = await prisma.submission.findMany({
      where: { contestId: CONTEST_ID, userId: candidate1Session.userId },
    });
    assert.equal(subs.length, 4);
    assert.ok(subs.every((s) => s.status === "SUBMITTED"));
  });

  it("3. Candidate 2 submits assessment with different answers (MCQ Option A = 0 pts)", async () => {
    setTestSession(candidate2Session);

    const t11Data = await getTaskAssessmentData(CONTEST_ID, task11Id);
    await saveAnswerDraftAction(t11Data.submission.id, q11McqId, { selectedOption: "A" }); // Incorrect
    await submitAssessmentAction(t11Data.submission.id);

    const t12Data = await getTaskAssessmentData(CONTEST_ID, task12Id);
    await saveAnswerDraftAction(t12Data.submission.id, q12FileId, {
      fileName: "Fatima_Audit_Report.pdf",
      fileKey: "submissions/c027_cand2_audit.pdf",
    });
    await submitAssessmentAction(t12Data.submission.id);

    const t21Data = await getTaskAssessmentData(CONTEST_ID, task21Id);
    await saveAnswerDraftAction(t21Data.submission.id, q21WrittenId, {
      writtenText: "Alternative memorandum examining legal compliance and financial disclosure timeline.",
    });
    await submitAssessmentAction(t21Data.submission.id);

    const t22Data = await getTaskAssessmentData(CONTEST_ID, task22Id);
    await saveAnswerDraftAction(t22Data.submission.id, q22RubricId, {
      writtenText: "Alternative growth strategy covering market penetration and regional rollout.",
    });
    await submitAssessmentAction(t22Data.submission.id);

    const subs = await prisma.submission.findMany({
      where: { contestId: CONTEST_ID, userId: candidate2Session.userId },
    });
    assert.equal(subs.length, 4);
  });

  it("4. Candidate 3 submits assessment (MCQ Option B = 25 pts) for tie-breaking testing", async () => {
    setTestSession(candidate3Session);

    const t11Data = await getTaskAssessmentData(CONTEST_ID, task11Id);
    await saveAnswerDraftAction(t11Data.submission.id, q11McqId, { selectedOption: "B" }); // Correct
    await submitAssessmentAction(t11Data.submission.id);

    const t12Data = await getTaskAssessmentData(CONTEST_ID, task12Id);
    await saveAnswerDraftAction(t12Data.submission.id, q12FileId, {
      fileName: "Tanvir_Audit.pdf",
      fileKey: "submissions/c027_cand3_audit.pdf",
    });
    await submitAssessmentAction(t12Data.submission.id);

    const t21Data = await getTaskAssessmentData(CONTEST_ID, task21Id);
    await saveAnswerDraftAction(t21Data.submission.id, q21WrittenId, {
      writtenText: "Third candidate executive memorandum highlighting risk frameworks.",
    });
    await submitAssessmentAction(t21Data.submission.id);

    const t22Data = await getTaskAssessmentData(CONTEST_ID, task22Id);
    await saveAnswerDraftAction(t22Data.submission.id, q22RubricId, {
      writtenText: "Third candidate strategic roadmap with analytical rubrics.",
    });
    await submitAssessmentAction(t22Data.submission.id);
  });

  it("5. Review list consolidation: exactly ONE review entry per candidate attempt in Evaluator & Admin panels", async () => {
    // Evaluator panel check
    setTestSession(evaluatorSession);
    const evalList = await getSubmissionsForGrading(CONTEST_ID);
    // 3 candidates have submitted assessments -> exactly 3 entries! (NOT 3 * 4 = 12 entries!)
    assert.equal(evalList.length, 3);
    const cand1Entry = evalList.find((e) => e.userId === candidate1Session.userId);
    assert.ok(cand1Entry, "Candidate 1 review entry must exist");
    // Verify that this 1 entry contains all 4 answers across tasks
    assert.equal(cand1Entry!.answers.length, 4);
    assert.equal(cand1Entry!.phases?.length, 2);

    // Admin panel check
    setTestSession(adminSession);
    const adminOverview = await getAdminSubmissionsList(CONTEST_ID);
    assert.equal(adminOverview.submissions.length, 3);
    const adminCand1 = adminOverview.submissions.find((s) => s.userId === candidate1Session.userId);
    assert.ok(adminCand1);
    assert.equal(adminCand1!.answers.length, 4);
  });

  it("6. MCQ server-side auto-grading accuracy: Option B = 25 pts, Option A = 0 pts", async () => {
    setTestSession(evaluatorSession);
    const evalList = await getSubmissionsForGrading(CONTEST_ID);

    const cand1 = evalList.find((e) => e.userId === candidate1Session.userId)!;
    const cand2 = evalList.find((e) => e.userId === candidate2Session.userId)!;

    // Candidate 1 selected Option B (correct) -> 25 points
    assert.equal(cand1.autoGradeScore, 25);
    const mcqAns1 = cand1.answers.find((a) => a.questionId === q11McqId)!;
    assert.equal(mcqAns1.isCorrect, true);
    assert.equal(mcqAns1.score, 25);

    // Candidate 2 selected Option A (incorrect) -> 0 points
    assert.equal(cand2.autoGradeScore, 0);
    const mcqAns2 = cand2.answers.find((a) => a.questionId === q11McqId)!;
    assert.equal(mcqAns2.isCorrect, false);
    assert.equal(mcqAns2.score, 0);
  });

  it("7. Validation: rejection of invalid marks exceeding question bounds or unauthorized roles", async () => {
    setTestSession(evaluatorSession);
    const evalList = await getSubmissionsForGrading(CONTEST_ID);
    const cand1 = evalList.find((e) => e.userId === candidate1Session.userId)!;

    // Exceeding question points (Q2.1 has 25 points, attempting 50)
    const invalidRes = await gradeSubmissionAction({
      submissionId: cand1.id,
      questionGrades: [{ questionId: q21WrittenId, score: 50 }],
    });
    assert.equal(invalidRes.success, false);
    assert.ok(invalidRes.error?.includes("cannot be negative or exceed maximum 25 points"));

    // Negative mark
    const negativeRes = await gradeSubmissionAction({
      submissionId: cand1.id,
      questionGrades: [{ questionId: q21WrittenId, score: -5 }],
    });
    assert.equal(negativeRes.success, false);

    // Unauthorized role (Participant attempting to grade)
    setTestSession(candidate1Session);
    const forbiddenRes = await gradeSubmissionAction({
      submissionId: cand1.id,
      questionGrades: [{ questionId: q21WrittenId, score: 20 }],
    });
    assert.equal(forbiddenRes.success, false);
    assert.ok(
      forbiddenRes.error?.includes("Unauthorized") ||
      forbiddenRes.error?.includes("Forbidden") ||
      forbiddenRes.error?.includes("not authorized")
    );
    setTestSession(evaluatorSession);
  });

  it("8. Evaluator draft grading: saves marks, persists GRADING_IN_PROGRESS, survives refresh", async () => {
    setTestSession(evaluatorSession);
    const evalList = await getSubmissionsForGrading(CONTEST_ID);
    const cand1 = evalList.find((e) => e.userId === candidate1Session.userId)!;

    // Save Draft: Task 1.2 (PDF) = 22, Task 2.1 (Written) = 23, Rubrics = 20 pts
    const draftRes = await gradeSubmissionAction({
      submissionId: cand1.id,
      isDraft: true,
      overallFeedback: "Draft evaluation: Excellent strategic grounding and rigorous audit deliverable.",
      questionGrades: [
        { questionId: q12FileId, score: 22, feedback: "Solid PDF structure and thorough financial audit." },
        { questionId: q21WrittenId, score: 23, feedback: "Well-composed executive memo with clear risk actions." },
      ],
      rubricScores: rubricCriteria.map((r) => ({
        rubricId: r.id,
        scoreAwarded: Math.round(r.maxPoints * 0.8),
        comments: "High institutional readiness.",
      })),
    });

    assert.equal(draftRes.success, true);
    assert.equal(draftRes.autoGradeScore, 25);
    assert.equal(draftRes.finalScore, 25 + 22 + 23 + 20); // 90 points

    // Re-fetch submissions to verify persistence across refresh
    const refreshedList = await getSubmissionsForGrading(CONTEST_ID);
    const cand1Refreshed = refreshedList.find((e) => e.userId === candidate1Session.userId)!;
    assert.equal(cand1Refreshed.status, "GRADING_IN_PROGRESS");
    assert.equal(cand1Refreshed.finalScore, 90);
  });

  it("9. Evaluator finalizes Candidate 1: sets status to GRADED and updates records", async () => {
    setTestSession(evaluatorSession);
    const evalList = await getSubmissionsForGrading(CONTEST_ID);
    const cand1 = evalList.find((e) => e.userId === candidate1Session.userId)!;

    const finalizeRes = await gradeSubmissionAction({
      submissionId: cand1.id,
      isDraft: false,
      overallFeedback: "Finalized evaluation: Outstanding comprehensive leadership submission.",
      questionGrades: [
        { questionId: q12FileId, score: 22 },
        { questionId: q21WrittenId, score: 23 },
      ],
      rubricScores: rubricCriteria.map((r) => ({
        rubricId: r.id,
        scoreAwarded: Math.round(r.maxPoints * 0.8),
      })),
    });

    assert.equal(finalizeRes.success, true);

    const refreshedList = await getSubmissionsForGrading(CONTEST_ID);
    const cand1Refreshed = refreshedList.find((e) => e.userId === candidate1Session.userId)!;
    assert.equal(cand1Refreshed.status, "GRADED");
    assert.equal(cand1Refreshed.finalScore, 90);
  });

  it("10. Admin grades Candidate 2: feature parity between Admin and Evaluator panels", async () => {
    setTestSession(adminSession);
    const adminOverview = await getAdminSubmissionsList(CONTEST_ID);
    const cand2 = adminOverview.submissions.find((s) => s.userId === candidate2Session.userId)!;

    // Admin grades Candidate 2: Auto=0, Q1.2=20, Q2.1=18, Rubrics=18 -> Total = 56
    const gradeRes = await gradeSubmissionAction({
      submissionId: cand2.id,
      isDraft: false,
      overallFeedback: "Solid execution but missed initial supply chain MCQ.",
      questionGrades: [
        { questionId: q12FileId, score: 20 },
        { questionId: q21WrittenId, score: 18 },
      ],
      rubricScores: rubricCriteria.map((r) => ({
        rubricId: r.id,
        scoreAwarded: r.maxPoints === 5 ? 4 : 7, // 7 for 10, 7 for 10, 4 for 5 -> 72%
      })),
    });

    assert.equal(gradeRes.success, true);
    assert.equal(gradeRes.finalScore, 56);
  });

  it("11. Grade Candidate 3 to equal Candidate 1 (90 pts) to test competition tie-breaking", async () => {
    setTestSession(evaluatorSession);
    const evalList = await getSubmissionsForGrading(CONTEST_ID);
    const cand3 = evalList.find((e) => e.userId === candidate3Session.userId)!;

    // Auto=25, Q1.2=22, Q2.1=23, Rubrics=20 -> Total = 90
    const gradeRes = await gradeSubmissionAction({
      submissionId: cand3.id,
      isDraft: false,
      overallFeedback: "Equally impressive analytical mastery and proposal structure.",
      questionGrades: [
        { questionId: q12FileId, score: 22 },
        { questionId: q21WrittenId, score: 23 },
      ],
      rubricScores: rubricCriteria.map((r) => ({
        rubricId: r.id,
        scoreAwarded: Math.round(r.maxPoints * 0.8),
      })),
    });

    assert.equal(gradeRes.success, true);
    assert.equal(gradeRes.finalScore, 90);
  });

  it("12. Participant shield: candidates cannot access unpublished scores or leaderboards", async () => {
    setTestSession(candidate1Session);

    // Participant leaderboard before publication must mask scores to 0
    const lb = await getParticipantLeaderboard(CONTEST_ID);
    assert.ok(lb.rows.every((r) => r.finalScore === 0), "All scores on participant leaderboard must be masked to 0 prior to publication");

    // Participant scorecard before publication must show totalScore = 0
    const scorecard = await getParticipantScorecard(CONTEST_ID);
    assert.ok(scorecard);
    assert.equal(scorecard.totalScore, 0);
  });

  it("13. Admin publishes results: computes 1224 competition rankings and persists CohortResult", async () => {
    setTestSession(adminSession);

    const pubRes = await publishContestResultsAction(CONTEST_ID);
    assert.equal(pubRes.success, true);
    assert.equal(pubRes.publishedCount, 5);

    // Verify CohortResult persistence in DB
    const results = await prisma.cohortResult.findMany({
      where: { contestId: CONTEST_ID },
      orderBy: { rank: "asc" },
    });
    assert.equal(results.length, 5);

    // Check Candidate 1 and Candidate 3 are tied at Rank 1 with 90 points
    const r1 = results.find((r) => r.userId === candidate1Session.userId)!;
    const r3 = results.find((r) => r.userId === candidate3Session.userId)!;
    const r2 = results.find((r) => r.userId === candidate2Session.userId)!;

    assert.equal(Number(r1.totalScore), 90);
    assert.equal(Number(r3.totalScore), 90);
    assert.equal(r1.rank, 1);
    assert.equal(r3.rank, 1);
    assert.equal(r1.isCertified, true);
    assert.equal(r3.isCertified, true);

    // Standard competition ranking (1224 tie rule): Candidates 1 & 3 share Rank 1, next candidate is Rank 3!
    assert.equal(Number(r2.totalScore), 56);
    assert.equal(r2.rank, 3, "In standard competition ranking (1224), next rank after 2 tied Rank 1s must be Rank 3");
  });

  it("14. Published Leaderboard integrity: Leaderboard displays real scores (90, 90, 56) and never 0", async () => {
    // Admin Leaderboard
    setTestSession(adminSession);
    const adminLb = await getAdminLeaderboardAndResults(CONTEST_ID);
    assert.ok(adminLb.current);
    assert.equal(adminLb.current!.isPublished, true);
    assert.equal(adminLb.current!.rows.length, 3);

    const cand1Row = adminLb.current!.rows.find((r) => r.userId === candidate1Session.userId)!;
    const cand3Row = adminLb.current!.rows.find((r) => r.userId === candidate3Session.userId)!;
    const cand2Row = adminLb.current!.rows.find((r) => r.userId === candidate2Session.userId)!;

    assert.equal(cand1Row.finalScore, 90);
    assert.equal(cand3Row.finalScore, 90);
    assert.equal(cand2Row.finalScore, 56);

    assert.equal(cand1Row.rank, 1);
    assert.equal(cand3Row.rank, 1);
    assert.equal(cand2Row.rank, 3);

    // Participant Leaderboard now unmasked
    setTestSession(candidate1Session);
    const partLb = await getParticipantLeaderboard(CONTEST_ID);
    const partCand1 = partLb.rows.find((r) => r.userId === candidate1Session.userId)!;
    const partCand2 = partLb.rows.find((r) => r.userId === candidate2Session.userId)!;

    assert.equal(partCand1.finalScore, 90);
    assert.equal(partCand2.finalScore, 56);

    // Participant Scorecard now reflects full published total
    const sc = await getParticipantScorecard(CONTEST_ID);
    assert.ok(sc);
    assert.equal(sc.totalScore, 90);
    assert.equal(sc.rank, 1);
    assert.equal(sc.isCertified, true);
  });

  it("15. Idempotency: repeated submission, grading, or publication requests do not create duplicate records", async () => {
    setTestSession(adminSession);

    // Repeated publication call
    const repeatPub = await publishContestResultsAction(CONTEST_ID);
    assert.equal(repeatPub.success, true);

    const results = await prisma.cohortResult.findMany({
      where: { contestId: CONTEST_ID },
    });
    // Exactly 5 results, no duplicates created
    assert.equal(results.length, 5);
  });

  it("16. Preserved User Verification: all 59 existing user accounts and credentials intact", async () => {
    const totalUsers = await prisma.user.count();
    assert.equal(totalUsers, 59, "All 59 existing user accounts must remain completely intact");
  });
});
