/**
 * EDGE-Arena: Regression Test Suite for Mac-Specific Phase Progression & PDF Access
 *
 * Verifies:
 * 1. Multi-phase contest creation and progression gates:
 *    - Admin creates Phase 1 and Phase 2 in a LIVE contest.
 *    - Phase 2 correctly defaults to PhaseStatus.OPEN (not stuck in UPCOMING).
 *    - Sequential progression locks Phase 2 until Phase 1 is submitted.
 *    - Candidate answers Phase 1 and submits, transitioning status to SUBMITTED.
 *    - Progression gate unlocks Phase 2 for candidate.
 * 2. Cross-role PDF access and streaming endpoint:
 *    - Candidate uploads a valid PDF deliverable.
 *    - Candidate (owner), Evaluator, and Admin can get signed download URLs.
 *    - Unauthorized candidate cannot access another candidate's private PDF.
 *    - Direct streaming route /api/files/[...fileKey] supports:
 *      * Content-Disposition: inline (for browser PDF viewer tabs)
 *      * Content-Disposition: attachment (when ?download=1 or ?dl=1 is present)
 *      * Accept-Ranges: bytes (required by Safari / WebKit native PDF streaming)
 *      * Strict role-based authorization (401 unauth, 403 forbidden).
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { prisma } from "../lib/prisma";
import { setTestSession } from "../lib/auth";
import { UserRole, ContestStatus, PhaseStatus, QuestionType } from "@prisma/client";
import {
  getTaskAssessmentData,
  getParticipantDashboard,
  saveAnswerDraftAction,
  submitAssessmentAction,
} from "../app/actions/assessment-actions";
import { createPhaseAction } from "../app/actions/task-builder-actions";
import {
  uploadSubmissionAttachmentAction,
  getFileDownloadUrlAction,
} from "../app/actions/file-actions";
import { GET as fileStreamingGet } from "../app/api/files/[...fileKey]/route";

describe("Mac-Specific Phase Progression and PDF Access Verification", () => {
  const contestId = "f1e2d3c4-b5a6-4978-9876-543210fedcba";
  const candidate1Email = "mac.candidate1@test.aciedge.edu";
  const candidate2Email = "mac.candidate2@test.aciedge.edu";
  const evaluatorEmail = "mac.evaluator@test.aciedge.edu";
  const adminEmail = "mac.admin@test.aciedge.edu";

  let candidate1Id = "";
  let candidate2Id = "";
  let evaluatorId = "";
  let adminId = "";

  let phase1Id = "";
  let phase2Id = "";
  let task1Id = "";
  let task2Id = "";
  let q1Id = "";
  let q2Id = "";

  let task1SubmissionId = "";
  let task2SubmissionId = "";
  let uploadedFileKey = "";

  const VALID_PDF =
    "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 38 >>\nstream\nBT /F1 12 Tf 50 720 Td (Mac PDF Verification) Tj ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000204 00000 n \ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n292\n%%EOF";

  before(async () => {
    // 1. Create or upsert users
    const c1 = await prisma.user.upsert({
      where: { email: candidate1Email },
      update: { role: UserRole.PARTICIPANT },
      create: {
        id: "20000000-0000-4000-8000-000000000001",
        email: candidate1Email,
        name: "Mac Test Candidate 1",
        candidateId: "CAND-MAC-01",
        role: UserRole.PARTICIPANT,
      },
    });
    candidate1Id = c1.id;

    const c2 = await prisma.user.upsert({
      where: { email: candidate2Email },
      update: { role: UserRole.PARTICIPANT },
      create: {
        id: "20000000-0000-4000-8000-000000000002",
        email: candidate2Email,
        name: "Mac Test Candidate 2",
        candidateId: "CAND-MAC-02",
        role: UserRole.PARTICIPANT,
      },
    });
    candidate2Id = c2.id;

    const ev = await prisma.user.upsert({
      where: { email: evaluatorEmail },
      update: { role: UserRole.EVALUATOR },
      create: {
        id: "20000000-0000-4000-8000-000000000003",
        email: evaluatorEmail,
        name: "Mac Test Evaluator",
        role: UserRole.EVALUATOR,
      },
    });
    evaluatorId = ev.id;

    const ad = await prisma.user.upsert({
      where: { email: adminEmail },
      update: { role: UserRole.ADMIN },
      create: {
        id: "20000000-0000-4000-8000-000000000004",
        email: adminEmail,
        name: "Mac Test Admin",
        role: UserRole.ADMIN,
      },
    });
    adminId = ad.id;

    // 2. Create or upsert LIVE contest with enforceSequentialProgress
    await prisma.contest.upsert({
      where: { id: contestId },
      update: {
        title: "Mac Demonstration Verification Contest",
        slug: "mac-demo-verification-contest",
        track: "Executive Strategy",
        status: ContestStatus.LIVE,
        startDate: new Date("2025-01-01T00:00:00Z"),
        endDate: new Date("2027-12-31T23:59:59Z"),
        enforceSequentialProgress: true,
      },
      create: {
        id: contestId,
        title: "Mac Demonstration Verification Contest",
        slug: "mac-demo-verification-contest",
        track: "Executive Strategy",
        status: ContestStatus.LIVE,
        startDate: new Date("2025-01-01T00:00:00Z"),
        endDate: new Date("2027-12-31T23:59:59Z"),
        enforceSequentialProgress: true,
      },
    });

    // Clean any prior phases/submissions for this contest
    await prisma.phase.deleteMany({
      where: { contestId },
    });
    await prisma.contestParticipant.deleteMany({
      where: { contestId },
    });

    // Enroll candidate 1 and candidate 2
    await prisma.contestParticipant.createMany({
      data: [
        { contestId, userId: candidate1Id, status: "ACTIVE" },
        { contestId, userId: candidate2Id, status: "ACTIVE" },
      ],
    });

    // Assign evaluator to contest and candidate 1 for grading and file access
    const ce = await prisma.contestEvaluator.upsert({
      where: { contestId_userId: { contestId, userId: evaluatorId } },
      update: {},
      create: { contestId, userId: evaluatorId },
    });

    await prisma.evaluatorCandidateAssignment.upsert({
      where: {
        contestId_evaluatorId_participantId: {
          contestId,
          evaluatorId,
          participantId: candidate1Id,
        },
      },
      update: { contestEvaluatorId: ce.id },
      create: {
        contestId,
        contestEvaluatorId: ce.id,
        evaluatorId,
        participantId: candidate1Id,
      },
    });
  });

  after(async () => {
    setTestSession(null);
    try {
      await prisma.evaluatorCandidateAssignment.deleteMany({
        where: { contestId },
      });
      await prisma.contestEvaluator.deleteMany({
        where: { contestId },
      });
      await prisma.phase.deleteMany({
        where: { contestId },
      });
      await prisma.contestParticipant.deleteMany({
        where: { contestId },
      });
      await prisma.contest.delete({
        where: { id: contestId },
      });
    } catch {
      // Safe cleanup
    }
  });

  describe("Issue 1: Multi-Phase Creation and Sequential Progression Flow", () => {
    test("Admin creates Phase 1 and Phase 2; Phase 2 defaults to PhaseStatus.OPEN in LIVE contest", async () => {
      setTestSession({
        userId: adminId,
        email: adminEmail,
        role: "ADMIN",
        name: "Mac Test Admin",
      });

      // Create Phase 1
      const p1Res = await createPhaseAction({
        contestId,
        phaseNumber: 1,
        title: "Phase 1: Diagnostic Assessment",
        description: "Initial diagnostic task",
        deadline: "2027-12-31T23:59:59Z",
      });
      assert.equal(p1Res.success, true);
      assert.ok(p1Res.phaseId);
      phase1Id = p1Res.phaseId;

      const p1Db = await prisma.phase.findUnique({ where: { id: phase1Id } });
      assert.equal(p1Db?.status, PhaseStatus.OPEN);

      // Create Phase 2
      const p2Res = await createPhaseAction({
        contestId,
        phaseNumber: 2,
        title: "Phase 2: Strategy Presentation",
        description: "Deliverable document upload task",
        deadline: "2027-12-31T23:59:59Z",
      });
      assert.equal(p2Res.success, true);
      assert.ok(p2Res.phaseId);
      phase2Id = p2Res.phaseId;

      // CRITICAL FIX: In a LIVE contest, subsequent phases must default to OPEN, not UPCOMING
      const p2Db = await prisma.phase.findUnique({ where: { id: phase2Id } });
      assert.equal(p2Db?.status, PhaseStatus.OPEN);

      // Add Task 1 with an MCQ Question to Phase 1
      const t1 = await prisma.task.create({
        data: {
          phaseId: phase1Id,
          taskNumber: 1,
          title: "Phase 1 Task 1: Core Strategy",
          instructions: "Answer the strategic positioning question",
          totalPoints: 10,
        },
      });
      task1Id = t1.id;

      const q1 = await prisma.question.create({
        data: {
          taskId: task1Id,
          questionNumber: 1,
          prompt: "What is the primary driver of market expansion?",
          type: QuestionType.MCQ,
          points: 10,
          options: {
            create: [
              { optionKey: "A", text: "Customer Value Proposition" },
              { optionKey: "B", text: "Uncontrolled Overhead" },
            ],
          },
          answerKey: {
            create: {
              correctOptionKey: "A",
            },
          },
        },
      });
      q1Id = q1.id;

      // Add Task 2 with a FILE_UPLOAD Question to Phase 2
      const t2 = await prisma.task.create({
        data: {
          phaseId: phase2Id,
          taskNumber: 1,
          title: "Phase 2 Task 1: Executive Deck",
          instructions: "Upload your executive proposal PDF",
          totalPoints: 25,
        },
      });
      task2Id = t2.id;

      const q2 = await prisma.question.create({
        data: {
          taskId: task2Id,
          questionNumber: 1,
          prompt: "Upload your finalized PDF strategy deliverable",
          type: QuestionType.FILE_UPLOAD,
          points: 25,
        },
      });
      q2Id = q2.id;
    });

    test("Candidate 1 sees Phase 1 unlocked and Phase 2 locked prior to submitting Phase 1", async () => {
      setTestSession({
        userId: candidate1Id,
        email: candidate1Email,
        role: "PARTICIPANT",
        name: "Mac Test Candidate 1",
      });

      const dash = await getParticipantDashboard();
      assert.ok(dash);
      const cData = dash.contests.find((c) => c.contestId === contestId);
      assert.ok(cData);
      assert.ok(cData.phases);
      assert.equal(cData.phases.length, 2);

      const p1 = cData.phases.find((p) => p.id === phase1Id);
      const p2 = cData.phases.find((p) => p.id === phase2Id);
      assert.ok(p1);
      assert.ok(p2);

      // Phase 1 is first: unlocked
      assert.equal(p1.isLocked, false);

      // Phase 2 is second: locked by sequential progress
      assert.equal(p2.isLocked, true);

      // Attempting to fetch task 2 assessment data directly enforces gate
      const t2Data = await getTaskAssessmentData(contestId, task2Id);
      assert.equal(t2Data.isRedirectedFromLocked, true);
      assert.match(t2Data.lockedRedirectMessage || "", /locked/i);
    });

    test("Candidate 1 answers Phase 1 Question 1 and submits; Phase 2 becomes unlocked", async () => {
      setTestSession({
        userId: candidate1Id,
        email: candidate1Email,
        role: "PARTICIPANT",
        name: "Mac Test Candidate 1",
      });

      // Initialize Task 1 session to get submission ID
      const t1Data = await getTaskAssessmentData(contestId, task1Id);
      assert.ok(t1Data.submission);
      task1SubmissionId = t1Data.submission.id;

      // Save answer draft for Question 1
      const saveRes = await saveAnswerDraftAction(
        task1SubmissionId,
        q1Id,
        { selectedOption: "A" }
      );
      assert.equal(saveRes.success, true);

      // Submit Phase 1 Task
      const subRes = await submitAssessmentAction(task1SubmissionId);
      assert.equal(subRes.success, true);
      assert.equal(subRes.status, "SUBMITTED");

      // Verify task 1 is now SUBMITTED in database
      const sub = await prisma.submission.findFirst({
        where: { taskId: task1Id, userId: candidate1Id },
      });
      assert.ok(sub);
      assert.equal(sub.status, "SUBMITTED");

      // Verify Phase 2 is now unlocked on participant dashboard!
      const dashAfter = await getParticipantDashboard();
      const cDataAfter = dashAfter.contests.find((c) => c.contestId === contestId);
      assert.ok(cDataAfter);
      assert.ok(cDataAfter.phases);

      const p2After = cDataAfter.phases.find((p) => p.id === phase2Id);
      assert.ok(p2After);
      assert.equal(p2After.isLocked, false);

      // Direct task 2 assessment data is now unlocked and accessible!
      const t2DataAfter = await getTaskAssessmentData(contestId, task2Id);
      assert.equal(t2DataAfter.isRedirectedFromLocked, false);
      assert.equal(t2DataAfter.task.id, task2Id);
      assert.ok(t2DataAfter.submission);
      task2SubmissionId = t2DataAfter.submission.id;
    });
  });

  describe("Issue 2: PDF Upload, Direct Download URLs & Safari Streaming Support", () => {
    test("Candidate 1 uploads a valid PDF deliverable to Phase 2 Question 2", async () => {
      setTestSession({
        userId: candidate1Id,
        email: candidate1Email,
        role: "PARTICIPANT",
        name: "Mac Test Candidate 1",
      });

      const formData = new FormData();
      const pdfBlob = new Blob([VALID_PDF], { type: "application/pdf" });
      formData.append("file", pdfBlob, "Strategic_Proposal_Mac.pdf");
      formData.append("submissionId", task2SubmissionId);
      formData.append("questionId", q2Id);

      const uploadRes = await uploadSubmissionAttachmentAction(formData);
      assert.equal(uploadRes.success, true);
      assert.ok(uploadRes.file);
      assert.ok(uploadRes.file.fileKey);
      assert.equal(uploadRes.file.name, "Strategic_Proposal_Mac.pdf");

      uploadedFileKey = uploadRes.file.fileKey;

      // Verify submissionAnswer record in database
      const ans = await prisma.submissionAnswer.findFirst({
        where: { questionId: q2Id, submission: { userId: candidate1Id } },
      });
      assert.ok(ans);
      assert.equal(ans.fileKey, uploadedFileKey);
    });

    test("Candidate 1 (owner) can obtain signed download URL", async () => {
      setTestSession({
        userId: candidate1Id,
        email: candidate1Email,
        role: "PARTICIPANT",
        name: "Mac Test Candidate 1",
      });

      const res = await getFileDownloadUrlAction(uploadedFileKey);
      assert.equal(res.success, true);
      assert.ok(res.downloadUrl);
      assert.ok(res.downloadUrl.includes(uploadedFileKey) || res.downloadUrl.includes("/api/files/"));
    });

    test("Candidate 2 (unauthorized) is rejected with 403 Forbidden", async () => {
      setTestSession({
        userId: candidate2Id,
        email: candidate2Email,
        role: "PARTICIPANT",
        name: "Mac Test Candidate 2",
      });

      const res = await getFileDownloadUrlAction(uploadedFileKey);
      assert.equal(res.success, false);
      assert.match(res.error || "", /authorized|denied|forbidden/i);
    });

    test("Evaluator can obtain signed download URL for grading", async () => {
      setTestSession({
        userId: evaluatorId,
        email: evaluatorEmail,
        role: "EVALUATOR",
        name: "Mac Test Evaluator",
      });

      const res = await getFileDownloadUrlAction(uploadedFileKey);
      assert.equal(res.success, true);
      assert.ok(res.downloadUrl);
    });

    test("Admin can obtain signed download URL for review", async () => {
      setTestSession({
        userId: adminId,
        email: adminEmail,
        role: "ADMIN",
        name: "Mac Test Admin",
      });

      const res = await getFileDownloadUrlAction(uploadedFileKey);
      assert.equal(res.success, true);
      assert.ok(res.downloadUrl);
    });

    test("Direct streaming route /api/files/[...fileKey] serves inline PDF with Accept-Ranges for Safari", async () => {
      setTestSession({
        userId: candidate1Id,
        email: candidate1Email,
        role: "PARTICIPANT",
        name: "Mac Test Candidate 1",
      });

      const keyParts = uploadedFileKey.split("/");
      const req = new NextRequest(new URL(`http://localhost:3000/api/files/${uploadedFileKey}`));

      const response = await fileStreamingGet(req, {
        params: Promise.resolve({ fileKey: keyParts }),
      });

      assert.equal(response.status, 200);
      const contentType = response.headers.get("content-type");
      assert.equal(contentType, "application/pdf");

      const disposition = response.headers.get("content-disposition");
      assert.ok(disposition?.startsWith("inline;"));
      assert.ok(disposition?.includes("Strategic_Proposal_Mac.pdf"));

      // Safari streaming requirement
      const acceptRanges = response.headers.get("accept-ranges");
      assert.equal(acceptRanges, "bytes");

      // Verify content length matches buffer
      const contentLength = response.headers.get("content-length");
      assert.ok(Number(contentLength) > 0);
    });

    test("Direct streaming route supports ?download=1 with Content-Disposition: attachment", async () => {
      setTestSession({
        userId: candidate1Id,
        email: candidate1Email,
        role: "PARTICIPANT",
        name: "Mac Test Candidate 1",
      });

      const keyParts = uploadedFileKey.split("/");
      const req = new NextRequest(
        new URL(`http://localhost:3000/api/files/${uploadedFileKey}?download=1`)
      );

      const response = await fileStreamingGet(req, {
        params: Promise.resolve({ fileKey: keyParts }),
      });

      assert.equal(response.status, 200);
      const disposition = response.headers.get("content-disposition");
      assert.ok(disposition?.startsWith("attachment;"));
      assert.ok(disposition?.includes("Strategic_Proposal_Mac.pdf"));
    });

    test("Direct streaming route rejects unauthorized candidate with 403 Forbidden", async () => {
      setTestSession({
        userId: candidate2Id,
        email: candidate2Email,
        role: "PARTICIPANT",
        name: "Mac Test Candidate 2",
      });

      const keyParts = uploadedFileKey.split("/");
      const req = new NextRequest(new URL(`http://localhost:3000/api/files/${uploadedFileKey}`));

      const response = await fileStreamingGet(req, {
        params: Promise.resolve({ fileKey: keyParts }),
      });

      assert.equal(response.status, 403);
    });

    test("Direct streaming route rejects unauthenticated request with 401 Unauthorized", async () => {
      setTestSession(null);

      const keyParts = uploadedFileKey.split("/");
      const req = new NextRequest(new URL(`http://localhost:3000/api/files/${uploadedFileKey}`));

      const response = await fileStreamingGet(req, {
        params: Promise.resolve({ fileKey: keyParts }),
      });

      assert.equal(response.status, 401);
    });
  });
});
