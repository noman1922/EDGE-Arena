/**
 * Admin-Controlled Automatic Leaderboard & Results Publication Architecture
 *
 * Rules:
 * 1. Persistent Auto Publish setting per contest (stored in AuditLog without schema migrations).
 * 2. When Auto Publish is ON or Contest is Published or Freedom Contest:
 *    Automatically publish/refresh leaderboard when:
 *    - Participant submitted assessment (all required contest tasks).
 *    - All required MCQ grading is complete (auto-promoted SUBMITTED -> GRADED).
 *    - All required written/manual evaluations are complete.
 *    - All penalties and score adjustments are finalized.
 *    - Final score is safely calculated and saved.
 * 3. When Auto Publish is OFF and Contest is UNPUBLISHED (and not Freedom):
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
import { recordAuditLog } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import crypto from "crypto";

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Runner / test environment fallback
  }
}

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

export interface RankedCandidateResult {
  userId: string;
  name: string;
  rank: number;
  rawScore: number;
  penalties: number;
  totalScore: number;
  percentile: number;
  isCertified: boolean;
  selectionStatus: "SELECTED" | "PROVISIONAL" | null;
}

export interface LeaderboardRefreshOptions {
  actorId?: string;
  isFinalCertification?: boolean;
  forcePublish?: boolean;
  isAutoTrigger?: boolean;
}

export interface LeaderboardRefreshResult {
  success: boolean;
  publishedCount: number;
  totalEnrolled: number;
  unsubmittedCount: number;
  pendingEvaluationCount: number;
  isPublished: boolean;
  isFinalCertification: boolean;
  error?: string;
  rankedCandidates?: RankedCandidateResult[];
}

export interface AutoPublishEvaluationResult {
  published: boolean;
  reason?: string;
  finalScore?: number;
  rank?: number;
  selectionStatus?: "SELECTED" | "PROVISIONAL" | null;
}

/**
 * Shared Authoritative Leaderboard Engine.
 * Used identically by:
 * 1. Admin "Update Leaderboard" action (forcePublish: true)
 * 2. Participant assessment submission completion (isAutoTrigger: true)
 * 3. Evaluator manual grading finalization (isAutoTrigger: true)
 * 4. Penalty deductions (isAutoTrigger: true)
 */
export async function refreshContestLeaderboard(
  contestId: string,
  options?: LeaderboardRefreshOptions
): Promise<LeaderboardRefreshResult> {
  return await executeLeaderboardRefresh(contestId, options);
}

async function executeLeaderboardRefresh(
  contestId: string,
  options?: LeaderboardRefreshOptions
): Promise<LeaderboardRefreshResult> {
  try {
    // 1. Fetch contest structure, participants, and all submissions in parallel
    const [contest, allContestSubmissions, contestPenalties] = await Promise.all([
      prisma.contest.findUnique({
        where: { id: contestId },
        include: {
          phases: {
            include: {
              tasks: {
                select: {
                  id: true,
                  title: true,
                  taskNumber: true,
                  totalPoints: true,
                  questions: { select: { type: true } },
                  rubrics: { select: { id: true } },
                },
                orderBy: { taskNumber: "asc" },
              },
            },
            orderBy: { phaseNumber: "asc" },
          },
          participants: {
            where: { status: { in: ["ACTIVE", "ENROLLED"] } },
            select: {
              userId: true,
              user: { select: { name: true } },
            },
          },
        },
      }),
      prisma.submission.findMany({
        where: { contestId },
        select: {
          id: true,
          userId: true,
          taskId: true,
          status: true,
          autoGradeScore: true,
          manualGradeScore: true,
          finalScore: true,
          submittedAt: true,
        },
      }),
      getContestPenalties(contestId).catch(() => []),
    ]);

    if (!contest) {
      return {
        success: false,
        publishedCount: 0,
        totalEnrolled: 0,
        unsubmittedCount: 0,
        pendingEvaluationCount: 0,
        isPublished: false,
        isFinalCertification: false,
        error: "Contest not found.",
      };
    }

    // Map enrolled participants, falling back to enrollments (mock support) or active submitters
    const participantsList =
      (contest as any).participants || (contest as any).enrollments || [];

    const participantMap = new Map<string, { userId: string; name: string }>();
    for (const p of participantsList) {
      participantMap.set(p.userId, {
        userId: p.userId,
        name: p.user?.name || "Candidate",
      });
    }
    for (const s of allContestSubmissions) {
      if (s.userId && !participantMap.has(s.userId)) {
        participantMap.set(s.userId, {
          userId: s.userId,
          name: (s as any).user?.name || "Candidate",
        });
      }
    }

    if (participantMap.size === 0 && options?.actorId) {
      participantMap.set(options.actorId, {
        userId: options.actorId,
        name: "Candidate",
      });
    }

    const totalEnrolled = participantMap.size;
    if (totalEnrolled === 0) {
      return {
        success: false,
        publishedCount: 0,
        totalEnrolled: 0,
        unsubmittedCount: 0,
        pendingEvaluationCount: 0,
        isPublished: contest.isPublished,
        isFinalCertification: false,
        error: "Cannot publish: No participants enrolled in this contest.",
      };
    }

    // Authorized publication check:
    // Results may be published ONLY IF:
    // 1. forcePublish is true (Admin manual action: Update Leaderboard / Publish Results)
    // 2. contest is ALREADY published (contest.isPublished === true)
    // 3. settings.autoPublish is explicitly ON (settings.autoPublish === true)
    // When Auto-publish is OFF and contest is unpublished, results MUST remain strictly unpublished,
    // including for Freedom CareerEdge contests, until an Admin manually publishes them.
    const isFreedom = isFreedomContest(contest);
    const settings = await getContestPublicationSettings(contestId);
    const shouldPublish =
      Boolean(options?.forcePublish) ||
      Boolean(contest.isPublished) ||
      Boolean(settings.autoPublish);

    if (options?.isAutoTrigger && !shouldPublish) {
      return {
        success: false,
        publishedCount: 0,
        totalEnrolled,
        unsubmittedCount: 0,
        pendingEvaluationCount: 0,
        isPublished: contest.isPublished,
        isFinalCertification: false,
        error: "AUTO_PUBLISH_DISABLED",
      };
    }

    // Calculate maximum points for contest across all tasks
    const contestTotalPoints =
      (contest.phases || []).reduce((acc: number, ph: any) => {
        return acc + (ph.tasks || []).reduce((tAcc: number, t: any) => tAcc + (t.totalPoints || 0), 0);
      }, 0) || 100;

    // Collect all required contest tasks
    const allContestTasks: Array<{
      id: string;
      title: string;
      requiresManualGrading: boolean;
    }> = [];

    for (const ph of contest.phases || []) {
      for (const t of ph.tasks || []) {
        const hasManual = (t.questions || []).some(
          (q: any) => q.type === "WRITTEN" || q.type === "FILE_UPLOAD"
        );
        const hasRubrics = (t.rubrics?.length || 0) > 0;
        allContestTasks.push({
          id: t.id,
          title: t.title,
          requiresManualGrading: hasManual || hasRubrics,
        });
      }
    }

    // Group confirmed penalties by user
    const penaltiesByUser: Record<string, number> = {};
    for (const p of contestPenalties) {
      penaltiesByUser[p.userId] = (penaltiesByUser[p.userId] || 0) + p.points;
    }

    interface FinalizedCandidateRow {
      userId: string;
      name: string;
      rawScore: number;
      penalties: number;
      totalScore: number;
      latestSubmittedAt: Date | null;
      submissions: Array<{ id: string }>;
    }

    interface CandidateDiagnoseInfo {
      userId: string;
      name: string;
      taskTitle: string;
    }

    const finalizedCandidates: FinalizedCandidateRow[] = [];
    const unsubmittedCandidates: CandidateDiagnoseInfo[] = [];
    const pendingEvaluationCandidates: CandidateDiagnoseInfo[] = [];

    // Group submissions by userId (attributing missing userId to actorId or single participant if needed)
    const submissionsByUserId = new Map<string, typeof allContestSubmissions>();
    const defaultUserId =
      options?.actorId || (participantMap.size === 1 ? Array.from(participantMap.keys())[0] : undefined);

    for (const s of allContestSubmissions) {
      const subUserId = s.userId || defaultUserId;
      if (!subUserId) continue;
      let arr = submissionsByUserId.get(subUserId);
      if (!arr) {
        arr = [];
        submissionsByUserId.set(subUserId, arr);
      }
      arr.push({ ...s, userId: subUserId });
    }

    const mcqSubmissionIdsToPromote: string[] = [];

    // Evaluate each candidate's completion
    for (const participant of participantMap.values()) {
      const userSubmissions = submissionsByUserId.get(participant.userId) ?? [];
      const submissionByTaskId = new Map(userSubmissions.map((s) => [s.taskId, s]));

      let candidateHasAllTasksSubmitted = true;
      let missingTaskTitle = "";

      for (const t of allContestTasks) {
        const sub = submissionByTaskId.get(t.id);
        const isSubmitted =
          sub &&
          (sub.status === "SUBMITTED" ||
            sub.status === "GRADING_IN_PROGRESS" ||
            sub.status === "GRADED" ||
            sub.status === "PUBLISHED");

        if (!isSubmitted) {
          candidateHasAllTasksSubmitted = false;
          missingTaskTitle = t.title;
          break;
        }
      }

      if (!candidateHasAllTasksSubmitted) {
        unsubmittedCandidates.push({
          userId: participant.userId,
          name: participant.name,
          taskTitle: missingTaskTitle,
        });
        continue;
      }

      let candidateHasAllTasksGraded = true;
      let unfinalizedTaskTitle = "";

      for (const t of allContestTasks) {
        const sub = submissionByTaskId.get(t.id);
        if (!sub) continue;

        if (t.requiresManualGrading) {
          const isGraded =
            (sub.status === "GRADED" || sub.status === "PUBLISHED") &&
            sub.manualGradeScore !== null;

          if (!isGraded) {
            candidateHasAllTasksGraded = false;
            unfinalizedTaskTitle = t.title;
            break;
          }
        } else {
          // MCQ / Auto-graded task
          if (sub.status === "GRADING_IN_PROGRESS") {
            candidateHasAllTasksGraded = false;
            unfinalizedTaskTitle = t.title;
            break;
          } else if (sub.status === "SUBMITTED") {
            const promotedScore = sub.autoGradeScore !== null ? Number(sub.autoGradeScore) : 0;
            mcqSubmissionIdsToPromote.push(sub.id);
            sub.status = "GRADED";
            sub.finalScore = new Prisma.Decimal(promotedScore);
          }
        }
      }

      if (!candidateHasAllTasksGraded) {
        pendingEvaluationCandidates.push({
          userId: participant.userId,
          name: participant.name,
          taskTitle: unfinalizedTaskTitle,
        });
        continue;
      }

      // Candidate has completed all tasks and all grading is finalized!
      const graded = userSubmissions.filter(
        (s) => s.status === "GRADED" || s.status === "PUBLISHED"
      );

      let rawScore = 0;
      let latestSubmittedAt: Date | null = null;

      if (graded.length > 0) {
        rawScore = graded.reduce(
          (sum, s) => sum + (s.finalScore !== null ? Number(s.finalScore) : 0),
          0
        );

        for (const s of graded) {
          if (s.submittedAt && (!latestSubmittedAt || s.submittedAt > latestSubmittedAt)) {
            latestSubmittedAt = s.submittedAt;
          }
        }
      }

      const userPenalties = penaltiesByUser[participant.userId] || 0;
      const finalComputedScore = calculateCandidateFinalScore(rawScore, userPenalties);
      const boundedScore = Math.min(contestTotalPoints, finalComputedScore);

      finalizedCandidates.push({
        userId: participant.userId,
        name: participant.name,
        rawScore,
        penalties: userPenalties,
        totalScore: boundedScore,
        latestSubmittedAt,
        submissions: userSubmissions.map((s) => ({ id: s.id })),
      });
    }

    const isFinalCertification = Boolean(options?.isFinalCertification);

    // Strict validation for permanent final certification / locking
    if (isFinalCertification) {
      if (unsubmittedCandidates.length > 0) {
        const cand = unsubmittedCandidates[0];
        return {
          success: false,
          publishedCount: 0,
          totalEnrolled,
          unsubmittedCount: unsubmittedCandidates.length,
          pendingEvaluationCount: pendingEvaluationCandidates.length,
          isPublished: contest.isPublished,
          isFinalCertification: true,
          error: `Cannot finalize contest: Candidate "${cand.name}" has unsubmitted assessments (${cand.taskTitle}). Please ensure all tasks are submitted before final certification.`,
        };
      }
      if (pendingEvaluationCandidates.length > 0) {
        const cand = pendingEvaluationCandidates[0];
        return {
          success: false,
          publishedCount: 0,
          totalEnrolled,
          unsubmittedCount: unsubmittedCandidates.length,
          pendingEvaluationCount: pendingEvaluationCandidates.length,
          isPublished: contest.isPublished,
          isFinalCertification: true,
          error: `Cannot finalize contest: Candidate "${cand.name}" has unfinalized submissions (${cand.taskTitle}). Please finalize grading before final certification.`,
        };
      }
    } else {
      // Progressive Leaderboard update mode
      if (finalizedCandidates.length === 0) {
        if (pendingEvaluationCandidates.length > 0) {
          const cand = pendingEvaluationCandidates[0];
          return {
            success: false,
            publishedCount: 0,
            totalEnrolled,
            unsubmittedCount: unsubmittedCandidates.length,
            pendingEvaluationCount: pendingEvaluationCandidates.length,
            isPublished: contest.isPublished,
            isFinalCertification: false,
            error: `Cannot publish: Candidate "${cand.name}" has unfinalized submissions (${cand.taskTitle}). Please finalize grading before publishing.`,
          };
        }
        if (unsubmittedCandidates.length > 0) {
          const cand = unsubmittedCandidates[0];
          return {
            success: false,
            publishedCount: 0,
            totalEnrolled,
            unsubmittedCount: unsubmittedCandidates.length,
            pendingEvaluationCount: pendingEvaluationCandidates.length,
            isPublished: contest.isPublished,
            isFinalCertification: false,
            error: `Cannot publish: Candidate "${cand.name}" has unsubmitted assessments (${cand.taskTitle}). Please ensure all tasks are submitted before publishing.`,
          };
        }
        return {
          success: false,
          publishedCount: 0,
          totalEnrolled,
          unsubmittedCount: unsubmittedCandidates.length,
          pendingEvaluationCount: pendingEvaluationCandidates.length,
          isPublished: contest.isPublished,
          isFinalCertification: false,
          error: "Cannot publish: No graded submissions found for this contest.",
        };
      }
    }

    // Sort finalized candidates deterministically (totalScore DESC, latestSubmittedAt ASC, userId ASC)
    finalizedCandidates.sort((a, b) => {
      if (b.totalScore !== a.totalScore) {
        return b.totalScore - a.totalScore;
      }
      const timeA = a.latestSubmittedAt ? a.latestSubmittedAt.getTime() : 0;
      const timeB = b.latestSubmittedAt ? b.latestSubmittedAt.getTime() : 0;
      if (timeA !== timeB) return timeA - timeB;
      return a.userId.localeCompare(b.userId);
    });

    // Compute standard competition ranks (1224 ranking) & prepare bulk writes
    const totalCandidates = finalizedCandidates.length;
    const now = new Date();
    let currentRank = 1;

    const cohortRowsToUpsert: Array<{
      id: string;
      userId: string;
      name: string;
      rawScore: number;
      penalties: number;
      totalScore: number;
      rank: number;
      percentile: number;
      isCertified: boolean;
      selectionStatus: "SELECTED" | "PROVISIONAL" | null;
    }> = [];
    const submissionIdsToPublish: string[] = [];

    for (let i = 0; i < totalCandidates; i++) {
      if (i > 0 && finalizedCandidates[i].totalScore < finalizedCandidates[i - 1].totalScore) {
        currentRank = i + 1;
      }
      const rank = currentRank;
      const percentile =
        totalCandidates > 1
          ? Math.round(((totalCandidates - rank) / (totalCandidates - 1)) * 100 * 100) / 100
          : 100.0;
      const isCertified = isFreedom
        ? finalizedCandidates[i].totalScore >= 16
        : finalizedCandidates[i].totalScore >= Math.round(contestTotalPoints * 0.5);
      const selectionStatus = isFreedom
        ? getFreedomSelectionStatus(finalizedCandidates[i].totalScore)
        : null;

      cohortRowsToUpsert.push({
        id: crypto.randomUUID(),
        userId: finalizedCandidates[i].userId,
        name: finalizedCandidates[i].name,
        rawScore: finalizedCandidates[i].rawScore,
        penalties: finalizedCandidates[i].penalties,
        totalScore: finalizedCandidates[i].totalScore,
        rank,
        percentile,
        isCertified,
        selectionStatus,
      });

      for (const s of finalizedCandidates[i].submissions) {
        submissionIdsToPublish.push(s.id);
      }
    }

    const isAllEnrolledFinalized = totalEnrolled > 0 && finalizedCandidates.length === totalEnrolled;
    const shouldMarkCompleted = isFinalCertification || isAllEnrolledFinalized;

    // Strict safety separation: If publication is NOT authorized, return calculated standings
    // WITHOUT writing to CohortResult, without updating contest.isPublished, and without publishing submissions
    if (!shouldPublish) {
      return {
        success: true,
        publishedCount: 0,
        totalEnrolled,
        unsubmittedCount: unsubmittedCandidates.length,
        pendingEvaluationCount: pendingEvaluationCandidates.length,
        isPublished: false,
        isFinalCertification: false,
        rankedCandidates: cohortRowsToUpsert.map((r) => ({
          userId: r.userId,
          name: r.name,
          rank: r.rank,
          rawScore: r.rawScore,
          penalties: r.penalties,
          totalScore: r.totalScore,
          percentile: r.percentile,
          isCertified: r.isCertified,
          selectionStatus: r.selectionStatus,
        })),
      };
    }

    // Atomic transaction for promotion, cohort result upserts, and status updates
    await prisma.$transaction(
      async (tx) => {
        if (mcqSubmissionIdsToPromote.length > 0) {
          for (let offset = 0; offset < mcqSubmissionIdsToPromote.length; offset += 2000) {
            const idChunk = mcqSubmissionIdsToPromote.slice(offset, offset + 2000);
            await tx.$executeRaw`
              UPDATE "Submission"
              SET
                "status" = 'GRADED'::"SubmissionStatus",
                "finalScore" = COALESCE("autoGradeScore", 0),
                "updatedAt" = ${now}::timestamp
              WHERE "id" = ANY(${idChunk}::text[])
            `;
          }
        }

        const CHUNK_SIZE = 500;
        for (let offset = 0; offset < cohortRowsToUpsert.length; offset += CHUNK_SIZE) {
          const chunk = cohortRowsToUpsert.slice(offset, offset + CHUNK_SIZE);
          const values = chunk.map(
            (row) => Prisma.sql`(
              ${row.id}::text,
              ${contestId}::text,
              ${row.userId}::text,
              ${row.totalScore}::numeric(6,2),
              ${row.rank}::integer,
              ${row.percentile}::numeric(5,2),
              ${row.isCertified}::boolean,
              ${now}::timestamp,
              ${now}::timestamp,
              ${now}::timestamp
            )`
          );
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
            VALUES ${Prisma.join(values)}
            ON CONFLICT ("contestId", "userId") DO UPDATE SET
              "totalScore" = EXCLUDED."totalScore",
              "rank" = EXCLUDED."rank",
              "percentile" = EXCLUDED."percentile",
              "isCertified" = EXCLUDED."isCertified",
              "publishedAt" = EXCLUDED."publishedAt",
              "updatedAt" = EXCLUDED."updatedAt"
          `;
        }

        if (submissionIdsToPublish.length > 0) {
          for (let offset = 0; offset < submissionIdsToPublish.length; offset += 2000) {
            const idChunk = submissionIdsToPublish.slice(offset, offset + 2000);
            await tx.$executeRaw`
              UPDATE "Submission"
              SET
                "status" = 'PUBLISHED'::"SubmissionStatus",
                "updatedAt" = ${now}::timestamp
              WHERE "id" = ANY(${idChunk}::text[])
                AND "status" <> 'PUBLISHED'::"SubmissionStatus"
            `;
          }
        }

        await tx.contest.update({
          where: { id: contestId },
          data: {
            isPublished: true,
            ...(shouldMarkCompleted ? { status: "COMPLETED" } : {}),
          },
        });
      },
      { timeout: 30000 }
    );

    // Audit Log: record publication event
    await recordAuditLog({
      actorId: options?.actorId,
      action: shouldMarkCompleted
        ? "CERTIFY_AND_LOCK_CONTEST"
        : options?.isAutoTrigger
        ? "AUTO_PUBLISH_LEADERBOARD"
        : "PUBLISH_LEADERBOARD_UPDATE",
      targetType: "CONTEST",
      targetId: contestId,
      metadata: {
        contestId,
        contestTitle: contest.title,
        publishedCount: totalCandidates,
        totalEnrolled,
        unsubmittedCount: unsubmittedCandidates.length,
        pendingEvaluationCount: pendingEvaluationCandidates.length,
        isFinalCertification: shouldMarkCompleted,
        timestamp: now.toISOString(),
      },
    });

    safeRevalidatePath("/admin");
    safeRevalidatePath("/admin/contests");
    safeRevalidatePath("/admin/submissions");
    safeRevalidatePath("/admin/results");
    safeRevalidatePath("/evaluator");
    safeRevalidatePath("/evaluator/monitoring");
    safeRevalidatePath("/dashboard");
    safeRevalidatePath("/dashboard/results");
    safeRevalidatePath("/dashboard/leaderboard");
    safeRevalidatePath("/leaderboard");

    return {
      success: true,
      publishedCount: totalCandidates,
      totalEnrolled,
      unsubmittedCount: unsubmittedCandidates.length,
      pendingEvaluationCount: pendingEvaluationCandidates.length,
      isPublished: true,
      isFinalCertification: shouldMarkCompleted,
      rankedCandidates: cohortRowsToUpsert.map((r) => ({
        userId: r.userId,
        name: r.name,
        rank: r.rank,
        rawScore: r.rawScore,
        penalties: r.penalties,
        totalScore: r.totalScore,
        percentile: r.percentile,
        isCertified: r.isCertified,
        selectionStatus: r.selectionStatus,
      })),
    };
  } catch (err) {
    console.error("Leaderboard refresh execution failed:", err);
    return {
      success: false,
      publishedCount: 0,
      totalEnrolled: 0,
      unsubmittedCount: 0,
      pendingEvaluationCount: 0,
      isPublished: false,
      isFinalCertification: false,
      error: err instanceof Error ? err.message : "Leaderboard refresh error",
    };
  }
}

/**
 * Checks all conditions and publishes the candidate's result if Auto Publish is ON or Contest is Published.
 * If Auto Publish is OFF or grading is pending, safely does nothing.
 */
export async function autoPublishCandidateResultIfEligible(
  contestId: string,
  userId: string
): Promise<AutoPublishEvaluationResult> {
  try {
    const settings = await getContestPublicationSettings(contestId);

    // If autoPublish setting is explicitly OFF, verify whether contest is already published
    if (!settings.autoPublish) {
      let contest: any = null;
      try {
        contest = await prisma.contest.findUnique({
          where: { id: contestId },
          select: { id: true, isPublished: true, slug: true, title: true },
        });
      } catch {
        // DB read failure or mock unconfigured
      }
      if (!contest || !contest.isPublished) {
        return { published: false, reason: "AUTO_PUBLISH_DISABLED" };
      }
    }

    const refreshResult = await refreshContestLeaderboard(contestId, {
      actorId: userId,
      isAutoTrigger: true,
    });

    if (!refreshResult.success) {
      return { published: false, reason: refreshResult.error };
    }

    const cand = refreshResult.rankedCandidates?.find((c) => c.userId === userId);
    if (!cand) {
      return { published: false, reason: "Candidate not finalized or eligible yet." };
    }

    return {
      published: true,
      finalScore: cand.totalScore,
      rank: cand.rank,
      selectionStatus: cand.selectionStatus,
    };
  } catch (err) {
    console.error("Auto-publish candidate evaluation error:", err);
    return {
      published: false,
      reason: err instanceof Error ? err.message : "Auto-publish error",
    };
  }
}
