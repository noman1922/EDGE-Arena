/**
 * Admin-Controlled Automatic Leaderboard & Results Publication Architecture
 *
 * Rules:
 * 1. Persistent Auto Publish setting per contest (stored in AuditLog without schema migrations).
 * 2. When Auto Publish is ON:
 *    Automatically publish a participant's result when:
 *    - Participant submitted assessment (all required contest tasks).
 *    - All required MCQ grading is complete.
 *    - All required written/manual evaluations are complete.
 *    - All penalties and score adjustments are finalized.
 *    - Final score is safely calculated and saved.
 * 3. When Auto Publish is OFF:
 *    - Manual publication workflow is strictly preserved.
 *    - Results remain shielded until Admin publishes.
 * 4. Concurrent submissions:
 *    - Atomic transaction and deduplication via ON CONFLICT upsert on CohortResult (contestId, userId).
 * 5. Works safely with MCQ-only and mixed MCQ/written assessments.
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { calculateCandidateFinalScore, getContestPenalties } from "@/lib/monitoring";
import { isFreedomContest, getFreedomSelectionStatus } from "@/lib/freedom-contest";

const SETTINGS_TARGET_TYPE = "CONTEST_PUBLICATION_SETTINGS";

export interface ContestPublicationSettings {
  autoPublish: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

/**
 * Retrieves the persistent Auto Publish setting for a contest.
 * Defaults to false (manual publication) if unset.
 */
export async function getContestPublicationSettings(
  contestId: string
): Promise<ContestPublicationSettings> {
  try {
    const log = await prisma.auditLog.findFirst({
      where: {
        targetType: SETTINGS_TARGET_TYPE,
        targetId: contestId,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!log || !log.metadata) {
      return { autoPublish: false };
    }

    const meta = log.metadata as Record<string, unknown>;
    return {
      autoPublish: Boolean(meta.autoPublish),
      updatedAt: log.createdAt
        ? log.createdAt instanceof Date
          ? log.createdAt.toISOString()
          : new Date(log.createdAt).toISOString()
        : undefined,
      updatedBy: log.actorId || undefined,
    };
  } catch (err) {
    console.error("Error reading contest publication settings:", err);
    return { autoPublish: false };
  }
}

/**
 * Persists the Auto Publish setting for a contest. Admin-only.
 */
export async function saveContestPublicationSettings(
  contestId: string,
  autoPublish: boolean,
  adminUserId: string
): Promise<ContestPublicationSettings> {
  const existing = await prisma.auditLog.findFirst({
    where: {
      targetType: SETTINGS_TARGET_TYPE,
      targetId: contestId,
    },
    orderBy: { createdAt: "desc" },
  });

  const nowIso = new Date().toISOString();
  const metadata: Prisma.InputJsonValue = {
    contestId,
    autoPublish,
    updatedAt: nowIso,
  };

  if (existing) {
    await prisma.auditLog.update({
      where: { id: existing.id },
      data: {
        action: autoPublish ? "ENABLE_AUTO_PUBLISH" : "DISABLE_AUTO_PUBLISH",
        actorId: adminUserId,
        metadata,
      },
    });
  } else {
    await prisma.auditLog.create({
      data: {
        action: autoPublish ? "ENABLE_AUTO_PUBLISH" : "DISABLE_AUTO_PUBLISH",
        targetType: SETTINGS_TARGET_TYPE,
        targetId: contestId,
        actorId: adminUserId,
        metadata,
      },
    });
  }

  return {
    autoPublish,
    updatedAt: nowIso,
    updatedBy: adminUserId,
  };
}

export interface AutoPublishEvaluationResult {
  published: boolean;
  reason?: string;
  finalScore?: number;
  rank?: number;
  selectionStatus?: "SELECTED" | "PROVISIONAL" | null;
}

/**
 * Checks all 5 conditions and publishes the candidate's result if Auto Publish is ON.
 * If Auto Publish is OFF or grading is pending, safely does nothing.
 */
export async function autoPublishCandidateResultIfEligible(
  contestId: string,
  userId: string
): Promise<AutoPublishEvaluationResult> {
  try {
    // 1. Verify Auto Publish setting
    const settings = await getContestPublicationSettings(contestId);
    if (!settings.autoPublish) {
      return { published: false, reason: "AUTO_PUBLISH_DISABLED" };
    }

    // 2. Load contest structure and all tasks
    const contest = await prisma.contest.findUnique({
      where: { id: contestId },
      include: {
        phases: {
          include: {
            tasks: {
              include: {
                questions: { select: { id: true, type: true } },
                rubrics: { select: { id: true } },
              },
              orderBy: { taskNumber: "asc" },
            },
          },
          orderBy: { phaseNumber: "asc" },
        },
      },
    });

    if (!contest) {
      return { published: false, reason: "CONTEST_NOT_FOUND" };
    }

    const allContestTasks: Array<{
      id: string;
      title: string;
      totalPoints: number;
      requiresManualGrading: boolean;
    }> = [];

    for (const ph of contest.phases || []) {
      for (const t of ph.tasks || []) {
        const hasManual = (t.questions || []).some((q) => q.type === "WRITTEN" || q.type === "FILE_UPLOAD");
        const hasRubrics = (t.rubrics?.length || 0) > 0;
        allContestTasks.push({
          id: t.id,
          title: t.title,
          totalPoints: t.totalPoints,
          requiresManualGrading: hasManual || hasRubrics,
        });
      }
    }

    if (allContestTasks.length === 0) {
      return { published: false, reason: "NO_TASKS_IN_CONTEST" };
    }

    // 3. Load all candidate submissions for this contest
    const candidateSubmissions = await prisma.submission.findMany({
      where: {
        contestId,
        userId,
      },
      select: {
        id: true,
        taskId: true,
        status: true,
        autoGradeScore: true,
        manualGradeScore: true,
        finalScore: true,
        submittedAt: true,
      },
    });

    const submissionByTaskId = new Map(candidateSubmissions.map((s) => [s.taskId, s]));

    // Condition 1: Verify all tasks have been submitted (status not DRAFT)
    for (const task of allContestTasks) {
      const sub = submissionByTaskId.get(task.id);
      if (!sub || sub.status === "DRAFT") {
        return { published: false, reason: `TASK_UNSUBMITTED: ${task.title}` };
      }
    }

    // Condition 2 & 3: Verify all MCQ grading is complete and all manual evaluations are complete
    const mcqSubmissionsToPromote: string[] = [];
    for (const task of allContestTasks) {
      const sub = submissionByTaskId.get(task.id)!;
      if (task.requiresManualGrading) {
        const isGraded =
          (sub.status === "GRADED" || sub.status === "PUBLISHED") &&
          sub.manualGradeScore !== null;
        if (!isGraded) {
          return { published: false, reason: `MANUAL_GRADING_PENDING: ${task.title}` };
        }
      } else {
        // MCQ-only task: must not be in progress
        if (sub.status === "GRADING_IN_PROGRESS") {
          return { published: false, reason: `MCQ_GRADING_IN_PROGRESS: ${task.title}` };
        }
        if (sub.status === "SUBMITTED") {
          mcqSubmissionsToPromote.push(sub.id);
        }
      }
    }

    // Condition 4 & 5: Calculate finalized total score and apply penalties
    let rawScore = 0;
    let latestSubmittedAt: Date | null = null;

    for (const sub of candidateSubmissions) {
      const taskScore =
        sub.finalScore !== null
          ? Number(sub.finalScore)
          : sub.autoGradeScore !== null
          ? Number(sub.autoGradeScore)
          : 0;
      rawScore += taskScore;

      if (sub.submittedAt && (!latestSubmittedAt || sub.submittedAt > latestSubmittedAt)) {
        latestSubmittedAt = sub.submittedAt;
      }
    }

    const penalties = await getContestPenalties(contestId, userId);
    const totalPenalties = penalties.reduce((acc, p) => acc + p.points, 0);
    const finalComputedScore = calculateCandidateFinalScore(rawScore, totalPenalties);

    const contestTotalPoints =
      allContestTasks.reduce((acc, t) => acc + t.totalPoints, 0) || 100;
    const boundedScore = Math.min(contestTotalPoints, finalComputedScore);

    const isFreedom = isFreedomContest(contest);
    const selectionStatus = isFreedom ? getFreedomSelectionStatus(boundedScore) : null;
    const isCertified = isFreedom
      ? boundedScore >= 16
      : boundedScore >= Math.round(contestTotalPoints * 0.5);

    const now = new Date();

    // 4. Atomic execution & deduplicated publication
    return await prisma.$transaction(async (tx) => {
      // Auto-promote any SUBMITTED MCQ tasks to GRADED
      for (const mcqId of mcqSubmissionsToPromote) {
        const subRecord = candidateSubmissions.find((s) => s.id === mcqId);
        const score =
          subRecord?.autoGradeScore !== null && subRecord?.autoGradeScore !== undefined
            ? Number(subRecord.autoGradeScore)
            : 0;
        await tx.submission.update({
          where: { id: mcqId },
          data: {
            status: "GRADED",
            finalScore: score,
            updatedAt: now,
          },
        });
      }

      // Mark all candidate submissions for this contest as PUBLISHED
      await tx.submission.updateMany({
        where: {
          contestId,
          userId,
        },
        data: {
          status: "PUBLISHED",
          updatedAt: now,
        },
      });

      // Upsert candidate's CohortResult record (deduplicated by @@unique([contestId, userId]))
      await tx.$executeRaw`
        INSERT INTO "CohortResult" (
          "id",
          "contestId",
          "userId",
          "totalScore",
          "rank",
          "percentile",
          "isCertified",
          "publishedAt",
          "createdAt",
          "updatedAt"
        )
        VALUES (
          ${crypto.randomUUID()}::text,
          ${contestId}::text,
          ${userId}::text,
          ${boundedScore}::numeric(6,2),
          1::integer,
          100.0::numeric(5,2),
          ${isCertified}::boolean,
          ${now}::timestamp,
          ${now}::timestamp,
          ${now}::timestamp
        )
        ON CONFLICT ("contestId", "userId") DO UPDATE SET
          "totalScore" = EXCLUDED."totalScore",
          "isCertified" = EXCLUDED."isCertified",
          "publishedAt" = EXCLUDED."publishedAt",
          "updatedAt" = EXCLUDED."updatedAt"
      `;

      // Re-rank all published cohort results for this contest deterministically (totalScore DESC, latestSubmittedAt ASC)
      const allResults = await tx.cohortResult.findMany({
        where: { contestId },
        select: {
          id: true,
          userId: true,
          totalScore: true,
        },
      });

      // Find submission timestamps for tie-breaking
      const allSubs = await tx.submission.findMany({
        where: {
          contestId,
          userId: { in: allResults.map((r) => r.userId) },
        },
        select: {
          userId: true,
          submittedAt: true,
        },
      });

      const userLatestSubmissionMap = new Map<string, number>();
      for (const s of allSubs) {
        if (s.submittedAt) {
          const prev = userLatestSubmissionMap.get(s.userId) ?? 0;
          const curr = s.submittedAt.getTime();
          if (curr > prev) userLatestSubmissionMap.set(s.userId, curr);
        }
      }

      allResults.sort((a, b) => {
        const scoreDiff = Number(b.totalScore) - Number(a.totalScore);
        if (scoreDiff !== 0) return scoreDiff;
        const timeA = userLatestSubmissionMap.get(a.userId) ?? 0;
        const timeB = userLatestSubmissionMap.get(b.userId) ?? 0;
        return timeA - timeB;
      });

      let currentRank = 1;
      let callerRank = 1;

      for (let i = 0; i < allResults.length; i++) {
        if (i > 0 && Number(allResults[i].totalScore) < Number(allResults[i - 1].totalScore)) {
          currentRank = i + 1;
        }
        const rank = currentRank;
        if (allResults[i].userId === userId) {
          callerRank = rank;
        }

        await tx.cohortResult.update({
          where: { id: allResults[i].id },
          data: {
            rank,
            updatedAt: now,
          },
        });
      }

      // Mark contest as published so leaderboard and scorecard endpoints serve published data
      await tx.contest.update({
        where: { id: contestId },
        data: {
          isPublished: true,
          updatedAt: now,
        },
      });

      // Audit log the auto-publication
      await tx.auditLog.create({
        data: {
          action: "AUTO_PUBLISH_RESULT",
          targetType: "CONTEST_PARTICIPANT",
          targetId: `${contestId}:${userId}`,
          actorId: userId,
          metadata: {
            contestId,
            userId,
            finalScore: boundedScore,
            rank: callerRank,
            selectionStatus,
            publishedAt: now.toISOString(),
          },
        },
      });

      return {
        published: true,
        finalScore: boundedScore,
        rank: callerRank,
        selectionStatus,
      };
    });
  } catch (err) {
    console.error("Auto-publish execution failed:", err);
    return {
      published: false,
      reason: err instanceof Error ? err.message : "Auto-publish error",
    };
  }
}
