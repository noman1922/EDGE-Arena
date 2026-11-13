import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, before, describe, it } from "node:test";
import {
  ContestStatus,
  ParticipantStatus,
  PhaseAttemptStatus,
  PhaseStatus,
  QuestionType,
  SubmissionStatus,
  UserRole,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { setTestSession } from "@/lib/auth";
import { computeSha256 } from "@/lib/storage";
import {
  deleteSubmissionAttachmentAction,
  getFileDownloadUrlAction,
  uploadSubmissionAttachmentAction,
} from "@/app/actions/file-actions";

const VALID_PDF_BYTES = Buffer.from(
  "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\ntrailer\n<< /Size 4 /Root 1 0 R >>\n%%EOF",
  "utf8"
);

function buildUploadFormData(
  submissionId: string,
  questionId: string,
  fileName: string,
  extraFields?: Record<string, string>
): FormData {
  const fd = new FormData();
  fd.append("submissionId", submissionId);
  fd.append("questionId", questionId);
  fd.append("file", new File([VALID_PDF_BYTES], fileName, { type: "application/pdf" }));
  if (extraFields) {
    for (const [k, v] of Object.entries(extraFields)) {
      fd.append(k, v);
    }
  }
  return fd;
}

describe("A5: Upload/Delete Attachment Timer Authorization", () => {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

  const adminId = crypto.randomUUID();
  const evalId = crypto.randomUUID();
  const partAId = crypto.randomUUID();
  const partBId = crypto.randomUUID();
  const partNonEnrolledId = crypto.randomUUID();
  const partDisqualifiedId = crypto.randomUUID();

  const contestId = crypto.randomUUID();
  const phaseId = crypto.randomUUID();
  const taskId = crypto.randomUUID();
  const otherTaskId = crypto.randomUUID();
  const qUploadId = crypto.randomUUID();
  const otherTaskQId = crypto.randomUUID();

  const subPartAId = crypto.randomUUID();
  const subNonEnrolledId = crypto.randomUUID();
  const subDisqualifiedId = crypto.randomUUID();

  const now = Date.now();
  const pastStart = new Date(now - 2 * 3600 * 1000);
  const futureContestEnd = new Date(now + 7 * 24 * 3600 * 1000);
  const futurePhaseDeadline = new Date(now + 3 * 24 * 3600 * 1000);

  before(async () => {
    await prisma.user.createMany({
      data: [
        {
          id: adminId,
          email: `a5.admin.${suffix}@edge-test.internal`,
          name: "A5 Admin",
          role: UserRole.ADMIN,
          isActive: true,
        },
        {
          id: evalId,
          email: `a5.eval.${suffix}@edge-test.internal`,
          name: "A5 Evaluator",
          role: UserRole.EVALUATOR,
          isActive: true,
        },
        {
          id: partAId,
          email: `a5.parta.${suffix}@edge-test.internal`,
          name: "A5 Participant A",
          role: UserRole.PARTICIPANT,
          candidateId: `A5-A-${suffix}`,
          isActive: true,
        },
        {
          id: partBId,
          email: `a5.partb.${suffix}@edge-test.internal`,
          name: "A5 Participant B",
          role: UserRole.PARTICIPANT,
          candidateId: `A5-B-${suffix}`,
          isActive: true,
        },
        {
          id: partNonEnrolledId,
          email: `a5.nonenrolled.${suffix}@edge-test.internal`,
          name: "A5 Non-Enrolled",
          role: UserRole.PARTICIPANT,
          candidateId: `A5-NE-${suffix}`,
          isActive: true,
        },
        {
          id: partDisqualifiedId,
          email: `a5.disq.${suffix}@edge-test.internal`,
          name: "A5 Disqualified",
          role: UserRole.PARTICIPANT,
          candidateId: `A5-DQ-${suffix}`,
          isActive: true,
        },
      ],
    });

    await prisma.contest.create({
      data: {
        id: contestId,
        slug: `a5-attachment-timer-${suffix}`,
        title: `A5 Attachment Timer Contest ${suffix}`,
        track: "Strategy",
        status: ContestStatus.LIVE,
        startDate: pastStart,
        endDate: futureContestEnd,
      },
    });

    await prisma.contestParticipant.createMany({
      data: [
        { contestId, userId: partAId, status: ParticipantStatus.ACTIVE },
        { contestId, userId: partBId, status: ParticipantStatus.ACTIVE },
        { contestId, userId: partDisqualifiedId, status: ParticipantStatus.DISQUALIFIED },
      ],
    });

    const ce = await prisma.contestEvaluator.create({
      data: { contestId, userId: evalId },
    });
    await prisma.evaluatorCandidateAssignment.create({
      data: {
        contestId,
        contestEvaluatorId: ce.id,
        evaluatorId: evalId,
        participantId: partAId,
      },
    });

    await prisma.phase.create({
      data: {
        id: phaseId,
        contestId,
        phaseNumber: 1,
        title: "Phase 1",
        status: PhaseStatus.OPEN,
        deadline: futurePhaseDeadline,
        durationMinutes: 120,
        weightPercentage: 100,
      },
    });

    await prisma.task.createMany({
      data: [
        {
          id: taskId,
          phaseId,
          taskNumber: 1,
          title: "Primary Upload Task",
          durationMinutes: 60,
          totalPoints: 50,
        },
        {
          id: otherTaskId,
          phaseId,
          taskNumber: 2,
          title: "Secondary Task",
          durationMinutes: 60,
          totalPoints: 50,
        },
      ],
    });

    await prisma.question.createMany({
      data: [
        {
          id: qUploadId,
          taskId,
          questionNumber: 1,
          type: QuestionType.FILE_UPLOAD,
          prompt: "Upload your deliverable PDF",
          points: 50,
        },
        {
          id: otherTaskQId,
          taskId: otherTaskId,
          questionNumber: 1,
          type: QuestionType.FILE_UPLOAD,
          prompt: "Secondary task PDF",
          points: 50,
        },
      ],
    });

    await prisma.phaseAttempt.create({
      data: {
        contestId,
        phaseId,
        userId: partAId,
        status: PhaseAttemptStatus.IN_PROGRESS,
        startedAt: new Date(now - 10 * 60 * 1000),
        expiresAt: new Date(now + 110 * 60 * 1000),
      },
    });

    await prisma.submission.createMany({
      data: [
        {
          id: subPartAId,
          contestId,
          phaseId,
          taskId,
          userId: partAId,
          status: SubmissionStatus.DRAFT,
          startedAt: new Date(now - 10 * 60 * 1000),
          expiresAt: new Date(now + 50 * 60 * 1000),
        },
        {
          id: subNonEnrolledId,
          contestId,
          phaseId,
          taskId,
          userId: partNonEnrolledId,
          status: SubmissionStatus.DRAFT,
          startedAt: new Date(now - 5 * 60 * 1000),
          expiresAt: new Date(now + 50 * 60 * 1000),
        },
        {
          id: subDisqualifiedId,
          contestId,
          phaseId,
          taskId,
          userId: partDisqualifiedId,
          status: SubmissionStatus.DRAFT,
          startedAt: new Date(now - 5 * 60 * 1000),
          expiresAt: new Date(now + 50 * 60 * 1000),
        },
      ],
    });
  });

  after(async () => {
    setTestSession(undefined);
    await prisma.contest.delete({ where: { id: contestId } }).catch(() => {});
    await prisma.user.deleteMany({
      where: {
        id: {
          in: [
            adminId,
            evalId,
            partAId,
            partBId,
            partNonEnrolledId,
            partDisqualifiedId,
          ],
        },
      },
    }).catch(() => {});
  });

  it("1. Rejects unauthenticated, wrong-role, cross-user, non-enrolled, and mismatched-question upload/delete", async () => {
    // Unauthenticated
    setTestSession(null);
    const unauthUpload = await uploadSubmissionAttachmentAction(
      buildUploadFormData(subPartAId, qUploadId, "unauth.pdf")
    );
    assert.equal(unauthUpload.success, false);
    assert.match(unauthUpload.error || "", /unauthorized/i);

    const unauthDel = await deleteSubmissionAttachmentAction(subPartAId, qUploadId);
    assert.equal(unauthDel.success, false);
    assert.match(unauthDel.error || "", /unauthorized/i);

    // Evaluator / Admin cannot call participant upload/delete actions
    setTestSession({
      userId: evalId,
      email: `a5.eval.${suffix}@edge-test.internal`,
      role: "EVALUATOR",
      name: "A5 Evaluator",
    });
    const evalUpload = await uploadSubmissionAttachmentAction(
      buildUploadFormData(subPartAId, qUploadId, "eval.pdf")
    );
    assert.equal(evalUpload.success, false);
    assert.match(evalUpload.error || "", /forbidden/i);

    // Cross-user Participant B cannot upload to or delete Participant A's submission
    // even if supplying Participant A's ID in FormData
    setTestSession({
      userId: partBId,
      email: `a5.partb.${suffix}@edge-test.internal`,
      role: "PARTICIPANT",
      name: "A5 Participant B",
    });
    const crossUpload = await uploadSubmissionAttachmentAction(
      buildUploadFormData(subPartAId, qUploadId, "spoof.pdf", {
        participantUserId: partAId,
        deadline: new Date(Date.now() + 999999999).toISOString(),
      })
    );
    assert.equal(crossUpload.success, false);
    assert.match(crossUpload.error || "", /another candidate/i);

    const crossDel = await deleteSubmissionAttachmentAction(subPartAId, qUploadId);
    assert.equal(crossDel.success, false);
    assert.match(crossDel.error || "", /another candidate/i);

    // Non-enrolled participant rejected
    setTestSession({
      userId: partNonEnrolledId,
      email: `a5.nonenrolled.${suffix}@edge-test.internal`,
      role: "PARTICIPANT",
      name: "A5 Non-Enrolled",
    });
    const neUpload = await uploadSubmissionAttachmentAction(
      buildUploadFormData(subNonEnrolledId, qUploadId, "ne.pdf")
    );
    assert.equal(neUpload.success, false);
    assert.match(neUpload.error || "", /not actively enrolled/i);

    const neDel = await deleteSubmissionAttachmentAction(subNonEnrolledId, qUploadId);
    assert.equal(neDel.success, false);
    assert.match(neDel.error || "", /not actively enrolled/i);

    // Disqualified participant rejected
    setTestSession({
      userId: partDisqualifiedId,
      email: `a5.disq.${suffix}@edge-test.internal`,
      role: "PARTICIPANT",
      name: "A5 Disqualified",
    });
    const disqUpload = await uploadSubmissionAttachmentAction(
      buildUploadFormData(subDisqualifiedId, qUploadId, "dq.pdf")
    );
    assert.equal(disqUpload.success, false);
    assert.match(disqUpload.error || "", /not actively enrolled/i);

    // Mismatched question (belongs to secondary task) rejected for Participant A
    setTestSession({
      userId: partAId,
      email: `a5.parta.${suffix}@edge-test.internal`,
      role: "PARTICIPANT",
      name: "A5 Participant A",
    });
    const badQUpload = await uploadSubmissionAttachmentAction(
      buildUploadFormData(subPartAId, otherTaskQId, "wrong_task.pdf")
    );
    assert.equal(badQUpload.success, false);
    assert.match(badQUpload.error || "", /does not belong to this assessment task/i);

    const badQDel = await deleteSubmissionAttachmentAction(subPartAId, otherTaskQId);
    assert.equal(badQDel.success, false);
    assert.match(badQDel.error || "", /does not belong to this assessment task/i);
  });

  it("2. Allows valid upload, replacement, and deletion before deadline, preserving evaluator/admin file access", async () => {
    setTestSession({
      userId: partAId,
      email: `a5.parta.${suffix}@edge-test.internal`,
      role: "PARTICIPANT",
      name: "A5 Participant A",
    });

    const firstUpload = await uploadSubmissionAttachmentAction(
      buildUploadFormData(subPartAId, qUploadId, "Draft_V1.pdf", {
        // Fake past client timer must be ignored when authoritative server timers are valid
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      })
    );
    assert.equal(firstUpload.success, true);
    assert.ok(firstUpload.file?.fileKey);

    // Replace attachment cleanly before deadline
    const replaceUpload = await uploadSubmissionAttachmentAction(
      buildUploadFormData(subPartAId, qUploadId, "Draft_V2.pdf")
    );
    assert.equal(replaceUpload.success, true);
    assert.ok(replaceUpload.file?.fileKey);
    assert.notEqual(replaceUpload.file.fileKey, firstUpload.file.fileKey);

    // Evaluator and Admin authorized workflows continue working on active submission file
    setTestSession({
      userId: evalId,
      email: `a5.eval.${suffix}@edge-test.internal`,
      role: "EVALUATOR",
      name: "A5 Evaluator",
    });
    const evalDownload = await getFileDownloadUrlAction(replaceUpload.file.fileKey);
    assert.equal(evalDownload.success, true);

    setTestSession({
      userId: adminId,
      email: `a5.admin.${suffix}@edge-test.internal`,
      role: "ADMIN",
      name: "A5 Admin",
    });
    const adminDownload = await getFileDownloadUrlAction(replaceUpload.file.fileKey);
    assert.equal(adminDownload.success, true);

    // Delete before deadline succeeds
    setTestSession({
      userId: partAId,
      email: `a5.parta.${suffix}@edge-test.internal`,
      role: "PARTICIPANT",
      name: "A5 Participant A",
    });
    const delRes = await deleteSubmissionAttachmentAction(subPartAId, qUploadId);
    assert.equal(delRes.success, true);

    const clearedAnswer = await prisma.submissionAnswer.findUnique({
      where: { submissionId_questionId: { submissionId: subPartAId, questionId: qUploadId } },
    });
    assert.equal(clearedAnswer?.fileKey, null);

    // Re-upload fresh attachment prior to deadline tests
    const activeUpload = await uploadSubmissionAttachmentAction(
      buildUploadFormData(subPartAId, qUploadId, "Final_Valid.pdf")
    );
    assert.equal(activeUpload.success, true);
  });

  it("3. Blocks upload, replacement, and deletion when individual task timer (submission.expiresAt) expires even within phase/contest bounds", async () => {
    const preAnswer = await prisma.submissionAnswer.findUnique({
      where: { submissionId_questionId: { submissionId: subPartAId, questionId: qUploadId } },
    });
    assert.ok(preAnswer?.fileKey);
    const preservedKey = preAnswer.fileKey;
    const preservedSha = computeSha256(VALID_PDF_BYTES);

    // Expire individual task timer by 5 seconds (0s grace for uploads/deletes)
    await prisma.submission.update({
      where: { id: subPartAId },
      data: {
        expiresAt: new Date(Date.now() - 5 * 1000),
        status: SubmissionStatus.DRAFT,
      },
    });

    setTestSession({
      userId: partAId,
      email: `a5.parta.${suffix}@edge-test.internal`,
      role: "PARTICIPANT",
      name: "A5 Participant A",
    });

    // Attempt replacement after task expiry -> MUST FAIL
    const lateReplace = await uploadSubmissionAttachmentAction(
      buildUploadFormData(subPartAId, qUploadId, "Late_Replace.pdf")
    );
    assert.equal(lateReplace.success, false);
    assert.match(lateReplace.error || "", /deadline has elapsed|finalized|locked/i);

    // Attempt deletion after task expiry -> MUST FAIL
    const lateDelete = await deleteSubmissionAttachmentAction(subPartAId, qUploadId);
    assert.equal(lateDelete.success, false);
    assert.match(lateDelete.error || "", /deadline has elapsed|finalized|locked/i);

    // Original attachment metadata remains intact
    const postAnswer = await prisma.submissionAnswer.findUnique({
      where: { submissionId_questionId: { submissionId: subPartAId, questionId: qUploadId } },
    });
    assert.equal(postAnswer?.fileKey, preservedKey);
    assert.equal(postAnswer?.fileSha256, preservedSha);

    // Submission was safely auto-finalized on timer expiry
    const postSub = await prisma.submission.findUnique({ where: { id: subPartAId } });
    assert.equal(postSub?.status, SubmissionStatus.SUBMITTED);

    // Reset submission back to DRAFT with future task timer for next timer tests
    await prisma.submission.update({
      where: { id: subPartAId },
      data: {
        status: SubmissionStatus.DRAFT,
        submittedAt: null,
        expiresAt: new Date(Date.now() + 50 * 60 * 1000),
      },
    });
  });

  it("4. Blocks upload and deletion when PhaseAttempt timer or Phase deadline has expired", async () => {
    const answerBefore = await prisma.submissionAnswer.findUnique({
      where: { submissionId_questionId: { submissionId: subPartAId, questionId: qUploadId } },
    });
    assert.ok(answerBefore?.fileKey);
    const preservedKey = answerBefore.fileKey;

    setTestSession({
      userId: partAId,
      email: `a5.parta.${suffix}@edge-test.internal`,
      role: "PARTICIPANT",
      name: "A5 Participant A",
    });

    // Case A: PhaseAttempt timer expired (even though task expiresAt & phase.deadline are future)
    await prisma.phaseAttempt.update({
      where: { phaseId_userId: { phaseId, userId: partAId } },
      data: { expiresAt: new Date(Date.now() - 10 * 1000), status: PhaseAttemptStatus.IN_PROGRESS },
    });

    const uploadAfterPhaseAttempt = await uploadSubmissionAttachmentAction(
      buildUploadFormData(subPartAId, qUploadId, "Late_PhaseAttempt.pdf")
    );
    assert.equal(uploadAfterPhaseAttempt.success, false);

    // Reset sub status to DRAFT to verify delete rejection directly against PhaseAttempt EXPIRED
    await prisma.submission.update({
      where: { id: subPartAId },
      data: { status: SubmissionStatus.DRAFT, submittedAt: null },
    });

    const deleteAfterPhaseAttempt = await deleteSubmissionAttachmentAction(subPartAId, qUploadId);
    assert.equal(deleteAfterPhaseAttempt.success, false);

    // Case B: PhaseAttempt restored, Phase calendar deadline expired (while contest.endDate still future)
    await prisma.phaseAttempt.update({
      where: { phaseId_userId: { phaseId, userId: partAId } },
      data: { expiresAt: new Date(Date.now() + 60 * 60 * 1000), status: PhaseAttemptStatus.IN_PROGRESS },
    });
    await prisma.submission.update({
      where: { id: subPartAId },
      data: { status: SubmissionStatus.DRAFT, submittedAt: null },
    });
    await prisma.phase.update({
      where: { id: phaseId },
      data: { deadline: new Date(Date.now() - 5 * 1000) },
    });

    const uploadAfterPhaseDeadline = await uploadSubmissionAttachmentAction(
      buildUploadFormData(subPartAId, qUploadId, "Late_PhaseDeadline.pdf")
    );
    assert.equal(uploadAfterPhaseDeadline.success, false);
    assert.match(uploadAfterPhaseDeadline.error || "", /deadline has elapsed|locked/i);

    await prisma.submission.update({
      where: { id: subPartAId },
      data: { status: SubmissionStatus.DRAFT, submittedAt: null },
    });

    const deleteAfterPhaseDeadline = await deleteSubmissionAttachmentAction(subPartAId, qUploadId);
    assert.equal(deleteAfterPhaseDeadline.success, false);
    assert.match(deleteAfterPhaseDeadline.error || "", /deadline has elapsed|locked/i);

    // Preserved fileKey unchanged throughout
    const answerAfter = await prisma.submissionAnswer.findUnique({
      where: { submissionId_questionId: { submissionId: subPartAId, questionId: qUploadId } },
    });
    assert.equal(answerAfter?.fileKey, preservedKey);

    // Evaluator still retains authorized download access to preserved attachment
    setTestSession({
      userId: evalId,
      email: `a5.eval.${suffix}@edge-test.internal`,
      role: "EVALUATOR",
      name: "A5 Evaluator",
    });
    const evalAccess = await getFileDownloadUrlAction(preservedKey);
    assert.equal(evalAccess.success, true);
  });

  it("5. Blocks upload and deletion when submission is SUBMITTED or contest has concluded", async () => {
    await prisma.phase.update({
      where: { id: phaseId },
      data: { deadline: futurePhaseDeadline },
    });

    setTestSession({
      userId: partAId,
      email: `a5.parta.${suffix}@edge-test.internal`,
      role: "PARTICIPANT",
      name: "A5 Participant A",
    });

    // Submitted submission must reject attachment modifications
    await prisma.submission.update({
      where: { id: subPartAId },
      data: { status: SubmissionStatus.SUBMITTED },
    });
    const subUpload = await uploadSubmissionAttachmentAction(
      buildUploadFormData(subPartAId, qUploadId, "After_Submit.pdf")
    );
    assert.equal(subUpload.success, false);
    assert.match(subUpload.error || "", /finalized/i);

    const subDel = await deleteSubmissionAttachmentAction(subPartAId, qUploadId);
    assert.equal(subDel.success, false);
    assert.match(subDel.error || "", /finalized/i);

    // Concluded contest must reject even if draft
    await prisma.submission.update({
      where: { id: subPartAId },
      data: { status: SubmissionStatus.DRAFT },
    });
    await prisma.contest.update({
      where: { id: contestId },
      data: { status: ContestStatus.COMPLETED },
    });

    const endedUpload = await uploadSubmissionAttachmentAction(
      buildUploadFormData(subPartAId, qUploadId, "After_Contest.pdf")
    );
    assert.equal(endedUpload.success, false);
    assert.match(endedUpload.error || "", /concluded/i);

    const endedDel = await deleteSubmissionAttachmentAction(subPartAId, qUploadId);
    assert.equal(endedDel.success, false);
    assert.match(endedDel.error || "", /concluded/i);
  });
});
