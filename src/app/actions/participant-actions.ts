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
          take: 5,
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

import { hashPassword, storeUserCredentials, validatePasswordStrength } from "@/lib/credentials";
import { logSystemError } from "@/lib/error-logger";

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

    if (!input.name || !input.name.trim()) {
      return { success: false, error: "Participant name is required." };
    }

    if (!input.email || !input.email.trim()) {
      return { success: false, error: "Email address is required." };
    }

    const trimmedEmail = input.email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return { success: false, error: "Please enter a valid email address." };
    }

    if (!input.initialPassword || !input.initialPassword.trim()) {
      return { success: false, error: "Initial password is required." };
    }

    const strengthCheck = validatePasswordStrength(input.initialPassword.trim());
    if (!strengthCheck.isValid) {
      return {
        success: false,
        error: strengthCheck.error || "Password must be at least 8 characters.",
      };
    }

    // Role is strictly PARTICIPANT — never accept role override from client
    const role = UserRole.PARTICIPANT;

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
      `ACI-${Math.floor(1000 + Math.random() * 9000)}-${input.name.slice(0, 2).toUpperCase()}`;

    // Check duplicate candidate ID
    const existingCandidate = await prisma.user.findUnique({
      where: { candidateId },
    });
    if (existingCandidate) {
      return {
        success: false,
        error: `Participant identifier "${candidateId}" already exists.`,
      };
    }

    // Cohort resolution
    let cohortId: string | null = null;
    if (input.cohortCode) {
      const cohort = await prisma.cohort.findUnique({
        where: { code: input.cohortCode },
      });
      if (cohort) cohortId = cohort.id;
    }

    // Cryptographic hash with unique salt
    const { hash, salt } = hashPassword(input.initialPassword.trim());

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
        passwordHash: hash,
        passwordSalt: salt,
        mustChangePassword: true,
        isActive: true,
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
      metadata: { email: user.email, role: user.role, candidateId: user.candidateId },
    });

    safeRevalidatePath("/admin/participants");
    safeRevalidatePath("/admin/contests");
    safeRevalidatePath("/dashboard");

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        candidateId: user.candidateId,
      },
    };
  } catch (error) {
    const sanitized = await logSystemError({
      route: "/admin/participants",
      operation: "createParticipantAccountAction",
      category: "VALIDATION",
      error,
    });
    return { success: false, error: sanitized.error };
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

    if (nameIdx === -1 || emailIdx === -1 || passwordIdx === -1) {
      return {
        success: false,
        totalRows: rows.length - 1,
        importedCount: 0,
        failedCount: rows.length - 1,
        errors: [
          {
            row: 1,
            error:
              "Header missing required columns: 'Name', 'Email', and 'Password' must be present.",
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
      const rawCandidateId = candidateIdIdx !== -1 ? row[candidateIdIdx] : undefined;
      const rawInstitution = institutionIdx !== -1 ? row[institutionIdx] : undefined;
      const rawPassword = passwordIdx !== -1 ? row[passwordIdx] : undefined;

      // Validate name
      if (!rawName.trim()) {
        errors.push({ row: rowNum, error: "Candidate name is required." });
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

      // Validate password
      if (!rawPassword || !rawPassword.trim()) {
        errors.push({
          row: rowNum,
          email: trimmedEmail,
          error: "Initial password is required.",
        });
        continue;
      }

      const strengthCheck = validatePasswordStrength(rawPassword.trim());
      if (!strengthCheck.isValid) {
        errors.push({
          row: rowNum,
          email: trimmedEmail,
          error: strengthCheck.error || "Password must be at least 8 characters.",
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
        `ACI-${Math.floor(1000 + Math.random() * 9000)}-${rawName.slice(0, 2).toUpperCase()}`;

      try {
        const { hash, salt } = hashPassword(rawPassword.trim());
        const userId = crypto.randomUUID();

        // Enforce PARTICIPANT role strictly on server — ignore any role from CSV
        const user = await prisma.user.create({
          data: {
            id: userId,
            email: trimmedEmail,
            name: rawName.trim(),
            role: UserRole.PARTICIPANT,
            candidateId,
            institution: rawInstitution?.trim() || "National Campus Cluster",
            passwordHash: hash,
            passwordSalt: salt,
            mustChangePassword: true,
            isActive: true,
          },
        });

        // Optionally enroll in contest
        if (assignContestId) {
          await prisma.contestParticipant.create({
            data: {
              contestId: assignContestId,
              userId: user.id,
              status: ParticipantStatus.ACTIVE,
            },
          });
        }

        importedCount++;
      } catch {
        errors.push({
          row: rowNum,
          email: trimmedEmail,
          error: "Failed to persist participant account to database.",
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

// ---------------------------------------------------------------------------
// Dedicated Participant Import (CSV) with Pre-validation Preview & Enrollment
// ---------------------------------------------------------------------------

export type ParticipantImportRowStatus =
  | "READY"
  | "ALREADY_EXISTS"
  | "ALREADY_ENROLLED"
  | "DUPLICATE_IN_FILE"
  | "INVALID";

export interface ParticipantImportPreviewRow {
  rowNumber: number;
  name: string;
  email: string;
  candidateId: string;
  teamNumber: string;
  status: ParticipantImportRowStatus;
  reason?: string;
}

export interface ParticipantImportPreviewResult {
  success: boolean;
  totalRows: number;
  readyCount: number;
  alreadyExistsCount: number;
  alreadyEnrolledCount: number;
  duplicateInFileCount: number;
  invalidCount: number;
  previewRows: ParticipantImportPreviewRow[];
  contestId?: string;
  contestTitle?: string;
  error?: string;
}

export interface ExecuteParticipantImportInput {
  csvText: string;
  contestId?: string;
  enrollExistingAccounts?: boolean;
}

export interface ParticipantImportDetailItem {
  rowNumber: number;
  name: string;
  email: string;
  candidateId: string;
  teamNumber: string;
  accountCreated: boolean;
  enrolledInContest: boolean;
  status:
    | "CREATED_AND_ENROLLED"
    | "CREATED"
    | "ENROLLED_EXISTING"
    | "SKIPPED_EXISTING"
    | "PARTIAL_ERROR"
    | "FAILED";
  message: string;
}

export interface ExecuteParticipantImportResult {
  success: boolean;
  totalRows: number;
  createdCount: number;
  enrolledCount: number;
  skippedCount: number;
  failedCount: number;
  partialErrorCount: number;
  details: ParticipantImportDetailItem[];
  error?: string;
}

/**
 * Parses and validates CSV content for participant creation & contest enrollment.
 * Generates a preview summary before committing to database.
 * Never exposes raw passwords.
 */
export async function previewParticipantImportCsvAction(
  csvText: string,
  contestId?: string
): Promise<ParticipantImportPreviewResult> {
  try {
    await requireRole(["ADMIN"]);

    if (!csvText || !csvText.trim()) {
      return {
        success: false,
        totalRows: 0,
        readyCount: 0,
        alreadyExistsCount: 0,
        alreadyEnrolledCount: 0,
        duplicateInFileCount: 0,
        invalidCount: 0,
        previewRows: [],
        error: "CSV content is empty.",
      };
    }

    const rows = parseCsv(csvText.trim());
    if (rows.length < 2) {
      return {
        success: false,
        totalRows: 0,
        readyCount: 0,
        alreadyExistsCount: 0,
        alreadyEnrolledCount: 0,
        duplicateInFileCount: 0,
        invalidCount: 0,
        previewRows: [],
        error: "CSV must contain at least a header row and one participant record.",
      };
    }

    const header = rows[0].map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ""));
    const nameIdx = header.findIndex((h) => h === "name" || h === "fullname" || h.includes("name"));
    const emailIdx = header.findIndex((h) => h === "email" || h === "emailaddress" || h.includes("email"));
    const passwordIdx = header.findIndex(
      (h) => h === "password" || h === "initialpassword" || h === "clcode" || h.includes("pass") || h.includes("cred") || h === "code"
    );
    const teamIdx = header.findIndex(
      (h) => h === "teamnumber" || h === "team" || h === "teamno" || h.includes("team") || h.includes("institution") || h.includes("org")
    );
    const candidateIdIdx = header.findIndex((h) => h === "candidateid" || h === "candidate");

    if (nameIdx === -1 || emailIdx === -1 || passwordIdx === -1 || teamIdx === -1) {
      return {
        success: false,
        totalRows: rows.length - 1,
        readyCount: 0,
        alreadyExistsCount: 0,
        alreadyEnrolledCount: 0,
        duplicateInFileCount: 0,
        invalidCount: rows.length - 1,
        previewRows: [],
        error: "CSV header missing required columns. Required headers: 'Name', 'Email', 'Password', 'Team Number'.",
      };
    }

    let contestTitle: string | undefined = undefined;
    if (contestId) {
      const contest = await prisma.contest.findUnique({
        where: { id: contestId },
        select: { id: true, title: true },
      });
      if (contest) {
        contestTitle = contest.title;
      }
    }

    const dataRows = rows.slice(1);
    const previewRows: ParticipantImportPreviewRow[] = [];
    const seenEmails = new Set<string>();
    const seenCandidateIds = new Set<string>();

    const normalizedEmailsInFile: string[] = [];
    const candidateIdsInFile: string[] = [];

    for (const r of dataRows) {
      const email = (r[emailIdx] || "").trim().toLowerCase();
      if (email) normalizedEmailsInFile.push(email);

      const pass = (r[passwordIdx] || "").trim();
      const cid = candidateIdIdx !== -1 && r[candidateIdIdx] ? r[candidateIdIdx].trim() : pass;
      if (cid) candidateIdsInFile.push(cid);
    }

    const existingUsers = await prisma.user.findMany({
      where: {
        OR: [
          { email: { in: normalizedEmailsInFile } },
          { candidateId: { in: candidateIdsInFile } },
        ],
      },
      select: {
        id: true,
        email: true,
        candidateId: true,
        name: true,
        institution: true,
      },
    });

    const userByEmail = new Map(existingUsers.map((u) => [u.email.toLowerCase(), u]));
    const userByCandidateId = new Map(
      existingUsers.filter((u) => !!u.candidateId).map((u) => [u.candidateId!.toUpperCase(), u])
    );

    let enrolledUserIds = new Set<string>();
    if (contestId && existingUsers.length > 0) {
      const enrollments = await prisma.contestParticipant.findMany({
        where: {
          contestId,
          userId: { in: existingUsers.map((u) => u.id) },
        },
        select: { userId: true },
      });
      enrolledUserIds = new Set(enrollments.map((e) => e.userId));
    }

    let readyCount = 0;
    let alreadyExistsCount = 0;
    let alreadyEnrolledCount = 0;
    let duplicateInFileCount = 0;
    let invalidCount = 0;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    for (let i = 0; i < dataRows.length; i++) {
      const rowNum = i + 2;
      const row = dataRows[i];

      const rawName = (row[nameIdx] || "").trim();
      const rawEmail = (row[emailIdx] || "").trim();
      const rawPassword = (row[passwordIdx] || "").trim();
      const rawTeam = (row[teamIdx] || "").trim();
      const rawCandidateId =
        candidateIdIdx !== -1 && row[candidateIdIdx] ? row[candidateIdIdx].trim() : rawPassword;

      const normalizedEmail = rawEmail.toLowerCase();
      const normalizedCandidateId = rawCandidateId.toUpperCase();

      if (!rawName) {
        invalidCount++;
        previewRows.push({
          rowNumber: rowNum,
          name: rawName,
          email: rawEmail,
          candidateId: rawCandidateId,
          teamNumber: rawTeam,
          status: "INVALID",
          reason: "Participant name is required.",
        });
        continue;
      }

      if (!rawEmail || !emailRegex.test(normalizedEmail)) {
        invalidCount++;
        previewRows.push({
          rowNumber: rowNum,
          name: rawName,
          email: rawEmail,
          candidateId: rawCandidateId,
          teamNumber: rawTeam,
          status: "INVALID",
          reason: `Invalid email address format: "${rawEmail}".`,
        });
        continue;
      }

      if (!rawPassword) {
        invalidCount++;
        previewRows.push({
          rowNumber: rowNum,
          name: rawName,
          email: rawEmail,
          candidateId: rawCandidateId,
          teamNumber: rawTeam,
          status: "INVALID",
          reason: "Initial password / CL code is required.",
        });
        continue;
      }

      if (!rawTeam) {
        invalidCount++;
        previewRows.push({
          rowNumber: rowNum,
          name: rawName,
          email: rawEmail,
          candidateId: rawCandidateId,
          teamNumber: rawTeam,
          status: "INVALID",
          reason: "Team Number is required.",
        });
        continue;
      }

      if (seenEmails.has(normalizedEmail)) {
        duplicateInFileCount++;
        previewRows.push({
          rowNumber: rowNum,
          name: rawName,
          email: rawEmail,
          candidateId: rawCandidateId,
          teamNumber: rawTeam,
          status: "DUPLICATE_IN_FILE",
          reason: `Duplicate email address in CSV upload: "${rawEmail}".`,
        });
        continue;
      }
      seenEmails.add(normalizedEmail);

      if (normalizedCandidateId && seenCandidateIds.has(normalizedCandidateId)) {
        duplicateInFileCount++;
        previewRows.push({
          rowNumber: rowNum,
          name: rawName,
          email: rawEmail,
          candidateId: rawCandidateId,
          teamNumber: rawTeam,
          status: "DUPLICATE_IN_FILE",
          reason: `Duplicate Candidate ID / CL Code in CSV upload: "${rawCandidateId}".`,
        });
        continue;
      }
      if (normalizedCandidateId) {
        seenCandidateIds.add(normalizedCandidateId);
      }

      const existingUserByEmail = userByEmail.get(normalizedEmail);
      const existingUserByCid = normalizedCandidateId ? userByCandidateId.get(normalizedCandidateId) : undefined;

      if (existingUserByCid && (!existingUserByEmail || existingUserByCid.id !== existingUserByEmail.id)) {
        invalidCount++;
        previewRows.push({
          rowNumber: rowNum,
          name: rawName,
          email: rawEmail,
          candidateId: rawCandidateId,
          teamNumber: rawTeam,
          status: "INVALID",
          reason: `Candidate ID "${rawCandidateId}" is already assigned to another user (${existingUserByCid.email}).`,
        });
        continue;
      }

      if (existingUserByEmail) {
        const isEnrolled = enrolledUserIds.has(existingUserByEmail.id);
        if (isEnrolled) {
          alreadyEnrolledCount++;
          previewRows.push({
            rowNumber: rowNum,
            name: rawName,
            email: rawEmail,
            candidateId: rawCandidateId,
            teamNumber: rawTeam,
            status: "ALREADY_ENROLLED",
            reason: `Account exists and is already enrolled in "${contestTitle || "selected contest"}".`,
          });
        } else {
          alreadyExistsCount++;
          previewRows.push({
            rowNumber: rowNum,
            name: rawName,
            email: rawEmail,
            candidateId: rawCandidateId,
            teamNumber: rawTeam,
            status: "ALREADY_EXISTS",
            reason: contestId
              ? `Account exists; will be enrolled in "${contestTitle || "selected contest"}".`
              : "Account already exists in system database.",
          });
        }
        continue;
      }

      readyCount++;
      previewRows.push({
        rowNumber: rowNum,
        name: rawName,
        email: rawEmail,
        candidateId: rawCandidateId,
        teamNumber: rawTeam,
        status: "READY",
        reason: contestId
          ? `Valid new account; will be created and enrolled in "${contestTitle || "contest"}".`
          : "Valid new account; will be created.",
      });
    }

    return {
      success: true,
      totalRows: dataRows.length,
      readyCount,
      alreadyExistsCount,
      alreadyEnrolledCount,
      duplicateInFileCount,
      invalidCount,
      previewRows,
      contestId,
      contestTitle,
    };
  } catch (error) {
    console.error("Preview participant import error:", error);
    return {
      success: false,
      totalRows: 0,
      readyCount: 0,
      alreadyExistsCount: 0,
      alreadyEnrolledCount: 0,
      duplicateInFileCount: 0,
      invalidCount: 0,
      previewRows: [],
      error: error instanceof Error ? error.message : "Failed to generate CSV preview.",
    };
  }
}

/**
 * Creates participant accounts and enrolls them into a contest.
 * Securely hashes passwords with Scrypt and sets mustChangePassword: true.
 * Handles partial failures cleanly without duplicate account creation.
 */
export async function executeParticipantImportAction(
  input: ExecuteParticipantImportInput
): Promise<ExecuteParticipantImportResult> {
  try {
    const session = await requireRole(["ADMIN"]);

    const { csvText, contestId, enrollExistingAccounts = true } = input;

    if (!csvText || !csvText.trim()) {
      return {
        success: false,
        totalRows: 0,
        createdCount: 0,
        enrolledCount: 0,
        skippedCount: 0,
        failedCount: 0,
        partialErrorCount: 0,
        details: [],
        error: "CSV content is empty.",
      };
    }

    const rows = parseCsv(csvText.trim());
    if (rows.length < 2) {
      return {
        success: false,
        totalRows: 0,
        createdCount: 0,
        enrolledCount: 0,
        skippedCount: 0,
        failedCount: 0,
        partialErrorCount: 0,
        details: [],
        error: "CSV must contain at least a header row and one participant record.",
      };
    }

    const header = rows[0].map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ""));
    const nameIdx = header.findIndex((h) => h === "name" || h === "fullname" || h.includes("name"));
    const emailIdx = header.findIndex((h) => h === "email" || h === "emailaddress" || h.includes("email"));
    const passwordIdx = header.findIndex(
      (h) => h === "password" || h === "initialpassword" || h === "clcode" || h.includes("pass") || h.includes("cred") || h === "code"
    );
    const teamIdx = header.findIndex(
      (h) => h === "teamnumber" || h === "team" || h === "teamno" || h.includes("team") || h.includes("institution") || h.includes("org")
    );
    const candidateIdIdx = header.findIndex((h) => h === "candidateid" || h === "candidate");

    if (nameIdx === -1 || emailIdx === -1 || passwordIdx === -1 || teamIdx === -1) {
      return {
        success: false,
        totalRows: rows.length - 1,
        createdCount: 0,
        enrolledCount: 0,
        skippedCount: 0,
        failedCount: rows.length - 1,
        partialErrorCount: 0,
        details: [],
        error: "CSV header missing required columns: 'Name', 'Email', 'Password', 'Team Number'.",
      };
    }

    const activeCohort =
      (await prisma.cohort.findFirst({
        where: { code: "CLP-2025" },
      })) ||
      (await prisma.cohort.findFirst({
        where: {
          OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
        },
        orderBy: { createdAt: "desc" },
      }));

    let contestTitle: string | undefined = undefined;
    if (contestId) {
      const contest = await prisma.contest.findUnique({
        where: { id: contestId },
        select: { id: true, title: true },
      });
      if (!contest) {
        return {
          success: false,
          totalRows: rows.length - 1,
          createdCount: 0,
          enrolledCount: 0,
          skippedCount: 0,
          failedCount: rows.length - 1,
          partialErrorCount: 0,
          details: [],
          error: `Selected contest with ID "${contestId}" was not found.`,
        };
      }
      contestTitle = contest.title;
    }

    const dataRows = rows.slice(1);
    const details: ParticipantImportDetailItem[] = [];
    const seenEmails = new Set<string>();
    const seenCandidateIds = new Set<string>();

    let createdCount = 0;
    let enrolledCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    let partialErrorCount = 0;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    for (let i = 0; i < dataRows.length; i++) {
      const rowNum = i + 2;
      const row = dataRows[i];

      const rawName = (row[nameIdx] || "").trim();
      const rawEmail = (row[emailIdx] || "").trim();
      const rawPassword = (row[passwordIdx] || "").trim();
      const rawTeam = (row[teamIdx] || "").trim();
      const rawCandidateId =
        candidateIdIdx !== -1 && row[candidateIdIdx] ? row[candidateIdIdx].trim() : rawPassword;

      const normalizedEmail = rawEmail.toLowerCase();
      const normalizedCandidateId = rawCandidateId.toUpperCase();

      if (!rawName) {
        failedCount++;
        details.push({
          rowNumber: rowNum,
          name: rawName,
          email: rawEmail,
          candidateId: rawCandidateId,
          teamNumber: rawTeam,
          accountCreated: false,
          enrolledInContest: false,
          status: "FAILED",
          message: "Participant name is required.",
        });
        continue;
      }

      if (!rawEmail || !emailRegex.test(normalizedEmail)) {
        failedCount++;
        details.push({
          rowNumber: rowNum,
          name: rawName,
          email: rawEmail,
          candidateId: rawCandidateId,
          teamNumber: rawTeam,
          accountCreated: false,
          enrolledInContest: false,
          status: "FAILED",
          message: `Invalid email address format: "${rawEmail}".`,
        });
        continue;
      }

      if (!rawPassword) {
        failedCount++;
        details.push({
          rowNumber: rowNum,
          name: rawName,
          email: rawEmail,
          candidateId: rawCandidateId,
          teamNumber: rawTeam,
          accountCreated: false,
          enrolledInContest: false,
          status: "FAILED",
          message: "Initial password / CL code is required.",
        });
        continue;
      }

      if (!rawTeam) {
        failedCount++;
        details.push({
          rowNumber: rowNum,
          name: rawName,
          email: rawEmail,
          candidateId: rawCandidateId,
          teamNumber: rawTeam,
          accountCreated: false,
          enrolledInContest: false,
          status: "FAILED",
          message: "Team number is required.",
        });
        continue;
      }

      if (seenEmails.has(normalizedEmail)) {
        failedCount++;
        details.push({
          rowNumber: rowNum,
          name: rawName,
          email: rawEmail,
          candidateId: rawCandidateId,
          teamNumber: rawTeam,
          accountCreated: false,
          enrolledInContest: false,
          status: "FAILED",
          message: `Duplicate email in upload file: "${rawEmail}".`,
        });
        continue;
      }
      seenEmails.add(normalizedEmail);

      if (normalizedCandidateId && seenCandidateIds.has(normalizedCandidateId)) {
        failedCount++;
        details.push({
          rowNumber: rowNum,
          name: rawName,
          email: rawEmail,
          candidateId: rawCandidateId,
          teamNumber: rawTeam,
          accountCreated: false,
          enrolledInContest: false,
          status: "FAILED",
          message: `Duplicate Candidate ID / CL Code in upload file: "${rawCandidateId}".`,
        });
        continue;
      }
      if (normalizedCandidateId) {
        seenCandidateIds.add(normalizedCandidateId);
      }

      // Check candidate ID collision in DB
      if (normalizedCandidateId) {
        const existingCidUser = await prisma.user.findUnique({
          where: { candidateId: normalizedCandidateId },
          select: { id: true, email: true },
        });
        if (existingCidUser && existingCidUser.email.toLowerCase() !== normalizedEmail) {
          failedCount++;
          details.push({
            rowNumber: rowNum,
            name: rawName,
            email: rawEmail,
            candidateId: rawCandidateId,
            teamNumber: rawTeam,
            accountCreated: false,
            enrolledInContest: false,
            status: "FAILED",
            message: `Candidate ID "${rawCandidateId}" is already registered to user ${existingCidUser.email}.`,
          });
          continue;
        }
      }

      const existingUser = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true, email: true, name: true, candidateId: true, institution: true },
      });

      if (existingUser) {
        if (contestId && enrollExistingAccounts) {
          try {
            const existingEnrollment = await prisma.contestParticipant.findUnique({
              where: {
                contestId_userId: {
                  contestId,
                  userId: existingUser.id,
                },
              },
            });

            if (existingEnrollment) {
              skippedCount++;
              details.push({
                rowNumber: rowNum,
                name: existingUser.name,
                email: existingUser.email,
                candidateId: existingUser.candidateId || rawCandidateId,
                teamNumber: existingUser.institution || rawTeam,
                accountCreated: false,
                enrolledInContest: false,
                status: "SKIPPED_EXISTING",
                message: `Account already exists and is already enrolled in "${contestTitle || "contest"}".`,
              });
            } else {
              await prisma.contestParticipant.create({
                data: {
                  contestId,
                  userId: existingUser.id,
                  status: ParticipantStatus.ACTIVE,
                },
              });
              enrolledCount++;
              details.push({
                rowNumber: rowNum,
                name: existingUser.name,
                email: existingUser.email,
                candidateId: existingUser.candidateId || rawCandidateId,
                teamNumber: existingUser.institution || rawTeam,
                accountCreated: false,
                enrolledInContest: true,
                status: "ENROLLED_EXISTING",
                message: `Existing account enrolled into contest "${contestTitle || contestId}".`,
              });
            }
          } catch (enrollErr) {
            failedCount++;
            details.push({
              rowNumber: rowNum,
              name: existingUser.name,
              email: existingUser.email,
              candidateId: existingUser.candidateId || rawCandidateId,
              teamNumber: existingUser.institution || rawTeam,
              accountCreated: false,
              enrolledInContest: false,
              status: "FAILED",
              message: `Failed to enroll existing account: ${enrollErr instanceof Error ? enrollErr.message : "Database error"}`,
            });
          }
        } else {
          skippedCount++;
          details.push({
            rowNumber: rowNum,
            name: existingUser.name,
            email: existingUser.email,
            candidateId: existingUser.candidateId || rawCandidateId,
            teamNumber: existingUser.institution || rawTeam,
            accountCreated: false,
            enrolledInContest: false,
            status: "SKIPPED_EXISTING",
            message: "Account already exists in system database. Skipped.",
          });
        }
        continue;
      }

      // Create new participant account
      let createdUser: { id: string; email: string; name: string } | null = null;
      try {
        const { hash, salt } = hashPassword(rawPassword.trim());
        const userId = crypto.randomUUID();

        createdUser = await prisma.user.create({
          data: {
            id: userId,
            email: normalizedEmail,
            name: rawName,
            role: UserRole.PARTICIPANT,
            candidateId: normalizedCandidateId || rawCandidateId,
            institution: rawTeam,
            cohortId: activeCohort?.id,
            passwordHash: hash,
            passwordSalt: salt,
            mustChangePassword: true,
            isActive: true,
          },
          select: { id: true, email: true, name: true },
        });
        createdCount++;
      } catch (createErr) {
        failedCount++;
        details.push({
          rowNumber: rowNum,
          name: rawName,
          email: normalizedEmail,
          candidateId: rawCandidateId,
          teamNumber: rawTeam,
          accountCreated: false,
          enrolledInContest: false,
          status: "FAILED",
          message: `Failed to create participant account: ${createErr instanceof Error ? createErr.message : "Database error"}`,
        });
        continue;
      }

      // Contest enrollment
      if (contestId && createdUser) {
        try {
          await prisma.contestParticipant.create({
            data: {
              contestId,
              userId: createdUser.id,
              status: ParticipantStatus.ACTIVE,
            },
          });
          enrolledCount++;
          details.push({
            rowNumber: rowNum,
            name: rawName,
            email: normalizedEmail,
            candidateId: rawCandidateId,
            teamNumber: rawTeam,
            accountCreated: true,
            enrolledInContest: true,
            status: "CREATED_AND_ENROLLED",
            message: `Account created and enrolled in "${contestTitle || "contest"}".`,
          });
        } catch (enrollErr) {
          partialErrorCount++;
          details.push({
            rowNumber: rowNum,
            name: rawName,
            email: normalizedEmail,
            candidateId: rawCandidateId,
            teamNumber: rawTeam,
            accountCreated: true,
            enrolledInContest: false,
            status: "PARTIAL_ERROR",
            message: `Account created successfully, but contest enrollment failed: ${enrollErr instanceof Error ? enrollErr.message : "Enrollment error"}. Retry enrollment from the contest management panel without recreating the account.`,
          });
        }
      } else {
        details.push({
          rowNumber: rowNum,
          name: rawName,
          email: normalizedEmail,
          candidateId: rawCandidateId,
          teamNumber: rawTeam,
          accountCreated: true,
          enrolledInContest: false,
          status: "CREATED",
          message: "Account created successfully.",
        });
      }
    }

    await recordAuditLog({
      actorId: session.userId,
      action: "BULK_IMPORT_PARTICIPANTS",
      targetType: "USER",
      targetId: contestId || "SYSTEM",
      metadata: {
        totalRows: dataRows.length,
        createdCount,
        enrolledCount,
        skippedCount,
        failedCount,
        partialErrorCount,
        contestId: contestId || null,
        contestTitle: contestTitle || null,
      },
    });

    safeRevalidatePath("/admin/participants");
    safeRevalidatePath("/admin/contests");
    safeRevalidatePath("/dashboard");

    return {
      success: createdCount > 0 || enrolledCount > 0,
      totalRows: dataRows.length,
      createdCount,
      enrolledCount,
      skippedCount,
      failedCount,
      partialErrorCount,
      details,
    };
  } catch (error) {
    console.error("Execute participant import error:", error);
    return {
      success: false,
      totalRows: 0,
      createdCount: 0,
      enrolledCount: 0,
      skippedCount: 0,
      failedCount: 0,
      partialErrorCount: 0,
      details: [],
      error: error instanceof Error ? error.message : "Failed to execute participant import.",
    };
  }
}
