/**
 * ACI Career EDGE Assess / EDGE-Arena — File Storage & Security Test Suite
 * 
 * Verifies:
 * 1. Server-side PDF validation (extension, MIME, size <= 25MB, %PDF magic bytes)
 * 2. Real storage upload, collision-resistant key generation, and SHA-256 calculation
 * 3. Authorized signed URL access (Participant own file, Evaluator, Admin)
 * 4. Cross-user isolation (Participant B cannot access Participant A's private upload)
 * 5. Safe file deletion and cleanup
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { setTestSession, createSessionToken } from "../lib/auth";
import {
  validatePdfFile,
  computeSha256,
  generateStorageKey,
  uploadToStorage,
  getSignedDownloadUrl,
  downloadFromStorage,
  deleteFromStorage,
  MAX_UPLOAD_SIZE_BYTES,
} from "../lib/storage";
import {
  uploadSubmissionAttachmentAction,
  getFileDownloadUrlAction,
  deleteSubmissionAttachmentAction,
} from "../app/actions/file-actions";

describe("EDGE-Arena File Handling, Storage Engine & Security Tests", () => {
  const VALID_PDF_HEADER =
    "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << >> >>\nendobj\n4 0 obj\n<< /Length 44 >>\nstream\nBT /F1 12 Tf 50 720 Td (Test Assessment Deliverable) Tj ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000216 00000 n \ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n310\n%%EOF";

  const validPdfBuffer = Buffer.from(VALID_PDF_HEADER, "utf-8");

  describe("1. Strict Server-Side PDF Validation Engine", () => {
    test("Accepts standard, valid PDF document", () => {
      const res = validatePdfFile(validPdfBuffer, "PitchDeck_Final.pdf", "application/pdf");
      assert.equal(res.isValid, true);
      assert.equal(res.error, undefined);
    });

    test("Rejects empty file (0 bytes)", () => {
      const emptyBuffer = Buffer.alloc(0);
      const res = validatePdfFile(emptyBuffer, "empty.pdf", "application/pdf");
      assert.equal(res.isValid, false);
      assert.match(res.error || "", /empty/i);
    });

    test("Rejects non-PDF file extension (.exe, .docx, .png)", () => {
      const res = validatePdfFile(validPdfBuffer, "malware.exe", "application/pdf");
      assert.equal(res.isValid, false);
      assert.match(res.error || "", /only pdf documents/i);
    });

    test("Rejects invalid declared MIME type", () => {
      const res = validatePdfFile(validPdfBuffer, "report.pdf", "text/plain");
      assert.equal(res.isValid, false);
      assert.match(res.error || "", /invalid mime type/i);
    });

    test("Rejects spoofed PDF without %PDF magic bytes", () => {
      const spoofedBuffer = Buffer.from("NOT_A_REAL_PDF_JUST_PLAIN_TEXT", "utf-8");
      const res = validatePdfFile(spoofedBuffer, "fake_deck.pdf", "application/pdf");
      assert.equal(res.isValid, false);
      assert.match(res.error || "", /spoofed or corrupt/i);
    });

    test("Rejects oversized file exceeding 25 MB", () => {
      // Create small buffer simulation of oversized length check
      const oversizedBuffer = Buffer.alloc(MAX_UPLOAD_SIZE_BYTES + 1024);
      oversizedBuffer.write("%PDF", 0);
      const res = validatePdfFile(oversizedBuffer, "large.pdf", "application/pdf");
      assert.equal(res.isValid, false);
      assert.match(res.error || "", /exceeds maximum allowed limit of 25 mb/i);
    });

    test("Computes consistent SHA-256 checksum", () => {
      const hash1 = computeSha256(validPdfBuffer);
      const hash2 = computeSha256(validPdfBuffer);
      assert.equal(hash1, hash2);
      assert.equal(hash1.length, 64);
    });

    test("Generates unique collision-resistant storage keys", () => {
      const key1 = generateStorageKey("submissions", "sub-1");
      const key2 = generateStorageKey("submissions", "sub-1");
      assert.notEqual(key1, key2);
      assert.match(key1, /^submissions\/sub-1\/\d+-[a-f0-9-]+\.pdf$/);
    });
  });

  describe("2. Storage Provider Live Operations & Signed URLs", () => {
    let uploadedKey: string | null = null;

    after(async () => {
      if (uploadedKey) {
        await deleteFromStorage(uploadedKey);
      }
    });

    test("Uploads valid PDF to private cloud storage", async () => {
      const res = await uploadToStorage({
        buffer: validPdfBuffer,
        fileName: "Strategy_Deck.pdf",
        mimeType: "application/pdf",
        folder: "submissions",
        subFolder: "test-suite",
      });

      assert.ok(res.fileKey);
      assert.equal(res.mimeType, "application/pdf");
      assert.equal(res.sizeBytes, validPdfBuffer.length);
      assert.equal(res.sha256, computeSha256(validPdfBuffer));
      uploadedKey = res.fileKey;
    });

    test("Generates signed download URL and verifies content matches", async () => {
      assert.ok(uploadedKey);
      const signedUrl = await getSignedDownloadUrl(uploadedKey, 3600);
      assert.ok(signedUrl.startsWith("http"));

      const res = await fetch(signedUrl);
      assert.equal(res.status, 200);
      const fetchedBuffer = Buffer.from(await res.arrayBuffer());
      assert.equal(computeSha256(fetchedBuffer), computeSha256(validPdfBuffer));
    });

    test("Downloads file buffer directly via server storage client", async () => {
      assert.ok(uploadedKey);
      const downloaded = await downloadFromStorage(uploadedKey);
      assert.equal(downloaded.contentLength, validPdfBuffer.length);
      assert.equal(computeSha256(downloaded.buffer), computeSha256(validPdfBuffer));
    });
  });

  describe("3. Role Authorization & Cross-Participant Isolation on Files", () => {
    let candidateUser: { id: string; email: string };
    let competitorUser: { id: string; email: string };
    let evaluatorUser: { id: string; email: string };
    let adminUser: { id: string; email: string };
    let testSubmission: { id: string; taskId: string };
    let testQuestion: { id: string };
    let testFileKey: string | null = null;

    before(async () => {
      // 1. Resolve users from DB
      const candidate = await prisma.user.findFirst({
        where: { email: "candidate.demo@example.com" },
      });
      assert.ok(candidate);
      candidateUser = { id: candidate.id, email: candidate.email };

      // Create or find competitor
      const competitor = await prisma.user.upsert({
        where: { email: "competitor.test@example.com" },
        update: {},
        create: {
          id: "00000000-0000-4000-8000-999999999999",
          email: "competitor.test@example.com",
          name: "Competitor Candidate",
          role: "PARTICIPANT",
        },
      });
      competitorUser = { id: competitor.id, email: competitor.email };

      const evaluator = await prisma.user.findFirst({
        where: { email: "evaluator.demo@example.com" },
      });
      assert.ok(evaluator);
      evaluatorUser = { id: evaluator.id, email: evaluator.email };

      const admin = await prisma.user.findFirst({
        where: { email: "admin.demo@example.com" },
      });
      assert.ok(admin);
      adminUser = { id: admin.id, email: admin.email };

      // 2. Find or create task and update phase deadline to future
      let task = await prisma.task.findFirst({
        include: { phase: true },
      });

      if (!task) {
        const contest = await prisma.contest.create({
          data: {
            title: "File Storage Test Contest",
            slug: `file-test-${Date.now()}`,
            track: "Track A",
            status: "LIVE",
            startDate: new Date(),
            endDate: new Date(Date.now() + 86400000),
          },
        });
        const phase = await prisma.phase.create({
          data: {
            contestId: contest.id,
            phaseNumber: 1,
            title: "Phase 1",
            status: "OPEN",
            deadline: new Date(Date.now() + 7 * 24 * 3600 * 1000),
            weightPercentage: 50.0,
          },
        });
        task = await prisma.task.create({
          data: {
            phaseId: phase.id,
            taskNumber: 1,
            title: "File Storage Test Task",
          },
          include: { phase: true },
        });
      }

      assert.ok(task);

      // Ensure phase deadline is in the future for submission eligibility
      await prisma.phase.update({
        where: { id: task.phaseId },
        data: {
          deadline: new Date(Date.now() + 7 * 24 * 3600 * 1000),
          status: "OPEN",
        },
      });

      // Ensure candidateUser is actively enrolled in contest
      await prisma.contestParticipant.upsert({
        where: {
          contestId_userId: {
            contestId: task.phase.contestId,
            userId: candidateUser.id,
          },
        },
        update: { status: "ACTIVE" },
        create: {
          contestId: task.phase.contestId,
          userId: candidateUser.id,
          status: "ACTIVE",
        },
      });

      const sub = await prisma.submission.upsert({
        where: {
          taskId_userId: {
            taskId: task.id,
            userId: candidateUser.id,
          },
        },
        update: { status: "DRAFT" },
        create: {
          contestId: task.phase.contestId,
          phaseId: task.phaseId,
          taskId: task.id,
          userId: candidateUser.id,
          status: "DRAFT",
        },
      });
      testSubmission = { id: sub.id, taskId: task.id };

      let q = await prisma.question.findFirst({
        where: { taskId: task.id },
      });
      if (!q) {
        q = await prisma.question.create({
          data: {
            taskId: task.id,
            questionNumber: 4,
            type: "FILE_UPLOAD",
            prompt: "Upload submission deliverable",
            points: 25,
            isMandatory: true,
          },
        });
      }
      assert.ok(q);
      testQuestion = { id: q.id };
    });

    after(async () => {
      setTestSession(undefined);
      if (testFileKey) {
        await deleteFromStorage(testFileKey);
      }
    });

    test("Participant can upload a valid PDF attachment", async () => {
      setTestSession({
        userId: candidateUser.id,
        email: candidateUser.email,
        role: "PARTICIPANT",
        name: "Demo Candidate",
        issuedAt: Date.now(),
        expiresAt: Date.now() + 3600 * 1000,
      });

      const file = new File([validPdfBuffer], "Campus_ESG_PitchDeck.pdf", {
        type: "application/pdf",
      });

      const formData = new FormData();
      formData.append("submissionId", testSubmission.id);
      formData.append("questionId", testQuestion.id);
      formData.append("file", file);

      const res = await uploadSubmissionAttachmentAction(formData);

      assert.equal(res.success, true);
      assert.ok(res.file);
      assert.equal(res.file.name, "Campus_ESG_PitchDeck.pdf");
      assert.ok(res.file.fileKey);
      assert.ok(res.file.downloadUrl);
      testFileKey = res.file.fileKey;

      // Verify DB record
      const dbAnswer = await prisma.submissionAnswer.findUnique({
        where: {
          submissionId_questionId: {
            submissionId: testSubmission.id,
            questionId: testQuestion.id,
          },
        },
      });

      assert.ok(dbAnswer);
      assert.equal(dbAnswer.fileKey, testFileKey);
      assert.equal(dbAnswer.fileName, "Campus_ESG_PitchDeck.pdf");
    });

    test("Participant can obtain download URL for their OWN submission file", async () => {
      assert.ok(testFileKey);
      setTestSession({
        userId: candidateUser.id,
        email: candidateUser.email,
        role: "PARTICIPANT",
        name: "Demo Candidate",
        issuedAt: Date.now(),
        expiresAt: Date.now() + 3600 * 1000,
      });

      const res = await getFileDownloadUrlAction(testFileKey);
      assert.equal(res.success, true);
      assert.ok(res.downloadUrl);
    });

    test("Competitor participant is BLOCKED from accessing candidate's submission file (403)", async () => {
      assert.ok(testFileKey);
      setTestSession({
        userId: competitorUser.id,
        email: competitorUser.email,
        role: "PARTICIPANT",
        name: "Competitor Candidate",
        issuedAt: Date.now(),
        expiresAt: Date.now() + 3600 * 1000,
      });

      const res = await getFileDownloadUrlAction(testFileKey);
      assert.equal(res.success, false);
      assert.match(res.error || "", /forbidden/i);
    });

    test("Evaluator CAN obtain download URL for candidate submission file", async () => {
      assert.ok(testFileKey);
      setTestSession({
        userId: evaluatorUser.id,
        email: evaluatorUser.email,
        role: "EVALUATOR",
        name: "Demo Evaluator",
        issuedAt: Date.now(),
        expiresAt: Date.now() + 3600 * 1000,
      });

      const res = await getFileDownloadUrlAction(testFileKey);
      assert.equal(res.success, true);
      assert.ok(res.downloadUrl);
    });

    test("Admin CAN obtain download URL for candidate submission file", async () => {
      assert.ok(testFileKey);
      setTestSession({
        userId: adminUser.id,
        email: adminUser.email,
        role: "ADMIN",
        name: "Demo Admin",
        issuedAt: Date.now(),
        expiresAt: Date.now() + 3600 * 1000,
      });

      const res = await getFileDownloadUrlAction(testFileKey);
      assert.equal(res.success, true);
      assert.ok(res.downloadUrl);
    });

    test("Candidate can remove their uploaded attachment before final submission", async () => {
      setTestSession({
        userId: candidateUser.id,
        email: candidateUser.email,
        role: "PARTICIPANT",
        name: "Demo Candidate",
        issuedAt: Date.now(),
        expiresAt: Date.now() + 3600 * 1000,
      });

      const res = await deleteSubmissionAttachmentAction(
        testSubmission.id,
        testQuestion.id
      );

      assert.equal(res.success, true);

      // Verify DB record cleared
      const dbAnswer = await prisma.submissionAnswer.findUnique({
        where: {
          submissionId_questionId: {
            submissionId: testSubmission.id,
            questionId: testQuestion.id,
          },
        },
      });

      assert.equal(dbAnswer?.fileKey, null);
      testFileKey = null;
    });
  });
});
