"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import { revalidatePath } from "next/cache";

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch {}
}

export interface ContestEvaluatorItem {
  id: string;
  evaluatorId: string;
  name: string;
  email: string;
  institution?: string | null;
  assignedCandidateCount: number;
  assignedAt: string;
}

export interface CandidateAllocationItem {
  participantId: string;
  name: string;
  email: string;
  candidateId: string;
  institution: string;
  enrolledAt: string;
  assignedEvaluatorId: string | null;
  assignedEvaluatorName: string | null;
  assignedEvaluatorEmail: string | null;
}

export interface ContestAllocationOverview {
  contestId: string;
  contestTitle: string;
  totalEnrolledCandidates: number;
  allocatedCandidatesCount: number;
  unallocatedCandidatesCount: number;
  evaluators: ContestEvaluatorItem[];
  candidates: CandidateAllocationItem[];
  availableEvaluators: Array<{
    id: string;
    name: string;
    email: string;
    institution?: string | null;
  }>;
}

/**
 * Retrieves all assigned evaluators and available evaluators for a contest.
 */
export async function getContestEvaluatorsAction(
  contestId: string
): Promise<{
  assigned: ContestEvaluatorItem[];
  available: Array<{ id: string; name: string; email: string; institution?: string | null }>;
}> {
  await requireRole(["ADMIN"]);

  const [contestEvaluators, allEvaluators] = await Promise.all([
    prisma.contestEvaluator.findMany({
      where: { contestId },
      include: {
        user: {
          select: { id: true, name: true, email: true, institution: true },
        },
        candidateAssignments: {
          select: { id: true },
        },
      },
      orderBy: { assignedAt: "asc" },
    }),
    prisma.user.findMany({
      where: { role: "EVALUATOR", isActive: true },
      select: { id: true, name: true, email: true, institution: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const assignedEvaluatorUserIds = new Set(contestEvaluators.map((ce) => ce.userId));

  const assigned: ContestEvaluatorItem[] = contestEvaluators.map((ce) => ({
    id: ce.id,
    evaluatorId: ce.userId,
    name: ce.user.name,
    email: ce.user.email,
    institution: ce.user.institution,
    assignedCandidateCount: ce.candidateAssignments.length,
    assignedAt: ce.assignedAt.toISOString(),
  }));

  const available = allEvaluators.filter((e) => !assignedEvaluatorUserIds.has(e.id));

  return { assigned, available };
}

/**
 * Assigns an evaluator to a contest.
 */
export async function assignEvaluatorToContestAction(
  contestId: string,
  evaluatorId: string
): Promise<{ success: boolean; error?: string; item?: ContestEvaluatorItem }> {
  try {
    const session = await requireRole(["ADMIN"]);

    // Verify contest exists
    const contest = await prisma.contest.findUnique({
      where: { id: contestId },
      select: { id: true, title: true },
    });
    if (!contest) {
      return { success: false, error: "Contest not found." };
    }

    // Verify user is an active evaluator
    const evaluator = await prisma.user.findUnique({
      where: { id: evaluatorId },
      select: { id: true, name: true, email: true, role: true, institution: true },
    });
    if (!evaluator || evaluator.role !== "EVALUATOR") {
      return { success: false, error: "User is not an active evaluator." };
    }

    const contestEvaluator = await prisma.contestEvaluator.upsert({
      where: {
        contestId_userId: {
          contestId,
          userId: evaluatorId,
        },
      },
      update: {
        updatedAt: new Date(),
      },
      create: {
        contestId,
        userId: evaluatorId,
      },
    });

    await recordAuditLog({
      actorId: session.userId,
      action: "ASSIGN_EVALUATOR_TO_CONTEST",
      targetType: "CONTEST",
      targetId: contestId,
      metadata: { evaluatorId, evaluatorEmail: evaluator.email, contestTitle: contest.title },
    });

    safeRevalidatePath("/admin/contests");
    safeRevalidatePath("/evaluator");

    return {
      success: true,
      item: {
        id: contestEvaluator.id,
        evaluatorId: evaluator.id,
        name: evaluator.name,
        email: evaluator.email,
        institution: evaluator.institution,
        assignedCandidateCount: 0,
        assignedAt: contestEvaluator.assignedAt.toISOString(),
      },
    };
  } catch (error) {
    console.error("Error assigning evaluator to contest:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to assign evaluator." };
  }
}

/**
 * Assigns multiple evaluators to a contest in a single batch operation.
 * Prevents duplicates, validates roles and statuses, and creates audit logs.
 */
export async function batchAssignEvaluatorsToContestAction(
  contestId: string,
  evaluatorIds: string[]
): Promise<{ success: boolean; count: number; error?: string; items?: ContestEvaluatorItem[] }> {
  try {
    const session = await requireRole(["ADMIN"]);

    if (!evaluatorIds || evaluatorIds.length === 0) {
      return { success: false, count: 0, error: "No evaluators were selected." };
    }

    // Verify contest exists
    const contest = await prisma.contest.findUnique({
      where: { id: contestId },
      select: { id: true, title: true },
    });
    if (!contest) {
      return { success: false, count: 0, error: "Contest not found." };
    }

    // Filter to valid active evaluators
    const validEvaluators = await prisma.user.findMany({
      where: {
        id: { in: evaluatorIds },
        role: "EVALUATOR",
        isActive: true,
      },
      select: { id: true, name: true, email: true, institution: true },
    });

    if (validEvaluators.length === 0) {
      return { success: false, count: 0, error: "No valid active evaluators found from selection." };
    }

    const createdItems: ContestEvaluatorItem[] = [];

    for (const ev of validEvaluators) {
      const contestEvaluator = await prisma.contestEvaluator.upsert({
        where: {
          contestId_userId: {
            contestId,
            userId: ev.id,
          },
        },
        update: {
          updatedAt: new Date(),
        },
        create: {
          contestId,
          userId: ev.id,
        },
      });

      createdItems.push({
        id: contestEvaluator.id,
        evaluatorId: ev.id,
        name: ev.name,
        email: ev.email,
        institution: ev.institution,
        assignedCandidateCount: 0,
        assignedAt: contestEvaluator.assignedAt.toISOString(),
      });
    }

    await recordAuditLog({
      actorId: session.userId,
      action: "BATCH_ASSIGN_EVALUATORS_TO_CONTEST",
      targetType: "CONTEST",
      targetId: contestId,
      metadata: {
        assignedCount: createdItems.length,
        evaluatorIds: validEvaluators.map((e) => e.id),
        contestTitle: contest.title,
      },
    });

    safeRevalidatePath("/admin/contests");
    safeRevalidatePath("/evaluator");

    return {
      success: true,
      count: createdItems.length,
      items: createdItems,
    };
  } catch (error) {
    console.error("Error bulk assigning evaluators to contest:", error);
    return {
      success: false,
      count: 0,
      error: error instanceof Error ? error.message : "Failed to bulk assign evaluators.",
    };
  }
}

/**
 * Removes an evaluator from a contest (and cascades candidate assignments).
 */
export async function removeEvaluatorFromContestAction(
  contestId: string,
  evaluatorId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireRole(["ADMIN"]);

    // Delete contestEvaluator record (cascades to candidate assignments in this contest)
    await prisma.contestEvaluator.deleteMany({
      where: {
        contestId,
        userId: evaluatorId,
      },
    });

    // Also remove any direct assignments for this contest and evaluator
    await prisma.evaluatorCandidateAssignment.deleteMany({
      where: {
        contestId,
        evaluatorId,
      },
    });

    await recordAuditLog({
      actorId: session.userId,
      action: "REMOVE_EVALUATOR_FROM_CONTEST",
      targetType: "CONTEST",
      targetId: contestId,
      metadata: { evaluatorId },
    });

    safeRevalidatePath("/admin/contests");
    safeRevalidatePath("/evaluator");

    return { success: true };
  } catch (error) {
    console.error("Error removing evaluator from contest:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to remove evaluator." };
  }
}

/**
 * Retrieves the complete candidate allocation overview for a contest.
 */
export async function getContestCandidateAllocationsAction(
  contestId: string
): Promise<ContestAllocationOverview | null> {
  try {
    await requireRole(["ADMIN"]);

    const contest = await prisma.contest.findUnique({
      where: { id: contestId },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                candidateId: true,
                institution: true,
              },
            },
          },
          orderBy: { enrolledAt: "asc" },
        },
        evaluators: {
          include: {
            user: {
              select: { id: true, name: true, email: true, institution: true },
            },
            candidateAssignments: {
              select: { participantId: true },
            },
          },
          orderBy: { assignedAt: "asc" },
        },
        candidateAssignments: {
          include: {
            evaluator: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
    });

    if (!contest) return null;

    // Build assignment lookup map: participantId -> evaluator
    const assignmentMap = new Map<
      string,
      { evaluatorId: string; evaluatorName: string; evaluatorEmail: string }
    >();

    for (const a of contest.candidateAssignments) {
      assignmentMap.set(a.participantId, {
        evaluatorId: a.evaluator.id,
        evaluatorName: a.evaluator.name,
        evaluatorEmail: a.evaluator.email,
      });
    }

    const candidates: CandidateAllocationItem[] = contest.participants.map((cp) => {
      const assigned = assignmentMap.get(cp.userId);
      return {
        participantId: cp.userId,
        name: cp.user.name,
        email: cp.user.email,
        candidateId: cp.user.candidateId || `ACI-${cp.userId.slice(0, 4).toUpperCase()}`,
        institution: cp.user.institution || "National Campus Cluster",
        enrolledAt: cp.enrolledAt.toISOString(),
        assignedEvaluatorId: assigned?.evaluatorId || null,
        assignedEvaluatorName: assigned?.evaluatorName || null,
        assignedEvaluatorEmail: assigned?.evaluatorEmail || null,
      };
    });

    const evaluators: ContestEvaluatorItem[] = contest.evaluators.map((ce) => ({
      id: ce.id,
      evaluatorId: ce.userId,
      name: ce.user.name,
      email: ce.user.email,
      institution: ce.user.institution,
      assignedCandidateCount: ce.candidateAssignments.length,
      assignedAt: ce.assignedAt.toISOString(),
    }));

    // Find all active evaluators in system for dropdown
    const assignedUserIds = new Set(contest.evaluators.map((ce) => ce.userId));
    const allEvaluators = await prisma.user.findMany({
      where: { role: "EVALUATOR", isActive: true },
      select: { id: true, name: true, email: true, institution: true },
      orderBy: { name: "asc" },
    });
    const availableEvaluators = allEvaluators.filter((e) => !assignedUserIds.has(e.id));

    const allocatedCount = candidates.filter((c) => c.assignedEvaluatorId !== null).length;

    return {
      contestId: contest.id,
      contestTitle: contest.title,
      totalEnrolledCandidates: candidates.length,
      allocatedCandidatesCount: allocatedCount,
      unallocatedCandidatesCount: candidates.length - allocatedCount,
      evaluators,
      candidates,
      availableEvaluators,
    };
  } catch (error) {
    console.error("Error fetching contest candidate allocations:", error);
    return null;
  }
}

/**
 * Allocates a list of candidates to a specific evaluator in a contest.
 * If reassign is true (default), any existing assignment for the candidate in this contest is updated to the new evaluator.
 */
export async function allocateCandidatesToEvaluatorAction(params: {
  contestId: string;
  evaluatorId: string;
  participantIds: string[];
  reassign?: boolean;
}): Promise<{ success: boolean; allocatedCount: number; error?: string }> {
  try {
    const session = await requireRole(["ADMIN"]);
    const { contestId, evaluatorId, participantIds, reassign = true } = params;

    if (!participantIds || participantIds.length === 0) {
      return { success: false, allocatedCount: 0, error: "No candidates selected for allocation." };
    }

    // 1. Ensure evaluator is registered as a ContestEvaluator
    let contestEvaluator = await prisma.contestEvaluator.findUnique({
      where: {
        contestId_userId: {
          contestId,
          userId: evaluatorId,
        },
      },
    });

    if (!contestEvaluator) {
      contestEvaluator = await prisma.contestEvaluator.create({
        data: {
          contestId,
          userId: evaluatorId,
        },
      });
    }

    let allocatedCount = 0;

    for (const participantId of participantIds) {
      // 2. If reassign is enabled, remove any existing assignment for this candidate in this contest
      if (reassign) {
        await prisma.evaluatorCandidateAssignment.deleteMany({
          where: {
            contestId,
            participantId,
          },
        });
      }

      // 3. Create or upsert assignment
      await prisma.evaluatorCandidateAssignment.upsert({
        where: {
          contestId_evaluatorId_participantId: {
            contestId,
            evaluatorId,
            participantId,
          },
        },
        update: {
          contestEvaluatorId: contestEvaluator.id,
          updatedAt: new Date(),
        },
        create: {
          contestId,
          contestEvaluatorId: contestEvaluator.id,
          evaluatorId,
          participantId,
        },
      });

      allocatedCount++;
    }

    await recordAuditLog({
      actorId: session.userId,
      action: "ALLOCATE_CANDIDATES_TO_EVALUATOR",
      targetType: "CONTEST",
      targetId: contestId,
      metadata: { evaluatorId, allocatedCount, participantIds },
    });

    safeRevalidatePath("/admin/contests");
    safeRevalidatePath("/evaluator");

    return { success: true, allocatedCount };
  } catch (error) {
    console.error("Error allocating candidates to evaluator:", error);
    return {
      success: false,
      allocatedCount: 0,
      error: error instanceof Error ? error.message : "Failed to allocate candidates.",
    };
  }
}

/**
 * Removes a candidate's assignment from any evaluator in a contest.
 */
export async function unassignCandidateFromEvaluatorAction(
  contestId: string,
  participantId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireRole(["ADMIN"]);

    await prisma.evaluatorCandidateAssignment.deleteMany({
      where: {
        contestId,
        participantId,
      },
    });

    await recordAuditLog({
      actorId: session.userId,
      action: "UNASSIGN_CANDIDATE_FROM_EVALUATOR",
      targetType: "CONTEST",
      targetId: contestId,
      metadata: { participantId },
    });

    safeRevalidatePath("/admin/contests");
    safeRevalidatePath("/evaluator");

    return { success: true };
  } catch (error) {
    console.error("Error unassigning candidate:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to unassign candidate." };
  }
}

/**
 * Automatically distributes unassigned candidates evenly across assigned evaluators or in specified batch sizes.
 * Example: Evaluator A gets 1–10, Evaluator B gets 11–20.
 */
export async function autoDistributeCandidatesAction(params: {
  contestId: string;
  batchSize?: number;
}): Promise<{ success: boolean; allocatedCount: number; error?: string }> {
  try {
    const session = await requireRole(["ADMIN"]);
    const { contestId, batchSize } = params;

    // Get assigned evaluators
    const evaluators = await prisma.contestEvaluator.findMany({
      where: { contestId },
      orderBy: { assignedAt: "asc" },
    });

    if (evaluators.length === 0) {
      return { success: false, allocatedCount: 0, error: "No evaluators assigned to this contest. Please assign evaluators first." };
    }

    // Get all enrolled participants in this contest
    const enrolled = await prisma.contestParticipant.findMany({
      where: { contestId },
      orderBy: { enrolledAt: "asc" },
    });

    // Get existing assignments
    const existingAssignments = await prisma.evaluatorCandidateAssignment.findMany({
      where: { contestId },
      select: { participantId: true },
    });
    const assignedParticipantIds = new Set(existingAssignments.map((a) => a.participantId));

    // Filter unassigned participants
    const unassigned = enrolled.filter((ep) => !assignedParticipantIds.has(ep.userId));
    if (unassigned.length === 0) {
      return { success: true, allocatedCount: 0, error: "All candidates are already allocated." };
    }

    let allocatedCount = 0;
    const chunkSize = batchSize && batchSize > 0 ? batchSize : Math.ceil(unassigned.length / evaluators.length);

    for (let i = 0; i < evaluators.length; i++) {
      const evaluator = evaluators[i];
      const startIdx = i * chunkSize;
      const endIdx = Math.min(startIdx + chunkSize, unassigned.length);
      const chunk = unassigned.slice(startIdx, endIdx);

      if (chunk.length === 0) break;

      for (const participant of chunk) {
        await prisma.evaluatorCandidateAssignment.upsert({
          where: {
            contestId_evaluatorId_participantId: {
              contestId,
              evaluatorId: evaluator.userId,
              participantId: participant.userId,
            },
          },
          update: {
            contestEvaluatorId: evaluator.id,
            updatedAt: new Date(),
          },
          create: {
            contestId,
            contestEvaluatorId: evaluator.id,
            evaluatorId: evaluator.userId,
            participantId: participant.userId,
          },
        });
        allocatedCount++;
      }
    }

    await recordAuditLog({
      actorId: session.userId,
      action: "AUTO_DISTRIBUTE_CANDIDATES",
      targetType: "CONTEST",
      targetId: contestId,
      metadata: { allocatedCount, evaluatorsCount: evaluators.length, chunkSize },
    });

    safeRevalidatePath("/admin/contests");
    safeRevalidatePath("/evaluator");

    return { success: true, allocatedCount };
  } catch (error) {
    console.error("Error auto-distributing candidates:", error);
    return {
      success: false,
      allocatedCount: 0,
      error: error instanceof Error ? error.message : "Failed to auto-distribute candidates.",
    };
  }
}
