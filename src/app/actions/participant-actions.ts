"use server";

import { prisma } from "@/lib/prisma";
import { ParticipantStatus, UserRole } from "@prisma/client";
import { requireRole } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import { revalidatePath } from "next/cache";

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Runner environment fallback
  }
}

export interface AdminParticipantItem {
  id: string;
  name: string;
  email: string;
  role: "PARTICIPANT" | "EVALUATOR" | "ADMIN";
  candidateId: string;
  institution: string;
  cohortName: string;
  enrolledContestsCount: number;
  completedSubmissionsCount: number;
  status: "ACTIVE" | "ENROLLED" | "DISQUALIFIED" | "WITHDRAWN";
  contests: Array<{
    id: string;
    title: string;
    status: string;
    enrolledAt: string;
  }>;
  createdAt: string;
}

export async function getAdminParticipants(
  searchQuery?: string
): Promise<AdminParticipantItem[]> {
  try {
    await requireRole(["ADMIN"]);

    const users = await prisma.user.findMany({
      where: {
        ...(searchQuery
          ? {
              OR: [
                { name: { contains: searchQuery, mode: "insensitive" } },
                { email: { contains: searchQuery, mode: "insensitive" } },
                { candidateId: { contains: searchQuery, mode: "insensitive" } },
                { institution: { contains: searchQuery, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: {
        cohort: true,
        participants: {
          include: {
            contest: true,
          },
        },
        submissions: {
          where: { status: { in: ["SUBMITTED", "GRADED", "PUBLISHED"] } },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return users.map((u) => {
      const activeParticipation = u.participants[0];
      const participationStatus = activeParticipation?.status || "ENROLLED";

      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role as "PARTICIPANT" | "EVALUATOR" | "ADMIN",
        candidateId: u.candidateId || `ACI-${u.id.substring(0, 4).toUpperCase()}`,
        institution: u.institution || "National Campus Cluster",
        cohortName: u.cohort?.name || "Campus Leadership Programme 2025",
        enrolledContestsCount: u.participants.length,
        completedSubmissionsCount: u.submissions.length,
        status: participationStatus as any,
        contests: u.participants.map((p) => ({
          id: p.contest.id,
          title: p.contest.title,
          status: p.status,
          enrolledAt: p.enrolledAt.toISOString(),
        })),
        createdAt: u.createdAt.toISOString(),
      };
    });
  } catch (error) {
    console.error("Error fetching admin participants:", error);
    return [];
  }
}

export interface CreateAccountInput {
  name: string;
  email: string;
  role?: "PARTICIPANT" | "EVALUATOR" | "ADMIN";
  candidateId?: string;
  institution?: string;
  cohortCode?: string;
  assignContestId?: string;
}

export async function createParticipantAccountAction(input: CreateAccountInput) {
  try {
    const session = await requireRole(["ADMIN"]);

    if (!input.name || !input.email) {
      return { success: false, error: "Name and email are required." };
    }

    const trimmedEmail = input.email.trim().toLowerCase();
    const role = (input.role as UserRole) || UserRole.PARTICIPANT;
    const candidateId =
      input.candidateId?.trim() ||
      (role === UserRole.PARTICIPANT
        ? `ACI-${Math.floor(1000 + Math.random() * 9000)}-${input.name.slice(0, 2).toUpperCase()}`
        : null);

    // Cohort resolution
    let cohortId: string | null = null;
    if (input.cohortCode) {
      const cohort = await prisma.cohort.findUnique({
        where: { code: input.cohortCode },
      });
      if (cohort) cohortId = cohort.id;
    }

    const user = await prisma.user.upsert({
      where: { email: trimmedEmail },
      update: {
        name: input.name.trim(),
        role,
        institution: input.institution?.trim() || "National Campus Cluster",
        ...(candidateId && { candidateId }),
        ...(cohortId && { cohortId }),
      },
      create: {
        id: crypto.randomUUID(),
        email: trimmedEmail,
        name: input.name.trim(),
        role,
        candidateId,
        institution: input.institution?.trim() || "National Campus Cluster",
        cohortId,
      },
    });

    // Optionally assign to contest immediately
    if (input.assignContestId) {
      await prisma.contestParticipant.upsert({
        where: {
          contestId_userId: {
            contestId: input.assignContestId,
            userId: user.id,
          },
        },
        update: { status: ParticipantStatus.ACTIVE },
        create: {
          contestId: input.assignContestId,
          userId: user.id,
          status: ParticipantStatus.ACTIVE,
        },
      });
    }

    await recordAuditLog({
      actorId: session.userId,
      action: "CREATE_ACCOUNT",
      targetType: "USER",
      targetId: user.id,
      metadata: { email: user.email, role: user.role },
    });

    safeRevalidatePath("/admin/participants");
    safeRevalidatePath("/admin/contests");
    safeRevalidatePath("/dashboard");

    return { success: true, user };
  } catch (error) {
    console.error("Error creating participant account:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to create account" };
  }
}

export async function updateParticipantStatusAction(
  userId: string,
  status: "ACTIVE" | "DISQUALIFIED" | "WITHDRAWN",
  contestId?: string
) {
  try {
    const session = await requireRole(["ADMIN"]);

    if (contestId) {
      await prisma.contestParticipant.updateMany({
        where: { userId, contestId },
        data: { status: status as ParticipantStatus },
      });
    } else {
      await prisma.contestParticipant.updateMany({
        where: { userId },
        data: { status: status as ParticipantStatus },
      });
    }

    await recordAuditLog({
      actorId: session.userId,
      action: "UPDATE_PARTICIPANT_STATUS",
      targetType: "USER",
      targetId: userId,
      metadata: { status, contestId },
    });

    safeRevalidatePath("/admin/participants");
    safeRevalidatePath("/admin/contests");

    return { success: true };
  } catch (error) {
    console.error("Error updating participant status:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to update status" };
  }
}

export async function bulkEnrollParticipantsAction(
  contestId: string,
  userIds: string[]
) {
  try {
    const session = await requireRole(["ADMIN"]);

    for (const userId of userIds) {
      await prisma.contestParticipant.upsert({
        where: {
          contestId_userId: {
            contestId,
            userId,
          },
        },
        update: { status: ParticipantStatus.ACTIVE },
        create: {
          contestId,
          userId,
          status: ParticipantStatus.ACTIVE,
        },
      });
    }

    await recordAuditLog({
      actorId: session.userId,
      action: "BULK_ENROLL_PARTICIPANTS",
      targetType: "CONTEST",
      targetId: contestId,
      metadata: { enrolledCount: userIds.length },
    });

    safeRevalidatePath("/admin/participants");
    safeRevalidatePath("/admin/contests");
    safeRevalidatePath("/dashboard");

    return { success: true, count: userIds.length };
  } catch (error) {
    console.error("Error bulk enrolling participants:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed bulk enrollment" };
  }
}
