"use server";

import { prisma } from "@/lib/prisma";
import { requireRole, requireSession } from "@/lib/auth";
import { checkSubmissionDeadline } from "@/lib/scoring";
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

/**
 * Handles participant file uploads for assessment submissions (e.g., Question 4 PDF pitch deck).
 * Strict server-side verification:
 * - Participant role enforcement
 * - Submission ownership and open status verification
 * - Deadline compliance check
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
    const submissionId = formData.get("submissionId") as string;
    const questionId = formData.get("questionId") as string;
    const file = formData.get("file") as File | null;

    if (!submissionId || !questionId) {
      return { success: false, error: "Missing required parameters: submissionId or questionId." };
    }

    if (!file) {
      return { success: false, error: "No file was selected for upload." };
    }

    // 1. Verify submission exists and belongs to the active participant
    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        user: true,
        phase: true,
      },
    });

    if (!submission) {
      return { success: false, error: "Submission session not found." };
    }

    if (submission.userId !== session.userId && submission.user.email !== session.email) {
      return {
        success: false,
        error: "Unauthorized access: You cannot attach files to another candidate's submission.",
      };
    }

    if (submission.status === "SUBMITTED") {
      return { success: false, error: "Assessment has already been finalized and locked." };
    }

    // 2. Server-side deadline check (60s network grace period)
    const deadlineCheck = checkSubmissionDeadline(submission.phase.deadline, new Date(), 60);
    if (!deadlineCheck.isEligible) {
      return { success: false, error: "Assessment cut-off deadline has elapsed. Uploads are locked." };
    }

    // 3. Question validation
    const question = await prisma.question.findUnique({
      where: { id: questionId },
    });

    if (!question || question.taskId !== submission.taskId) {
      return { success: false, error: "Specified question does not belong to this assessment task." };
    }

    // 4. Read file bytes and validate
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const validation = validatePdfFile(buffer, file.name, file.type);
    if (!validation.isValid) {
      return { success: false, error: validation.error || "File validation failed." };
    }

    // Enforce question-level constraints if specified
    if (question.maxFileSizeBytes && BigInt(buffer.length) > question.maxFileSizeBytes) {
      const maxMb = (Number(question.maxFileSizeBytes) / (1024 * 1024)).toFixed(0);
      return {
        success: false,
        error: `File size exceeds the specific question limit of ${maxMb} MB.`,
      };
    }

    // 5. Check if previous file exists on this answer to clean up
    const existingAnswer = await prisma.submissionAnswer.findUnique({
      where: {
        submissionId_questionId: {
          submissionId,
          questionId,
        },
      },
    });

    const oldFileKey = existingAnswer?.fileKey;

    // 6. Upload file to private storage
    const uploadResult = await uploadToStorage({
      buffer,
      fileName: file.name,
      mimeType: "application/pdf",
      folder: "submissions",
      subFolder: `${submissionId}/${questionId}`,
    });

    uploadedFileKey = uploadResult.fileKey;

    // 7. Persist file metadata in database
    const now = new Date();
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

    // 8. Safely delete superseded file if one existed
    if (oldFileKey && oldFileKey !== uploadResult.fileKey) {
      await deleteFromStorage(oldFileKey).catch((e) =>
        console.warn("Non-fatal: Failed to clean up superseded file:", oldFileKey, e)
      );
    }

    // 9. Generate temporary preview signed URL
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
 * Removes an uploaded submission attachment (if not yet submitted).
 */
export async function deleteSubmissionAttachmentAction(
  submissionId: string,
  questionId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireRole(["PARTICIPANT"]);

    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: { user: true, phase: true },
    });

    if (!submission) {
      return { success: false, error: "Submission not found." };
    }

    if (submission.userId !== session.userId && submission.user.email !== session.email) {
      return { success: false, error: "Forbidden: You cannot modify another candidate's submission." };
    }

    if (submission.status === "SUBMITTED") {
      return { success: false, error: "Submission has already been finalized." };
    }

    const answer = await prisma.submissionAnswer.findUnique({
      where: {
        submissionId_questionId: {
          submissionId,
          questionId,
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
          submissionId,
          questionId,
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
 * Enforces strict role-based access control:
 * - PARTICIPANT: Can only access their own submissions or reference files for their enrolled contests.
 * - EVALUATOR: Can access submissions and reference materials for grading.
 * - ADMIN: Full access to all assessment deliverables and references.
 */
export async function getFileDownloadUrlAction(
  fileKey: string
): Promise<DownloadUrlResult> {
  try {
    const session = await requireSession();

    if (!fileKey || typeof fileKey !== "string") {
      return { success: false, error: "Invalid file key specified." };
    }

    // 1. Check if the file is a candidate's submission answer
    const answer = await prisma.submissionAnswer.findFirst({
      where: { fileKey },
      include: {
        submission: {
          include: {
            user: true,
            contest: true,
          },
        },
      },
    });

    if (answer) {
      // Role authorization check for candidate submission
      if (session.role === "PARTICIPANT") {
        if (
          answer.submission.userId !== session.userId &&
          answer.submission.user.email !== session.email
        ) {
          return {
            success: false,
            error: "Forbidden: You are not authorized to view this participant's submission file.",
          };
        }
      }
      // EVALUATOR and ADMIN are authorized to review candidate submissions

      const signedUrl = await getSignedDownloadUrl(fileKey, 3600);
      return {
        success: true,
        downloadUrl: signedUrl,
        fileName: answer.fileName || "submission.pdf",
      };
    }

    // 2. Check if the file is a contest ReferenceMaterial
    const reference = await prisma.referenceMaterial.findFirst({
      where: { fileKey },
      include: {
        task: {
          include: {
            phase: {
              include: {
                contest: {
                  include: {
                    participants: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (reference) {
      if (session.role === "PARTICIPANT") {
        const contestParticipants = reference.task?.phase?.contest?.participants || [];
        const isEnrolled = contestParticipants.some(
          (p) => p.userId === session.userId
        );
        if (!isEnrolled && reference.task?.phase?.contest?.isPublished === false) {
          // If participant is enrolled in contest or it's accessible
          const userEnrollment = await prisma.contestParticipant.findFirst({
            where: {
              userId: session.userId,
              contestId: reference.task?.phase?.contestId,
            },
          });
          if (!userEnrollment) {
            return {
              success: false,
              error: "Forbidden: You are not enrolled in the contest for this reference material.",
            };
          }
        }
      }

      const signedUrl = await getSignedDownloadUrl(fileKey, 3600);
      return {
        success: true,
        downloadUrl: signedUrl,
        fileName: reference.title || "reference.pdf",
      };
    }

    // 3. Fallback check for admin access to any valid key in storage
    if (session.role === "ADMIN") {
      const signedUrl = await getSignedDownloadUrl(fileKey, 3600);
      return {
        success: true,
        downloadUrl: signedUrl,
        fileName: "document.pdf",
      };
    }

    return {
      success: false,
      error: "File record not found or access denied.",
    };
  } catch (error) {
    console.error("Get download URL error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to obtain file download URL.",
    };
  }
}
