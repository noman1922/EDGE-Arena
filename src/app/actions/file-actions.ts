"use server";

import { prisma } from "@/lib/prisma";
import { ContestStatus, PhaseAttemptStatus, PhaseStatus } from "@prisma/client";
import { requireRole, requireSession, type SessionPayload } from "@/lib/auth";
import { authorizeFileAccess } from "@/lib/file-authorization";
import { checkSubmissionDeadline } from "@/lib/scoring";
import {
  getAuthoritativeAttemptDeadline,
  isContestConcluded,
  isContestUpcoming,
} from "@/lib/contest-lifecycle";
import { autoFinalizeExpiredSubmissionInternal } from "@/app/actions/assessment-actions";
import {
  uploadToStorage,
  getSignedDownloadUrl,
  deleteFromStorage,
  validatePdfFile,
  computeSha256,
  MAX_UPLOAD_SIZE_BYTES,
} from "@/lib/storage";

export interface UploadedFileInfo {
  name: string;
  size: string;
  sizeBytes: number;
  time: string;
  hash: string;
  fileKey: string;
  downloadUrl: string;
}

export interface UploadActionResult {
  success: boolean;
  file?: UploadedFileInfo;
  error?: string;
}

export interface DownloadUrlResult {
  success: boolean;
  downloadUrl?: string;
  fileName?: string;
  error?: string;
}

async function authorizeMutableSubmissionAttachment(
  session: SessionPayload,
  submissionId: string,
  questionId: string,
  operation: "upload" | "delete"
): Promise<
  | {
      ok: true;
      now: Date;
      submissionId: string;
      questionId: string;
      maxFileSizeBytes: bigint | null;
    }
  | {
      ok: false;
      error: string;
    }
> {
  const normalizedSubmissionId =
    typeof submissionId === "string" ? submissionId.trim() : "";
  const normalizedQuestionId =
    typeof questionId === "string" ? questionId.trim() : "";

  if (!normalizedSubmissionId || !normalizedQuestionId) {
    return {
      ok: false,
      error: "Missing required parameters: submissionId or questionId.",
    };
  }

  // Verify active participant DB record rather than trusting client-supplied IDs or timers
  const actor = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, isActive: true },
  });

  if (!actor || !actor.isActive || actor.role !== "PARTICIPANT") {
    return {
      ok: false,
      error: "Unauthorized: Active participant account required.",
    };
  }

  const submission = await prisma.submission.findUnique({
    where: { id: normalizedSubmissionId },
    include: {
      phase: true,
      contest: true,
      task: true,
    },
  });

  if (!submission) {
    return { ok: false, error: "Submission session not found." };
  }

  if (submission.userId !== actor.id) {
    return {
      ok: false,
      error:
        "Unauthorized access: You cannot modify another candidate's submission.",
    };
  }

  if (
    submission.phase.contestId !== submission.contestId ||
    submission.task.phaseId !== submission.phaseId
  ) {
    return {
      ok: false,
      error: "Invalid assessment submission hierarchy.",
    };
  }

  const [enrollment, question, phaseAttempt] = await Promise.all([
    prisma.contestParticipant.findUnique({
      where: {
        contestId_userId: {
          contestId: submission.contestId,
          userId: actor.id,
        },
      },
      select: { status: true },
    }),
    prisma.question.findUnique({
      where: { id: normalizedQuestionId },
      select: {
        id: true,
        taskId: true,
        maxFileSizeBytes: true,
      },
    }),
    prisma.phaseAttempt.findUnique({
      where: {
        phaseId_userId: {
          phaseId: submission.phaseId,
          userId: actor.id,
        },
      },
      select: {
        id: true,
        status: true,
        startedAt: true,
        expiresAt: true,
      },
    }),
  ]);

  if (
    !enrollment ||
    (enrollment.status !== "ACTIVE" && enrollment.status !== "ENROLLED")
  ) {
    return {
      ok: false,
      error: "Unauthorized: Participant is not actively enrolled in this contest.",
    };
  }

  if (!question || question.taskId !== submission.taskId) {
    return {
      ok: false,
      error: "Specified question does not belong to this assessment task.",
    };
  }

  if (submission.status !== "DRAFT") {
    return {
      ok: false,
      error: "Assessment has already been finalized and locked.",
    };
  }

  const now = new Date();
  if (isContestConcluded(submission.contest, now)) {
    return {
      ok: false,
      error: "Contest has concluded. Attachment modifications are locked.",
    };
  }

  if (
    submission.contest.status !== ContestStatus.LIVE ||
    isContestUpcoming(submission.contest, now)
  ) {
    return {
      ok: false,
      error: "Contest is not currently active for attachment modifications.",
    };
  }

  if (submission.phase.status !== PhaseStatus.OPEN) {
    return {
      ok: false,
      error: "Assessment phase is not open for attachment modifications.",
    };
  }

  if (
    phaseAttempt &&
    (phaseAttempt.status === PhaseAttemptStatus.EXPIRED ||
      phaseAttempt.status === PhaseAttemptStatus.COMPLETED)
  ) {
    if (phaseAttempt.status === PhaseAttemptStatus.EXPIRED) {
      await autoFinalizeExpiredSubmissionInternal(
        submission.id,
        `Phase attempt expired before attachment ${operation}`
      ).catch(() => {});
    }
    return {
      ok: false,
      error: "Assessment timer has expired. Attachment modifications are locked.",
    };
  }

  // Enforce authoritative hierarchical deadline across contest, phase, PhaseAttempt, and task timers
  const effectiveTaskForDeadline = {
    id: submission.task.id,
    durationMinutes:
      submission.task.durationMinutes ??
      submission.contest.durationMinutes ??
      (submission.expiresAt ? 1 : null),
  };
  const attemptDeadline = getAuthoritativeAttemptDeadline(
    submission.contest,
    submission.phase,
    submission,
    now,
    effectiveTaskForDeadline,
    phaseAttempt
  );
  const deadlineCheck = checkSubmissionDeadline(
    attemptDeadline.effectiveDeadline,
    now,
    0
  );

  if (
    attemptDeadline.isAttemptExpired ||
    attemptDeadline.isPhaseExpired ||
    attemptDeadline.isConcluded ||
    !deadlineCheck.isEligible
  ) {
    if (
      phaseAttempt &&
      attemptDeadline.isPhaseExpired &&
      phaseAttempt.status === PhaseAttemptStatus.IN_PROGRESS
    ) {
      await prisma.phaseAttempt
        .update({
          where: { id: phaseAttempt.id },
          data: { status: PhaseAttemptStatus.EXPIRED },
        })
        .catch(() => {});
    }

    await autoFinalizeExpiredSubmissionInternal(
      submission.id,
      `Cut-off deadline elapsed during attachment ${operation}`
    ).catch(() => {});

    return {
      ok: false,
      error:
        "Assessment cut-off deadline has elapsed. Attachment modifications are locked.",
    };
  }

  return {
    ok: true,
    now,
    submissionId: submission.id,
    questionId: question.id,
    maxFileSizeBytes: question.maxFileSizeBytes ?? null,
  };
}

/**
 * Handles participant file uploads for assessment submissions (e.g., Question 4 PDF pitch deck).
 * Strict server-side verification:
 * - Participant role enforcement and active enrollment verification
 * - Submission ownership, open status, and contest/phase/task relationship checks
 * - Authoritative server-side hierarchical timer & deadline compliance (0s post-expiry)
 * - Server-side PDF validation (size, MIME, magic bytes %PDF)
 * - Anti-collision object key generation
 * - Immediate orphaned file rollback on DB failure
 */
export async function uploadSubmissionAttachmentAction(
  formData: FormData
): Promise<UploadActionResult> {
  let uploadedFileKey: string | null = null;

  try {
    const session = await requireRole(["PARTICIPANT"]);
    const rawSubmissionId = formData.get("submissionId");
    const rawQuestionId = formData.get("questionId");
    const file = formData.get("file") as File | null;

    if (
      typeof rawSubmissionId !== "string" ||
      typeof rawQuestionId !== "string" ||
      !rawSubmissionId.trim() ||
      !rawQuestionId.trim()
    ) {
      return { success: false, error: "Missing required parameters: submissionId or questionId." };
    }

    if (!file) {
      return { success: false, error: "No file was selected for upload." };
    }

    const authCheck = await authorizeMutableSubmissionAttachment(
      session,
      rawSubmissionId,
      rawQuestionId,
      "upload"
    );
    if (!authCheck.ok) {
      return { success: false, error: authCheck.error };
    }

    const { now, submissionId, questionId, maxFileSizeBytes } = authCheck;

    // Read file bytes and validate PDF constraints
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const validation = validatePdfFile(buffer, file.name, file.type);
    if (!validation.isValid) {
      return { success: false, error: validation.error || "File validation failed." };
    }

    // Enforce question-level constraints if specified
    if (maxFileSizeBytes && BigInt(buffer.length) > maxFileSizeBytes) {
      const maxMb = (Number(maxFileSizeBytes) / (1024 * 1024)).toFixed(0);
      return {
        success: false,
        error: `File size exceeds the specific question limit of ${maxMb} MB.`,
      };
    }

    // Check if previous file exists on this answer to clean up after commit
    const existingAnswer = await prisma.submissionAnswer.findUnique({
      where: {
        submissionId_questionId: {
          submissionId,
          questionId,
        },
      },
    });

    const oldFileKey = existingAnswer?.fileKey;

    // Upload file to private storage
    const uploadResult = await uploadToStorage({
      buffer,
      fileName: file.name,
      mimeType: "application/pdf",
      folder: "submissions",
      subFolder: `${submissionId}/${questionId}`,
    });

    uploadedFileKey = uploadResult.fileKey;

    // Persist file metadata in database
    await prisma.submissionAnswer.upsert({
      where: {
        submissionId_questionId: {
          submissionId,
          questionId,
        },
      },
      update: {
        fileName: file.name,
        fileKey: uploadResult.fileKey,
        fileSizeBytes: BigInt(buffer.length),
        fileSha256: uploadResult.sha256,
        updatedAt: now,
      },
      create: {
        submissionId,
        questionId,
        fileName: file.name,
        fileKey: uploadResult.fileKey,
        fileSizeBytes: BigInt(buffer.length),
        fileSha256: uploadResult.sha256,
      },
    });

    // Update autoSavedAt on submission
    await prisma.submission.update({
      where: { id: submissionId },
      data: { autoSavedAt: now },
    });

    // Safely delete superseded file if one existed
    if (oldFileKey && oldFileKey !== uploadResult.fileKey) {
      await deleteFromStorage(oldFileKey).catch((e) =>
        console.warn("Non-fatal: Failed to clean up superseded file:", oldFileKey, e)
      );
    }

    // Generate temporary preview signed URL
    const signedDownloadUrl = await getSignedDownloadUrl(uploadResult.fileKey, 3600);

    const sizeFormatted = (buffer.length / (1024 * 1024)).toFixed(1) + " MB";
    const shortHash =
      uploadResult.sha256.substring(0, 8) + "..." + uploadResult.sha256.substring(uploadResult.sha256.length - 8);

    return {
      success: true,
      file: {
        name: file.name,
        size: sizeFormatted,
        sizeBytes: buffer.length,
        time: now.toLocaleTimeString("en-US", { hour12: false }),
        hash: `SHA-256: ${shortHash}`,
        fileKey: uploadResult.fileKey,
        downloadUrl: signedDownloadUrl,
      },
    };
  } catch (error) {
    console.error("Upload submission attachment error:", error);

    // Rollback: if storage upload succeeded but DB write failed, remove uploaded object to prevent orphaned storage
    if (uploadedFileKey) {
      await deleteFromStorage(uploadedFileKey).catch((delErr) =>
        console.error("Failed to rollback orphaned storage object:", delErr)
      );
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to upload file attachment.",
    };
  }
}

/**
 * Removes an uploaded submission attachment (strictly before deadline and before finalization).
 */
export async function deleteSubmissionAttachmentAction(
  submissionId: string,
  questionId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireRole(["PARTICIPANT"]);

    const authCheck = await authorizeMutableSubmissionAttachment(
      session,
      submissionId,
      questionId,
      "delete"
    );
    if (!authCheck.ok) {
      return { success: false, error: authCheck.error };
    }

    const answer = await prisma.submissionAnswer.findUnique({
      where: {
        submissionId_questionId: {
          submissionId: authCheck.submissionId,
          questionId: authCheck.questionId,
        },
      },
    });

    if (!answer || !answer.fileKey) {
      return { success: true };
    }

    const fileKeyToDelete = answer.fileKey;

    // Clear database metadata
    await prisma.submissionAnswer.update({
      where: {
        submissionId_questionId: {
          submissionId: authCheck.submissionId,
          questionId: authCheck.questionId,
        },
      },
      data: {
        fileKey: null,
        fileName: null,
        fileSizeBytes: null,
        fileSha256: null,
      },
    });

    // Delete object from storage
    await deleteFromStorage(fileKeyToDelete);

    return { success: true };
  } catch (error) {
    console.error("Delete submission attachment error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete attachment.",
    };
  }
}

/**
 * Generates an authorized, short-lived signed download URL for private files.
 * Enforces strict path validation and role-based database authorization:
 * - PARTICIPANT: Only own submission files or reference materials for enrolled contests.
 * - EVALUATOR: Assigned contest references and assigned candidate submission files.
 * - ADMIN: DB-verified submission answers and reference materials only.
 */
export async function getFileDownloadUrlAction(
  fileKey: string
): Promise<DownloadUrlResult> {
  try {
    const session = await requireSession();
    const access = await authorizeFileAccess(session, fileKey);

    if (!access.authorized) {
      return {
        success: false,
        error: access.error,
      };
    }

    try {
      const signedUrl = await getSignedDownloadUrl(access.fileKey, 3600);
      return {
        success: true,
        downloadUrl: signedUrl,
        fileName: access.fileName,
      };
    } catch {
      return {
        success: true,
        downloadUrl: `/api/files/${access.fileKey}`,
        fileName: access.fileName,
      };
    }
  } catch (error) {
    console.error("Get download URL error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to obtain file download URL.",
    };
  }
}
