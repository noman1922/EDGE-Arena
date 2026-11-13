import type { SessionPayload } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateStorageKey } from "@/lib/storage";

export type FileAccessResult =
  | {
      authorized: true;
      fileKey: string;
      fileName: string;
      sourceType: "submission_answer" | "reference_material";
    }
  | {
      authorized: false;
      status: 400 | 401 | 403 | 404;
      error: string;
    };

/**
 * Authorizes file download/URL requests using strict path validation,
 * active DB user verification, and explicit DB ownership/enrollment checks.
 *
 * Security policy:
 * - No arbitrary unverified storage keys are permitted (even for ADMIN)
 *   without an explicit database record in SubmissionAnswer or ReferenceMaterial.
 * - ReferenceMaterial rows with taskId = null are never treated as public.
 * - Contest publication state never bypasses participant enrollment checks.
 */
export async function authorizeFileAccess(
  session: SessionPayload | null,
  rawFileKey: string
): Promise<FileAccessResult> {
  if (!session) {
    return {
      authorized: false,
      status: 401,
      error: "Unauthorized: Active authentication session required.",
    };
  }

  if (session.mustChangePassword) {
    return {
      authorized: false,
      status: 403,
      error: "Forbidden: File access denied.",
    };
  }

  const keyCheck = validateStorageKey(rawFileKey);
  if (!keyCheck.isValid || !keyCheck.normalizedKey) {
    return {
      authorized: false,
      status: 400,
      error: "Invalid file key specified.",
    };
  }

  const fileKey = keyCheck.normalizedKey;

  const actingUser = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      role: true,
      isActive: true,
    },
  });

  if (!actingUser || !actingUser.isActive || actingUser.role !== session.role) {
    return {
      authorized: false,
      status: 403,
      error: "Forbidden: File access denied.",
    };
  }

  // 1. Check candidate submission attachments
  const answer = await prisma.submissionAnswer.findFirst({
    where: { fileKey },
    select: {
      id: true,
      fileName: true,
      submission: {
        select: {
          id: true,
          userId: true,
          contestId: true,
        },
      },
    },
  });

  if (answer) {
    if (actingUser.role === "PARTICIPANT") {
      if (answer.submission.userId !== actingUser.id) {
        return {
          authorized: false,
          status: 403,
          error: "Forbidden: File access denied.",
        };
      }

      const enrollment = await prisma.contestParticipant.findUnique({
        where: {
          contestId_userId: {
            contestId: answer.submission.contestId,
            userId: actingUser.id,
          },
        },
        select: { status: true },
      });

      if (
        !enrollment ||
        (enrollment.status !== "ENROLLED" && enrollment.status !== "ACTIVE")
      ) {
        return {
          authorized: false,
          status: 403,
          error: "Forbidden: File access denied.",
        };
      }
    } else if (actingUser.role === "EVALUATOR") {
      const [contestEval, candidateAssignment] = await Promise.all([
        prisma.contestEvaluator.findUnique({
          where: {
            contestId_userId: {
              contestId: answer.submission.contestId,
              userId: actingUser.id,
            },
          },
          select: { id: true },
        }),
        prisma.evaluatorCandidateAssignment.findFirst({
          where: {
            contestId: answer.submission.contestId,
            evaluatorId: actingUser.id,
            participantId: answer.submission.userId,
          },
          select: { id: true },
        }),
      ]);

      if (!contestEval || !candidateAssignment) {
        return {
          authorized: false,
          status: 403,
          error: "Forbidden: File access denied.",
        };
      }
    } else if (actingUser.role !== "ADMIN") {
      return {
        authorized: false,
        status: 403,
        error: "Forbidden: File access denied.",
      };
    }

    return {
      authorized: true,
      fileKey,
      fileName: answer.fileName || "submission.pdf",
      sourceType: "submission_answer",
    };
  }

  // 2. Check contest task reference materials (minimal projection, no participant list fetch)
  const reference = await prisma.referenceMaterial.findFirst({
    where: { fileKey },
    select: {
      id: true,
      title: true,
      taskId: true,
      task: {
        select: {
          id: true,
          phase: {
            select: {
              contestId: true,
            },
          },
        },
      },
    },
  });

  if (reference) {
    if (actingUser.role === "ADMIN") {
      return {
        authorized: true,
        fileKey,
        fileName: reference.title || "reference.pdf",
        sourceType: "reference_material",
      };
    }

    // ReferenceMaterial with taskId = null (or unattached contest hierarchy)
    // is never public and cannot authorize PARTICIPANT or EVALUATOR access.
    const contestId = reference.taskId ? reference.task?.phase?.contestId : null;
    if (!contestId) {
      return {
        authorized: false,
        status: 403,
        error: "Forbidden: File access denied.",
      };
    }

    if (actingUser.role === "PARTICIPANT") {
      const enrollment = await prisma.contestParticipant.findUnique({
        where: {
          contestId_userId: {
            contestId,
            userId: actingUser.id,
          },
        },
        select: { status: true },
      });

      if (
        !enrollment ||
        (enrollment.status !== "ENROLLED" && enrollment.status !== "ACTIVE")
      ) {
        return {
          authorized: false,
          status: 403,
          error: "Forbidden: File access denied.",
        };
      }
    } else if (actingUser.role === "EVALUATOR") {
      const contestEval = await prisma.contestEvaluator.findUnique({
        where: {
          contestId_userId: {
            contestId,
            userId: actingUser.id,
          },
        },
        select: { id: true },
      });

      if (!contestEval) {
        return {
          authorized: false,
          status: 403,
          error: "Forbidden: File access denied.",
        };
      }
    } else {
      return {
        authorized: false,
        status: 403,
        error: "Forbidden: File access denied.",
      };
    }

    return {
      authorized: true,
      fileKey,
      fileName: reference.title || "reference.pdf",
      sourceType: "reference_material",
    };
  }

  // 3. Reject any key without an explicit database record (including ADMIN)
  return {
    authorized: false,
    status: 404,
    error: "File record not found or access denied.",
  };
}

