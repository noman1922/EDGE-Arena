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
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        candidateId: true,
        institution: true,
        createdAt: true,
        cohort: {
          select: { name: true },
        },
        participants: {
          select: {
            id: true,
            status: true,
            enrolledAt: true,
            contest: {
              select: { id: true, title: true },
            },
          },
          orderBy: { enrolledAt: "desc" },
        },
        _count: {
          select: {
            submissions: {
              where: { status: { in: ["SUBMITTED", "GRADED", "PUBLISHED"] } },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
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
        completedSubmissionsCount: u._count.submissions,
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

import { hashPassword, storeUserCredentials } from "@/lib/credentials";

export interface CreateAccountInput {
  name: string;
  email: string;
  role?: "PARTICIPANT" | "EVALUATOR" | "ADMIN";
  candidateId?: string;
  institution?: string;
  cohortCode?: string;
  assignContestId?: string;
  initialPassword?: string;
}

export interface BulkImportRowError {
  row: number;
  email?: string;
  error: string;
}

export interface BulkImportResult {
  success: boolean;
  totalRows: number;
  importedCount: number;
  failedCount: number;
  errors: BulkImportRowError[];
}

export async function createParticipantAccountAction(input: CreateAccountInput) {
  try {
    const session = await requireRole(["ADMIN"]);

    if (!input.name || !input.email) {
      return { success: false, error: "Name and email are required." };
    }

    const trimmedEmail = input.email.trim().toLowerCase();
    const role = (input.role as UserRole) || UserRole.PARTICIPANT;

    // Check duplicate email
    const existingUser = await prisma.user.findUnique({
      where: { email: trimmedEmail },
    });
    if (existingUser) {
      return {
        success: false,
        error: `User account with email "${trimmedEmail}" already exists.`,
      };
    }

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

    const userId = crypto.randomUUID();
    const user = await prisma.user.create({
      data: {
        id: userId,
        email: trimmedEmail,
        name: input.name.trim(),
        role,
        candidateId,
        institution: input.institution?.trim() || "National Campus Cluster",
        cohortId,
      },
    });

    // Hash and store credentials if initial password is provided
    const rawPassword = input.initialPassword?.trim() || "EdgeArena#2025";
    const { hash, salt } = hashPassword(rawPassword);
    await storeUserCredentials(user.id, hash, salt, true);

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
      metadata: { email: user.email, role: user.role, candidateId: user.candidateId },
    });

    safeRevalidatePath("/admin/participants");
    safeRevalidatePath("/admin/contests");
    safeRevalidatePath("/dashboard");

    return { success: true, user, initialPassword: rawPassword };
  } catch (error) {
    console.error("Error creating participant account:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to create account" };
  }
}

/**
 * Parses CSV text compliant with RFC-4180
 */
function parseCsv(csvText: string): string[][] {
  const lines: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      currentRow.push(currentField.trim());
      currentField = "";
    } else if ((char === "\r" || char === "\n") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") i++;
      currentRow.push(currentField.trim());
      if (currentRow.some((f) => f.length > 0)) {
        lines.push(currentRow);
      }
      currentRow = [];
      currentField = "";
    } else {
      currentField += char;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((f) => f.length > 0)) {
      lines.push(currentRow);
    }
  }

  return lines;
}

/**
 * Bulk imports participant and evaluator accounts from CSV text.
 * Expected Header Columns:
 * Name, Email, Role, CandidateId, Institution, InitialPassword
 */
export async function bulkImportUsersAction(
  csvText: string,
  assignContestId?: string
): Promise<BulkImportResult> {
  try {
    const session = await requireRole(["ADMIN"]);

    if (!csvText || !csvText.trim()) {
      return {
        success: false,
        totalRows: 0,
        importedCount: 0,
        failedCount: 0,
        errors: [{ row: 0, error: "CSV file content is empty." }],
      };
    }

    const rows = parseCsv(csvText.trim());
    if (rows.length < 2) {
      return {
        success: false,
        totalRows: 0,
        importedCount: 0,
        failedCount: 0,
        errors: [
          {
            row: 1,
            error:
              "CSV must contain at least a header row and one valid data record.",
          },
        ],
      };
    }

    const header = rows[0].map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ""));
    const nameIdx = header.findIndex((h) => h.includes("name"));
    const emailIdx = header.findIndex((h) => h.includes("email"));
    const roleIdx = header.findIndex((h) => h.includes("role"));
    const candidateIdIdx = header.findIndex((h) => h.includes("candidate") || h.includes("id"));
    const institutionIdx = header.findIndex((h) => h.includes("institution") || h.includes("org"));
    const passwordIdx = header.findIndex((h) => h.includes("pass") || h.includes("cred"));

    if (nameIdx === -1 || emailIdx === -1) {
      return {
        success: false,
        totalRows: rows.length - 1,
        importedCount: 0,
        failedCount: rows.length - 1,
        errors: [
          {
            row: 1,
            error:
              "Header missing required columns: 'Name' and 'Email' must be present.",
          },
        ],
      };
    }

    const errors: BulkImportRowError[] = [];
    const emailsInFile = new Set<string>();
    let importedCount = 0;

    const dataRows = rows.slice(1);

    for (let i = 0; i < dataRows.length; i++) {
      const rowNum = i + 2; // 1-indexed, accounting for header
      const row = dataRows[i];

      const rawName = row[nameIdx] || "";
      const rawEmail = row[emailIdx] || "";
      const rawRole = roleIdx !== -1 ? row[roleIdx] : "PARTICIPANT";
      const rawCandidateId = candidateIdIdx !== -1 ? row[candidateIdIdx] : undefined;
      const rawInstitution = institutionIdx !== -1 ? row[institutionIdx] : undefined;
      const rawPassword = passwordIdx !== -1 ? row[passwordIdx] : undefined;

      // Validate name
      if (!rawName.trim()) {
        errors.push({ row: rowNum, error: "Candidate/Evaluator name is required." });
        continue;
      }

      // Validate email
      const trimmedEmail = rawEmail.trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!trimmedEmail || !emailRegex.test(trimmedEmail)) {
        errors.push({
          row: rowNum,
          email: trimmedEmail || undefined,
          error: `Invalid email address format: "${rawEmail}".`,
        });
        continue;
      }

      // Check duplicates within file
      if (emailsInFile.has(trimmedEmail)) {
        errors.push({
          row: rowNum,
          email: trimmedEmail,
          error: `Duplicate email address in CSV upload: "${trimmedEmail}".`,
        });
        continue;
      }
      emailsInFile.add(trimmedEmail);

      // Validate Role
      const normalizedRole = rawRole.toUpperCase().trim();
      let role: UserRole = UserRole.PARTICIPANT;
      if (normalizedRole === "EVALUATOR") {
        role = UserRole.EVALUATOR;
      } else if (normalizedRole === "ADMIN") {
        role = UserRole.ADMIN;
      } else if (normalizedRole === "PARTICIPANT" || !normalizedRole) {
        role = UserRole.PARTICIPANT;
      } else {
        errors.push({
          row: rowNum,
          email: trimmedEmail,
          error: `Invalid role: "${rawRole}". Accepted roles: PARTICIPANT or EVALUATOR.`,
        });
        continue;
      }

      // Check duplicate in database
      const existing = await prisma.user.findUnique({
        where: { email: trimmedEmail },
      });
      if (existing) {
        errors.push({
          row: rowNum,
          email: trimmedEmail,
          error: `Account already exists in system database for "${trimmedEmail}".`,
        });
        continue;
      }

      // Candidate ID generation
      const candidateId =
        rawCandidateId?.trim() ||
        (role === UserRole.PARTICIPANT
          ? `ACI-${Math.floor(1000 + Math.random() * 9000)}-${rawName.slice(0, 2).toUpperCase()}`
          : null);

      try {
        const userId = crypto.randomUUID();
        const user = await prisma.user.create({
          data: {
            id: userId,
            email: trimmedEmail,
            name: rawName.trim(),
            role,
            candidateId,
            institution: rawInstitution?.trim() || "National Campus Cluster",
          },
        });

        // Store secure credentials
        const passwordToHash = rawPassword?.trim() || "EdgeArena#2025";
        const { hash, salt } = hashPassword(passwordToHash);
        await storeUserCredentials(user.id, hash, salt, true);

        // Optionally enroll in contest
        if (assignContestId && role === UserRole.PARTICIPANT) {
          await prisma.contestParticipant.create({
            data: {
              contestId: assignContestId,
              userId: user.id,
              status: ParticipantStatus.ACTIVE,
            },
          });
        }

        importedCount++;
      } catch (dbErr) {
        errors.push({
          row: rowNum,
          email: trimmedEmail,
          error: dbErr instanceof Error ? dbErr.message : "Database write failed",
        });
      }
    }

    await recordAuditLog({
      actorId: session.userId,
      action: "BULK_IMPORT_USERS",
      targetType: "USER",
      targetId: "SYSTEM",
      metadata: {
        totalRows: dataRows.length,
        importedCount,
        failedCount: errors.length,
      },
    });

    safeRevalidatePath("/admin/participants");
    safeRevalidatePath("/admin/contests");

    return {
      success: importedCount > 0,
      totalRows: dataRows.length,
      importedCount,
      failedCount: errors.length,
      errors,
    };
  } catch (error) {
    console.error("Bulk import users error:", error);
    return {
      success: false,
      totalRows: 0,
      importedCount: 0,
      failedCount: 0,
      errors: [
        {
          row: 0,
          error:
            error instanceof Error ? error.message : "Failed to execute bulk user import.",
        },
      ],
    };
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
