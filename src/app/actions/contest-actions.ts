"use server";

import { prisma } from "@/lib/prisma";
import { ContestStatus, ParticipantStatus, PhaseStatus, UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import {
  formatContestStatusForUi,
  normalizeContestStatus,
  isContestActive,
  isContestConcluded,
  parseDhakaDateTime,
} from "@/lib/contest-lifecycle";

export interface AdminContestListItem {
  id: string;
  slug: string;
  name: string;
  stage: string;
  track: string;
  description: string | null;
  status: "Live" | "Draft" | "Completed" | "Archived";
  isPublished: boolean;
  enforceSequentialProgress: boolean;
  cohortText: string;
  cohortSubtext: string;
  submitted: number;
  total: number;
  avgScore: string;
  dates: string;
  startDateIso: string;
  endDateIso: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  rubrics: Array<{ name: string; weight: number; passRate: number }>;
  recentUploads: Array<{ name: string; time: string; score?: string }>;
  participants: Array<{ id: string; userId: string; name: string; email: string; status: string; enrolledAt: string }>;
}

export interface AdminContestOption {
  id: string;
  title: string;
  track: string;
  status: string;
}

/**
 * Ultra-fast contest options query for dropdown selectors across admin and evaluator panels.
 * Avoids heavy multi-table joins.
 */
export async function getAdminContestOptions(): Promise<AdminContestOption[]> {
  try {
    const session = await requireRole(["ADMIN", "EVALUATOR"]);
    let whereClause = {};
    if (session.role === "EVALUATOR") {
      const evalUser = await prisma.user.findFirst({
        where: { OR: [{ id: session.userId }, { email: session.email }] },
        include: { contestEvaluations: { select: { contestId: true } } },
      });
      const contestIds = evalUser?.contestEvaluations.map((c) => c.contestId) || [];
      whereClause = { id: { in: contestIds } };
    }
    return await prisma.contest.findMany({
      where: whereClause,
      select: {
        id: true,
        title: true,
        track: true,
        status: true,
      },
      orderBy: { createdAt: "desc" },
    });
  } catch (err) {
    console.error("Failed to load contest options:", err);
    return [];
  }
}

export interface AdminOverviewSummaryResult {
  scope: string; // "ALL" or specific contestId
  selectedContestTitle?: string;
  totalEnrolled: number; // Unique enrolled candidates for the selected scope
  globalUniqueEnrolled: number; // Total unique candidates enrolled across any contest (never double-counted)
  contestSpecificEnrollments: number; // Enrollments in the specified contest (or 0 if ALL)
  activeContests: number;
  totalContests: number;
  submittedCount: number;
  unsubmittedCount: number;
  pendingEvaluationCount: number;
  finalizedCount: number;
}

/**
 * Fast scalar counts for admin overview metrics.
 * Prevents double-counting candidates enrolled across multiple contests in global totals,
 * and scopes to specific contests when requested.
 */
export async function getAdminOverviewSummaryAction(
  contestId?: string
): Promise<AdminOverviewSummaryResult> {
  try {
    await requireRole(["ADMIN"]);

    const targetContestId = contestId && contestId !== "ALL" ? contestId : undefined;

    let globalUniqueParticipants: Array<{ userId: string }>;
    let totalContests: number;
    let contests: Array<{ id: string; status: ContestStatus; startDate: Date; endDate: Date }>;
    let targetContest: { id: string; title: string } | null = null;
    let contestParticipants: Array<{ userId: string }> = [];
    let submissions: Array<{ userId: string; status: string }>;

    if (targetContestId) {
      const [pUnique, tCount, cList, tContest, cParticipants, cSubmissions] = await Promise.all([
        prisma.contestParticipant.findMany({
          select: { userId: true },
          distinct: ["userId"],
        }),
        prisma.contest.count(),
        prisma.contest.findMany({ select: { id: true, status: true, startDate: true, endDate: true } }),
        prisma.contest.findUnique({
          where: { id: targetContestId },
          select: { id: true, title: true },
        }),
        prisma.contestParticipant.findMany({
          where: { contestId: targetContestId },
          select: { userId: true },
          distinct: ["userId"],
        }),
        prisma.submission.findMany({
          where: {
            contestId: targetContestId,
            status: { not: "DRAFT" },
          },
          select: {
            userId: true,
            status: true,
          },
        }),
      ]);
      globalUniqueParticipants = pUnique;
      totalContests = tCount;
      contests = cList;
      targetContest = tContest;
      contestParticipants = cParticipants;
      submissions = cSubmissions;
    } else {
      const [pUnique, tCount, cList, allSubmissions] = await Promise.all([
        prisma.contestParticipant.findMany({
          select: { userId: true },
          distinct: ["userId"],
        }),
        prisma.contest.count(),
        prisma.contest.findMany({ select: { id: true, status: true, startDate: true, endDate: true } }),
        prisma.submission.findMany({
          where: { status: { not: "DRAFT" } },
          select: { userId: true, status: true },
        }),
      ]);
      globalUniqueParticipants = pUnique;
      totalContests = tCount;
      contests = cList;
      submissions = allSubmissions;
    }

    const globalUniqueEnrolled = globalUniqueParticipants.length;
    const now = new Date();
    const activeContests = contests.filter((c) => isContestActive(c, now)).length;

    let totalEnrolled = globalUniqueEnrolled;
    let contestSpecificEnrollments = 0;
    let selectedContestTitle: string | undefined = undefined;
    let submittedCount = 0;
    let unsubmittedCount = 0;
    let pendingEvaluationCount = 0;
    let finalizedCount = 0;

    if (targetContestId && targetContest) {
      selectedContestTitle = targetContest.title;
      contestSpecificEnrollments = contestParticipants.length;
      totalEnrolled = contestSpecificEnrollments;

      const userSubmissions = new Map<string, string[]>();
      for (const s of submissions) {
        if (!userSubmissions.has(s.userId)) userSubmissions.set(s.userId, []);
        userSubmissions.get(s.userId)!.push(s.status);
      }

      submittedCount = userSubmissions.size;
      unsubmittedCount = Math.max(0, totalEnrolled - submittedCount);

      for (const [, statuses] of userSubmissions.entries()) {
        const isGraded = statuses.every((st) => st === "GRADED" || st === "PUBLISHED");
        if (isGraded) {
          finalizedCount++;
        } else {
          pendingEvaluationCount++;
        }
      }
    } else {
      // Global scope across all contests
      const userSubmissions = new Map<string, string[]>();
      for (const s of submissions) {
        if (!userSubmissions.has(s.userId)) userSubmissions.set(s.userId, []);
        userSubmissions.get(s.userId)!.push(s.status);
      }

      submittedCount = userSubmissions.size;
      unsubmittedCount = Math.max(0, totalEnrolled - submittedCount);

      for (const [, statuses] of userSubmissions.entries()) {
        const isGraded = statuses.every((st) => st === "GRADED" || st === "PUBLISHED");
        if (isGraded) {
          finalizedCount++;
        } else {
          pendingEvaluationCount++;
        }
      }
    }

    return {
      scope: targetContestId || "ALL",
      selectedContestTitle,
      totalEnrolled,
      globalUniqueEnrolled,
      contestSpecificEnrollments,
      activeContests,
      totalContests,
      submittedCount,
      unsubmittedCount,
      pendingEvaluationCount,
      finalizedCount,
    };
  } catch (err) {
    console.error("Failed to load overview summary:", err);
    return {
      scope: contestId || "ALL",
      totalEnrolled: 0,
      globalUniqueEnrolled: 0,
      contestSpecificEnrollments: 0,
      totalContests: 0,
      activeContests: 0,
      submittedCount: 0,
      unsubmittedCount: 0,
      pendingEvaluationCount: 0,
      finalizedCount: 0,
    };
  }
}

export async function getAdminContests(): Promise<AdminContestListItem[]> {
  try {
    await requireRole(["ADMIN"]);

    const contests = await prisma.contest.findMany({
      select: {
        id: true,
        slug: true,
        title: true,
        track: true,
        description: true,
        status: true,
        isPublished: true,
        enforceSequentialProgress: true,
        startDate: true,
        endDate: true,
        cohort: {
          select: { name: true },
        },
        phases: {
          select: {
            id: true,
            phaseNumber: true,
            title: true,
            status: true,
            tasks: {
              select: {
                id: true,
                rubrics: {
                  select: { name: true, weightPercentage: true },
                },
              },
            },
          },
          orderBy: { phaseNumber: "asc" },
        },
        submissions: {
          select: {
            id: true,
            status: true,
            finalScore: true,
            submittedAt: true,
            user: {
              select: { name: true, email: true },
            },
          },
          orderBy: { submittedAt: "desc" },
          take: 20,
        },
        _count: {
          select: {
            participants: true,
          },
        },
        participants: {
          select: {
            id: true,
            userId: true,
            status: true,
            enrolledAt: true,
            user: {
              select: { name: true, email: true },
            },
          },
          orderBy: { enrolledAt: "desc" },
          take: 100,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const now = new Date();
    return contests.map((c) => {
      // Format status using shared lifecycle rules
      let uiStatus = formatContestStatusForUi(c.status);
      if (normalizeContestStatus(c.status) === ContestStatus.LIVE && isContestConcluded(c, now)) {
        uiStatus = "Completed";
      }

      // Current stage string
      const activePhase = c.phases.find((p) => p.status === PhaseStatus.OPEN) || c.phases[0];
      const stageText = activePhase
        ? `Phase ${activePhase.phaseNumber}: ${activePhase.title}`
        : "Initial Setup";

      // Calculate submissions vs total participants using database counts
      const totalParticipants = c._count?.participants ?? c.participants.length;
      const submittedCount = c.submissions.filter((s) => s.status !== "DRAFT").length;

      // Rubrics from tasks
      const allRubrics = c.phases.flatMap((p) => p.tasks.flatMap((t) => t.rubrics));
      const rubrics = allRubrics.length > 0
        ? allRubrics.slice(0, 3).map((r) => ({
            name: r.name,
            weight: Number(r.weightPercentage),
            passRate: 85, // median benchmark
          }))
        : [
            { name: "Analytical Depth & Quantitative Proof", weight: 40, passRate: 91 },
            { name: "ESG Alignment & Global Compliance", weight: 35, passRate: 78 },
            { name: "Executive Communication & Defense", weight: 25, passRate: 88 },
          ];

      // Format date window (displaying Asia/Dhaka schedule)
      const startStr = c.startDate.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "Asia/Dhaka" });
      const endStr = c.endDate.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "Asia/Dhaka" });
      const dateWindow = `${startStr} – ${endStr} (BST)`;

      // Recent uploads
      const recentUploads = c.submissions
        .filter((s) => s.submittedAt !== null)
        .slice(0, 3)
        .map((s) => ({
          name: s.user.name || s.user.email,
          time: s.submittedAt ? s.submittedAt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dhaka" }) : "Recently",
          score: s.finalScore ? `${s.finalScore}/100` : undefined,
        }));

      // Map participant list
      const participants = c.participants.map((p) => ({
        id: p.id,
        userId: p.userId,
        name: p.user.name || p.user.email,
        email: p.user.email,
        status: p.status,
        enrolledAt: p.enrolledAt.toISOString(),
      }));

      return {
        id: c.id,
        slug: c.slug,
        name: c.title,
        stage: stageText,
        track: c.track,
        description: c.description,
        status: uiStatus,
        isPublished: c.isPublished,
        enforceSequentialProgress: c.enforceSequentialProgress ?? true,
        cohortText: c.cohort?.name || "Global Leadership Cohort",
        cohortSubtext: `${totalParticipants} Enrolled Candidate${totalParticipants === 1 ? "" : "s"}`,
        submitted: submittedCount,
        total: totalParticipants > 0 ? totalParticipants : 1,
        avgScore: "84.2",
        dates: dateWindow,
        startDateIso: c.startDate.toISOString(),
        endDateIso: c.endDate.toISOString(),
        icon: c.track.toLowerCase().includes("esg") || c.track.toLowerCase().includes("sustain") ? "eco" : "psychology",
        iconBg: "bg-primary-fixed/40",
        iconColor: "text-primary-container",
        rubrics,
        recentUploads,
        participants,
      };
    });
  } catch (error) {
    console.error("Error fetching admin contests:", error);
    return [];
  }
}

export interface CreateContestInput {
  title: string;
  track: string;
  description?: string;
  startDate: string;
  endDate: string;
  status?: "DRAFT" | "LIVE";
  cohortCode?: string;
  enforceSequentialProgress?: boolean;
}

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Standalone runner / test environment fallback
  }
}

export async function createContestAction(input: CreateContestInput) {
  try {
    await requireRole(["ADMIN"]);

    if (!input.title || !input.track || !input.startDate || !input.endDate) {
      return { success: false, error: "Title, track, start date, and end date are required." };
    }

    // Generate unique slug
    const baseSlug = input.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 50);
    const uniqueSuffix = Math.random().toString(36).substring(2, 6);
    const slug = `${baseSlug}-${uniqueSuffix}`;

    // Cohort resolution
    const cohortCode = input.cohortCode || "CLP-2025";
    const cohort = await prisma.cohort.upsert({
      where: { code: cohortCode },
      update: {},
      create: {
        code: cohortCode,
        name: "Campus Leadership Programme 2025 (Cohort)",
        institutionCount: 12,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
      },
    });

    const contestStatus =
      input.status === "LIVE" ? ContestStatus.LIVE : ContestStatus.DRAFT;

    const startDate = parseDhakaDateTime(input.startDate);
    const endDate = parseDhakaDateTime(input.endDate);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return { success: false, error: "Invalid start or end date format." };
    }

    if (endDate <= startDate) {
      return { success: false, error: "Contest end date and time must be after the start date and time." };
    }

    // Create Contest strictly with zero phases and zero tasks (Admin Phase & Task Builder manages curriculum)
    const newContest = await prisma.contest.create({
      data: {
        slug,
        title: input.title,
        track: input.track,
        description: input.description || null,
        status: contestStatus,
        cohortId: cohort.id,
        startDate,
        endDate,
        isPublished: false,
        enforceSequentialProgress: input.enforceSequentialProgress !== false,
      },
    });

    await recordAuditLog({
      action: "CREATE_CONTEST",
      targetType: "CONTEST",
      targetId: newContest.id,
      metadata: { title: newContest.title, track: newContest.track, status: newContest.status },
    });

    safeRevalidatePath("/admin");
    safeRevalidatePath("/admin/contests");
    safeRevalidatePath("/admin/tasks");
    safeRevalidatePath("/assessment");
    safeRevalidatePath("/dashboard");
    safeRevalidatePath("/dashboard/contests");
    safeRevalidatePath("/evaluator");
    safeRevalidatePath("/evaluator/monitoring");
    safeRevalidatePath("/admin/monitoring");

    return { success: true, contestId: newContest.id, slug: newContest.slug };
  } catch (error) {
    console.error("Error creating contest:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to create contest" };
  }
}

export interface AvailableParticipantOption {
  id: string;
  name: string;
  email: string;
  candidateId: string | null;
  institution: string | null;
  isEnrolled: boolean;
}

/**
 * Fetches all existing PARTICIPANT accounts with their current enrollment status for a contest.
 */
export async function getAvailableParticipantsAction(
  contestId: string
): Promise<AvailableParticipantOption[]> {
  try {
    await requireRole(["ADMIN"]);

    const users = await prisma.user.findMany({
      where: { role: UserRole.PARTICIPANT },
      select: {
        id: true,
        name: true,
        email: true,
        candidateId: true,
        institution: true,
        participants: {
          where: { contestId },
          select: { id: true, status: true },
        },
      },
      orderBy: { name: "asc" },
    });

    return users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      candidateId: u.candidateId,
      institution: u.institution,
      isEnrolled: u.participants.length > 0 && u.participants[0].status === ParticipantStatus.ACTIVE,
    }));
  } catch (error) {
    console.error("Error fetching available participants:", error);
    return [];
  }
}

/**
 * Batch enrolls selected existing PARTICIPANT accounts into a contest.
 */
export async function batchEnrollParticipantsAction(
  contestId: string,
  userIds: string[]
): Promise<{ success: boolean; enrolledCount?: number; alreadyEnrolledCount?: number; error?: string }> {
  try {
    const session = await requireRole(["ADMIN"]);

    if (!contestId || !Array.isArray(userIds) || userIds.length === 0) {
      return { success: false, error: "Contest ID and at least one participant selection are required." };
    }

    const contest = await prisma.contest.findUnique({
      where: { id: contestId },
    });
    if (!contest) {
      return { success: false, error: "Contest not found." };
    }

    // Only allow existing participants
    const eligibleUsers = await prisma.user.findMany({
      where: {
        id: { in: userIds },
        role: UserRole.PARTICIPANT,
      },
      select: { id: true, email: true },
    });

    if (eligibleUsers.length === 0) {
      return { success: false, error: "No valid participant accounts found from selection." };
    }

    let enrolledCount = 0;
    let alreadyEnrolledCount = 0;

    for (const u of eligibleUsers) {
      const existing = await prisma.contestParticipant.findUnique({
        where: {
          contestId_userId: { contestId, userId: u.id },
        },
      });

      if (existing) {
        if (existing.status !== ParticipantStatus.ACTIVE) {
          await prisma.contestParticipant.update({
            where: { id: existing.id },
            data: { status: ParticipantStatus.ACTIVE },
          });
          enrolledCount++;
        } else {
          alreadyEnrolledCount++;
        }
      } else {
        await prisma.contestParticipant.create({
          data: {
            contestId,
            userId: u.id,
            status: ParticipantStatus.ACTIVE,
          },
        });
        enrolledCount++;
      }
    }

    await recordAuditLog({
      actorId: session.userId,
      action: "BATCH_ENROLL_PARTICIPANTS",
      targetType: "CONTEST",
      targetId: contestId,
      metadata: { enrolledCount, alreadyEnrolledCount, totalSelected: userIds.length },
    });

    safeRevalidatePath("/admin/contests");
    safeRevalidatePath("/dashboard");

    return {
      success: true,
      enrolledCount,
      alreadyEnrolledCount,
    };
  } catch (error) {
    console.error("Error batch enrolling participants:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to batch enroll participants" };
  }
}

export interface BulkEnrollSummary {
  success: boolean;
  totalRows: number;
  enrolledCount: number;
  skippedCount: number;
  invalidCount: number;
  skipped: Array<{ row: number; identifier: string; reason: string }>;
  invalid: Array<{ row: number; identifier: string; reason: string }>;
  details: Array<{
    row: number;
    identifier: string;
    candidateName?: string;
    status:
      | "ENROLLED"
      | "SKIPPED_ALREADY_ENROLLED"
      | "INVALID_NOT_FOUND"
      | "INVALID_FORMAT"
      | "INVALID_ROLE"
      | "INVALID_MISMATCH";
    reason: string;
  }>;
  error?: string;
}

export interface BulkEnrollPreviewRow {
  row: number;
  identifier: string;
  email?: string;
  candidateId?: string;
  name?: string;
  institution?: string;
  status: "READY" | "ALREADY_ENROLLED" | "INVALID";
  reason: string;
}

export interface BulkEnrollPreviewResult {
  success: boolean;
  totalRows: number;
  readyCount: number;
  alreadyEnrolledCount: number;
  invalidCount: number;
  ready: BulkEnrollPreviewRow[];
  alreadyEnrolled: BulkEnrollPreviewRow[];
  invalid: BulkEnrollPreviewRow[];
  error?: string;
}

interface ParsedCsvRow {
  lineNum: number;
  fields: string[];
}

/**
 * Standard RFC-4180 CSV parser.
 * Handles quoted fields, embedded commas, newlines, and strips UTF-8 BOM.
 * Ignores empty lines and comment lines starting with '#'.
 * Tracks original line numbers for precise error reporting.
 */
function parseEnrollmentCsv(csvText: string): ParsedCsvRow[] {
  const clean = csvText.replace(/^\uFEFF/, "");
  const rows: ParsedCsvRow[] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;
  let lineCounter = 1;
  let rowStartLine = 1;

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    const nextChar = clean[i + 1];

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
      const isNotEmpty = currentRow.some((f) => f.length > 0);
      const isComment = currentRow.length > 0 && currentRow[0].trim().startsWith("#");
      if (isNotEmpty && !isComment) {
        rows.push({ lineNum: rowStartLine, fields: currentRow });
      }
      currentRow = [];
      currentField = "";
      lineCounter++;
      rowStartLine = lineCounter;
    } else {
      if (char === "\n") {
        lineCounter++;
      }
      currentField += char;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    const isNotEmpty = currentRow.some((f) => f.length > 0);
    const isComment = currentRow.length > 0 && currentRow[0].trim().startsWith("#");
    if (isNotEmpty && !isComment) {
      rows.push({ lineNum: rowStartLine, fields: currentRow });
    }
  }

  return rows;
}

interface EvaluatedRow {
  rowNum: number;
  identifier: string;
  email?: string;
  candidateId?: string;
  name?: string;
  institution?: string;
  user?: { id: string; email: string; name: string; candidateId: string | null; institution: string | null };
  status:
    | "READY"
    | "ALREADY_ENROLLED"
    | "INVALID_NOT_FOUND"
    | "INVALID_FORMAT"
    | "INVALID_ROLE"
    | "INVALID_MISMATCH";
  reason: string;
}

/**
 * Validates enrollment CSV rows against database records and contest status.
 * Reusable engine for both Preview and Execution flows.
 */
async function validateEnrollmentCsvRows(
  contestId: string,
  csvText: string
): Promise<{
  success: boolean;
  error?: string;
  totalRows: number;
  evaluated: EvaluatedRow[];
}> {
  if (!contestId) {
    return { success: false, error: "Contest ID is required.", totalRows: 0, evaluated: [] };
  }

  const contest = await prisma.contest.findUnique({ where: { id: contestId } });
  if (!contest) {
    return { success: false, error: "Contest not found.", totalRows: 0, evaluated: [] };
  }

  if (!csvText || !csvText.trim()) {
    return { success: false, error: "CSV file content is empty.", totalRows: 0, evaluated: [] };
  }

  const parsed = parseEnrollmentCsv(csvText.trim());
  if (parsed.length < 2) {
    return {
      success: false,
      error: "CSV must contain at least a header row and one participant row.",
      totalRows: 0,
      evaluated: [],
    };
  }

  const header = parsed[0].fields.map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const emailIdx = header.findIndex(
    (h) => h === "email" || h === "emailaddress" || h.includes("email")
  );
  const candidateIdIdx = header.findIndex(
    (h) =>
      h === "candidateid" ||
      h === "candidate" ||
      h === "candidatecode" ||
      h === "institutionalid" ||
      h === "institutionid" ||
      h === "studentid" ||
      (h.includes("candidate") && h.includes("id"))
  );

  if (emailIdx === -1 && candidateIdIdx === -1) {
    return {
      success: false,
      error: "CSV header must contain an 'Email' or 'CandidateId' column.",
      totalRows: parsed.length - 1,
      evaluated: [],
    };
  }

  const evaluated: EvaluatedRow[] = [];
  const seenUserIds = new Map<string, number>();
  const seenIdentifiersInFile = new Map<string, number>();

  for (let i = 1; i < parsed.length; i++) {
    const row = parsed[i];
    const rowNum = row.lineNum;
    const rawEmail = emailIdx !== -1 ? (row.fields[emailIdx] || "").trim() : "";
    const rawCandidateId = candidateIdIdx !== -1 ? (row.fields[candidateIdIdx] || "").trim() : "";

    const hasEmail = rawEmail.length > 0;
    const hasCandidateId = rawCandidateId.length > 0;

    const displayIdentifier =
      hasEmail && hasCandidateId
        ? `${rawEmail} / ${rawCandidateId}`
        : rawEmail || rawCandidateId || `Row ${rowNum}`;

    if (!hasEmail && !hasCandidateId) {
      evaluated.push({
        rowNum,
        identifier: `Row ${rowNum}`,
        status: "INVALID_FORMAT",
        reason: "Missing identifier. Each row must provide an Email, a Candidate ID, or both.",
      });
      continue;
    }

    // In-file duplicate check on raw values
    const fileKey = `${rawEmail.toLowerCase()}|${rawCandidateId.toLowerCase()}`;
    if (seenIdentifiersInFile.has(fileKey)) {
      const firstLine = seenIdentifiersInFile.get(fileKey)!;
      evaluated.push({
        rowNum,
        identifier: displayIdentifier,
        email: rawEmail || undefined,
        candidateId: rawCandidateId || undefined,
        status: "ALREADY_ENROLLED",
        reason: `Duplicate entry in CSV file (same as row ${firstLine}).`,
      });
      continue;
    }
    seenIdentifiersInFile.set(fileKey, rowNum);

    const normalizedEmail = rawEmail.toLowerCase();
    const trimmedCandidateId = rawCandidateId;

    // Both Email and CandidateId provided -> strict matching verification
    if (hasEmail && hasCandidateId) {
      const userByEmail = await prisma.user.findFirst({
        where: { email: { equals: normalizedEmail, mode: "insensitive" } },
        select: { id: true, email: true, name: true, role: true, candidateId: true, institution: true },
      });

      const userByCandidateId = await prisma.user.findFirst({
        where: { candidateId: { equals: trimmedCandidateId, mode: "insensitive" } },
        select: { id: true, email: true, name: true, role: true, candidateId: true, institution: true },
      });

      if (!userByEmail && !userByCandidateId) {
        evaluated.push({
          rowNum,
          identifier: displayIdentifier,
          email: rawEmail,
          candidateId: rawCandidateId,
          status: "INVALID_NOT_FOUND",
          reason: `Participant account not found. Neither email "${rawEmail}" nor candidate ID "${trimmedCandidateId}" matches an existing account.`,
        });
        continue;
      }

      if (userByEmail && !userByCandidateId) {
        evaluated.push({
          rowNum,
          identifier: displayIdentifier,
          email: rawEmail,
          candidateId: rawCandidateId,
          name: userByEmail.name,
          status: "INVALID_MISMATCH",
          reason: `Email and candidate ID mismatch. Candidate ID "${trimmedCandidateId}" does not match the account for "${rawEmail}"${
            userByEmail.candidateId ? ` (registered as ${userByEmail.candidateId})` : " (account has no registered candidate ID)"
          }.`,
        });
        continue;
      }

      if (!userByEmail && userByCandidateId) {
        evaluated.push({
          rowNum,
          identifier: displayIdentifier,
          email: rawEmail,
          candidateId: rawCandidateId,
          name: userByCandidateId.name,
          status: "INVALID_MISMATCH",
          reason: `Email and candidate ID mismatch. Email "${rawEmail}" does not match the account registered with candidate ID "${trimmedCandidateId}".`,
        });
        continue;
      }

      if (userByEmail && userByCandidateId && userByEmail.id !== userByCandidateId.id) {
        evaluated.push({
          rowNum,
          identifier: displayIdentifier,
          email: rawEmail,
          candidateId: rawCandidateId,
          status: "INVALID_MISMATCH",
          reason: `Email and candidate ID mismatch. Email "${rawEmail}" and candidate ID "${trimmedCandidateId}" belong to different participant accounts.`,
        });
        continue;
      }

      const user = userByEmail!;
      if (user.role !== UserRole.PARTICIPANT) {
        evaluated.push({
          rowNum,
          identifier: `${user.name} (${user.email})`,
          email: user.email,
          candidateId: user.candidateId || undefined,
          name: user.name,
          status: "INVALID_ROLE",
          reason: `Account has role "${user.role}". Only PARTICIPANT accounts can be enrolled in contests.`,
        });
        continue;
      }

      if (seenUserIds.has(user.id)) {
        const firstLine = seenUserIds.get(user.id)!;
        evaluated.push({
          rowNum,
          identifier: `${user.name} (${user.email})`,
          email: user.email,
          candidateId: user.candidateId || undefined,
          name: user.name,
          institution: user.institution || undefined,
          status: "ALREADY_ENROLLED",
          reason: `Duplicate entry in CSV file (same participant as row ${firstLine}).`,
        });
        continue;
      }
      seenUserIds.set(user.id, rowNum);

      const existingEnrollment = await prisma.contestParticipant.findUnique({
        where: { contestId_userId: { contestId, userId: user.id } },
      });

      if (
        existingEnrollment &&
        (existingEnrollment.status === ParticipantStatus.ACTIVE ||
          existingEnrollment.status === ParticipantStatus.ENROLLED)
      ) {
        evaluated.push({
          rowNum,
          identifier: `${user.name} (${user.email})`,
          email: user.email,
          candidateId: user.candidateId || undefined,
          name: user.name,
          institution: user.institution || undefined,
          user,
          status: "ALREADY_ENROLLED",
          reason: "Participant is already actively enrolled in this contest.",
        });
      } else {
        evaluated.push({
          rowNum,
          identifier: `${user.name} (${user.email})`,
          email: user.email,
          candidateId: user.candidateId || undefined,
          name: user.name,
          institution: user.institution || undefined,
          user,
          status: "READY",
          reason: "Matched existing participant account.",
        });
      }
      continue;
    }

    // Only Email provided
    if (hasEmail && !hasCandidateId) {
      const user = await prisma.user.findFirst({
        where: { email: { equals: normalizedEmail, mode: "insensitive" } },
        select: { id: true, email: true, name: true, role: true, candidateId: true, institution: true },
      });

      if (!user) {
        evaluated.push({
          rowNum,
          identifier: rawEmail,
          email: rawEmail,
          status: "INVALID_NOT_FOUND",
          reason: `Participant account with email "${rawEmail}" not found. Only existing PARTICIPANT accounts created by Admin can be enrolled.`,
        });
        continue;
      }

      if (user.role !== UserRole.PARTICIPANT) {
        evaluated.push({
          rowNum,
          identifier: `${user.name} (${user.email})`,
          email: user.email,
          name: user.name,
          status: "INVALID_ROLE",
          reason: `Account with email "${rawEmail}" has role "${user.role}". Only PARTICIPANT accounts can be enrolled in contests.`,
        });
        continue;
      }

      if (seenUserIds.has(user.id)) {
        const firstLine = seenUserIds.get(user.id)!;
        evaluated.push({
          rowNum,
          identifier: `${user.name} (${user.email})`,
          email: user.email,
          candidateId: user.candidateId || undefined,
          name: user.name,
          institution: user.institution || undefined,
          status: "ALREADY_ENROLLED",
          reason: `Duplicate entry in CSV file (same participant as row ${firstLine}).`,
        });
        continue;
      }
      seenUserIds.set(user.id, rowNum);

      const existingEnrollment = await prisma.contestParticipant.findUnique({
        where: { contestId_userId: { contestId, userId: user.id } },
      });

      if (
        existingEnrollment &&
        (existingEnrollment.status === ParticipantStatus.ACTIVE ||
          existingEnrollment.status === ParticipantStatus.ENROLLED)
      ) {
        evaluated.push({
          rowNum,
          identifier: `${user.name} (${user.email})`,
          email: user.email,
          candidateId: user.candidateId || undefined,
          name: user.name,
          institution: user.institution || undefined,
          user,
          status: "ALREADY_ENROLLED",
          reason: "Participant is already actively enrolled in this contest.",
        });
      } else {
        evaluated.push({
          rowNum,
          identifier: `${user.name} (${user.email})`,
          email: user.email,
          candidateId: user.candidateId || undefined,
          name: user.name,
          institution: user.institution || undefined,
          user,
          status: "READY",
          reason: "Matched existing participant account by email.",
        });
      }
      continue;
    }

    // Only CandidateId provided
    if (!hasEmail && hasCandidateId) {
      const user = await prisma.user.findFirst({
        where: { candidateId: { equals: trimmedCandidateId, mode: "insensitive" } },
        select: { id: true, email: true, name: true, role: true, candidateId: true, institution: true },
      });

      if (!user) {
        evaluated.push({
          rowNum,
          identifier: rawCandidateId,
          candidateId: rawCandidateId,
          status: "INVALID_NOT_FOUND",
          reason: `Participant account with candidate ID "${trimmedCandidateId}" not found. Only existing PARTICIPANT accounts created by Admin can be enrolled.`,
        });
        continue;
      }

      if (user.role !== UserRole.PARTICIPANT) {
        evaluated.push({
          rowNum,
          identifier: `${user.name} (${user.candidateId || trimmedCandidateId})`,
          candidateId: user.candidateId || trimmedCandidateId,
          name: user.name,
          status: "INVALID_ROLE",
          reason: `Account with candidate ID "${trimmedCandidateId}" has role "${user.role}". Only PARTICIPANT accounts can be enrolled in contests.`,
        });
        continue;
      }

      if (seenUserIds.has(user.id)) {
        const firstLine = seenUserIds.get(user.id)!;
        evaluated.push({
          rowNum,
          identifier: `${user.name} (${user.email})`,
          email: user.email,
          candidateId: user.candidateId || undefined,
          name: user.name,
          institution: user.institution || undefined,
          status: "ALREADY_ENROLLED",
          reason: `Duplicate entry in CSV file (same participant as row ${firstLine}).`,
        });
        continue;
      }
      seenUserIds.set(user.id, rowNum);

      const existingEnrollment = await prisma.contestParticipant.findUnique({
        where: { contestId_userId: { contestId, userId: user.id } },
      });

      if (
        existingEnrollment &&
        (existingEnrollment.status === ParticipantStatus.ACTIVE ||
          existingEnrollment.status === ParticipantStatus.ENROLLED)
      ) {
        evaluated.push({
          rowNum,
          identifier: `${user.name} (${user.email})`,
          email: user.email,
          candidateId: user.candidateId || undefined,
          name: user.name,
          institution: user.institution || undefined,
          user,
          status: "ALREADY_ENROLLED",
          reason: "Participant is already actively enrolled in this contest.",
        });
      } else {
        evaluated.push({
          rowNum,
          identifier: `${user.name} (${user.email})`,
          email: user.email,
          candidateId: user.candidateId || undefined,
          name: user.name,
          institution: user.institution || undefined,
          user,
          status: "READY",
          reason: "Matched existing participant account by candidate ID.",
        });
      }
      continue;
    }
  }

  return {
    success: true,
    totalRows: parsed.length - 1,
    evaluated,
  };
}

/**
 * Preview action: parses CSV and inspects existing database accounts without modifying enrollments.
 */
export async function previewEnrollmentCsvAction(
  contestId: string,
  csvText: string
): Promise<BulkEnrollPreviewResult> {
  try {
    await requireRole(["ADMIN"]);

    const val = await validateEnrollmentCsvRows(contestId, csvText);
    if (!val.success) {
      return {
        success: false,
        totalRows: val.totalRows,
        readyCount: 0,
        alreadyEnrolledCount: 0,
        invalidCount: 0,
        ready: [],
        alreadyEnrolled: [],
        invalid: [],
        error: val.error,
      };
    }

    const ready: BulkEnrollPreviewRow[] = [];
    const alreadyEnrolled: BulkEnrollPreviewRow[] = [];
    const invalid: BulkEnrollPreviewRow[] = [];

    for (const item of val.evaluated) {
      if (item.status === "READY") {
        ready.push({
          row: item.rowNum,
          identifier: item.identifier,
          email: item.email,
          candidateId: item.candidateId,
          name: item.name,
          institution: item.institution,
          status: "READY",
          reason: item.reason,
        });
      } else if (item.status === "ALREADY_ENROLLED") {
        alreadyEnrolled.push({
          row: item.rowNum,
          identifier: item.identifier,
          email: item.email,
          candidateId: item.candidateId,
          name: item.name,
          institution: item.institution,
          status: "ALREADY_ENROLLED",
          reason: item.reason,
        });
      } else {
        invalid.push({
          row: item.rowNum,
          identifier: item.identifier,
          email: item.email,
          candidateId: item.candidateId,
          name: item.name,
          status: "INVALID",
          reason: item.reason,
        });
      }
    }

    return {
      success: true,
      totalRows: val.totalRows,
      readyCount: ready.length,
      alreadyEnrolledCount: alreadyEnrolled.length,
      invalidCount: invalid.length,
      ready,
      alreadyEnrolled,
      invalid,
    };
  } catch (error) {
    console.error("Error previewing CSV:", error);
    return {
      success: false,
      totalRows: 0,
      readyCount: 0,
      alreadyEnrolledCount: 0,
      invalidCount: 0,
      ready: [],
      alreadyEnrolled: [],
      invalid: [],
      error: error instanceof Error ? error.message : "Failed to preview CSV enrollment",
    };
  }
}

/**
 * Bulk enrolls existing participants into a contest using CSV text.
 * Strictly verifies existing accounts; never creates implicit accounts.
 * Idempotently enrolls valid candidates and skips already enrolled accounts.
 */
export async function bulkEnrollParticipantsCsvAction(
  contestId: string,
  csvText: string
): Promise<BulkEnrollSummary> {
  try {
    const session = await requireRole(["ADMIN"]);

    const val = await validateEnrollmentCsvRows(contestId, csvText);
    if (!val.success) {
      return {
        success: false,
        totalRows: val.totalRows,
        enrolledCount: 0,
        skippedCount: 0,
        invalidCount: val.totalRows,
        skipped: [],
        invalid: [],
        details: [],
        error: val.error,
      };
    }

    let enrolledCount = 0;
    let skippedCount = 0;
    let invalidCount = 0;

    const details: BulkEnrollSummary["details"] = [];
    const skipped: BulkEnrollSummary["skipped"] = [];
    const invalid: BulkEnrollSummary["invalid"] = [];

    for (const item of val.evaluated) {
      if (item.status === "READY" && item.user) {
        await prisma.contestParticipant.upsert({
          where: {
            contestId_userId: {
              contestId,
              userId: item.user.id,
            },
          },
          update: {
            status: ParticipantStatus.ACTIVE,
          },
          create: {
            contestId,
            userId: item.user.id,
            status: ParticipantStatus.ACTIVE,
          },
        });

        enrolledCount++;
        details.push({
          row: item.rowNum,
          identifier: item.identifier,
          candidateName: item.name,
          status: "ENROLLED",
          reason: "Enrolled successfully.",
        });
      } else if (item.status === "ALREADY_ENROLLED") {
        skippedCount++;
        details.push({
          row: item.rowNum,
          identifier: item.identifier,
          candidateName: item.name,
          status: "SKIPPED_ALREADY_ENROLLED",
          reason: item.reason,
        });
        skipped.push({
          row: item.rowNum,
          identifier: item.identifier,
          reason: item.reason,
        });
      } else {
        invalidCount++;
        details.push({
          row: item.rowNum,
          identifier: item.identifier,
          candidateName: item.name,
          status: item.status === "READY" ? "INVALID_FORMAT" : item.status,
          reason: item.reason,
        });
        invalid.push({
          row: item.rowNum,
          identifier: item.identifier,
          reason: item.reason,
        });
      }
    }

    await recordAuditLog({
      actorId: session.userId,
      action: "BULK_CSV_ENROLL_PARTICIPANTS",
      targetType: "CONTEST",
      targetId: contestId,
      metadata: { enrolledCount, skippedCount, invalidCount, totalRows: val.totalRows },
    });

    safeRevalidatePath("/admin/contests");
    safeRevalidatePath("/admin/participants");
    safeRevalidatePath("/dashboard");

    return {
      success: true,
      totalRows: val.totalRows,
      enrolledCount,
      skippedCount,
      invalidCount,
      skipped,
      invalid,
      details,
    };
  } catch (error) {
    console.error("Error bulk enrolling CSV:", error);
    return {
      success: false,
      totalRows: 0,
      enrolledCount: 0,
      skippedCount: 0,
      invalidCount: 0,
      skipped: [],
      invalid: [],
      details: [],
      error: error instanceof Error ? error.message : "Failed to bulk enroll participants via CSV",
    };
  }
}

export async function assignParticipantAction(contestId: string, email: string, _name?: string) {
  try {
    await requireRole(["ADMIN"]);

    if (!contestId || !email) {
      return { success: false, error: "Contest ID and participant email are required." };
    }

    const trimmedEmail = email.trim().toLowerCase();

    // 1. Strict verification: only enroll existing accounts
    const user = await prisma.user.findUnique({
      where: { email: trimmedEmail },
    });

    if (!user) {
      return {
        success: false,
        error: `Participant account not found for "${trimmedEmail}". Please create the participant account in User Management first.`,
      };
    }

    if (user.role !== UserRole.PARTICIPANT) {
      return {
        success: false,
        error: `User "${trimmedEmail}" has role "${user.role}" and cannot be enrolled as a contest participant.`,
      };
    }

    // 2. Check if contest exists
    const contest = await prisma.contest.findUnique({
      where: { id: contestId },
    });

    if (!contest) {
      return { success: false, error: "Contest not found." };
    }

    // 3. Upsert ContestParticipant record
    const participant = await prisma.contestParticipant.upsert({
      where: {
        contestId_userId: {
          contestId: contest.id,
          userId: user.id,
        },
      },
      update: {
        status: ParticipantStatus.ACTIVE,
      },
      create: {
        contestId: contest.id,
        userId: user.id,
        status: ParticipantStatus.ACTIVE,
      },
    });

    await recordAuditLog({
      action: "ASSIGN_PARTICIPANT",
      targetType: "CONTEST",
      targetId: contest.id,
      metadata: { participantEmail: trimmedEmail, participantId: participant.id },
    });

    safeRevalidatePath("/admin/contests");
    safeRevalidatePath("/dashboard");

    return {
      success: true,
      participantId: participant.id,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    };
  } catch (error) {
    console.error("Error assigning participant:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to assign participant" };
  }
}

export interface UpdateContestInput {
  title?: string;
  track?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  status?: "DRAFT" | "LIVE" | "COMPLETED" | "ARCHIVED";
  isPublished?: boolean;
  enforceSequentialProgress?: boolean;
}

export async function updateContestAction(contestId: string, input: UpdateContestInput) {
  try {
    const session = await requireRole(["ADMIN"]);

    const contest = await prisma.contest.findUnique({
      where: { id: contestId },
    });

    if (!contest) {
      return { success: false, error: "Contest not found." };
    }

    const updated = await prisma.contest.update({
      where: { id: contestId },
      data: {
        ...(input.title !== undefined && { title: input.title.trim() }),
        ...(input.track !== undefined && { track: input.track.trim() }),
        ...(input.description !== undefined && { description: input.description.trim() || null }),
        ...(input.startDate !== undefined && { startDate: parseDhakaDateTime(input.startDate) }),
        ...(input.endDate !== undefined && { endDate: parseDhakaDateTime(input.endDate) }),
        ...(input.status !== undefined && { status: normalizeContestStatus(input.status) }),
        ...(input.isPublished !== undefined && { isPublished: input.isPublished }),
        ...(input.enforceSequentialProgress !== undefined && { enforceSequentialProgress: input.enforceSequentialProgress }),
      },
    });

    await recordAuditLog({
      actorId: session.userId,
      action: "UPDATE_CONTEST",
      targetType: "CONTEST",
      targetId: contestId,
      metadata: { updatedFields: Object.keys(input) },
    });

    safeRevalidatePath("/admin");
    safeRevalidatePath("/admin/contests");
    safeRevalidatePath("/admin/tasks");
    safeRevalidatePath("/assessment");
    safeRevalidatePath("/dashboard");
    safeRevalidatePath("/dashboard/contests");
    safeRevalidatePath("/evaluator");
    safeRevalidatePath("/evaluator/monitoring");
    safeRevalidatePath("/admin/monitoring");
    safeRevalidatePath("/leaderboard");
    safeRevalidatePath("/results");

    return { success: true, contest: updated };
  } catch (error) {
    console.error("Error updating contest:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to update contest" };
  }
}

export async function updateContestStatusAction(
  contestId: string,
  status: "DRAFT" | "LIVE" | "COMPLETED" | "ARCHIVED"
) {
  return updateContestAction(contestId, { status });
}

export async function removeParticipantAction(contestId: string, userId: string) {
  try {
    const session = await requireRole(["ADMIN"]);

    await prisma.contestParticipant.deleteMany({
      where: {
        contestId,
        userId,
      },
    });

    await recordAuditLog({
      actorId: session.userId,
      action: "REMOVE_PARTICIPANT",
      targetType: "CONTEST",
      targetId: contestId,
      metadata: { removedUserId: userId },
    });

    safeRevalidatePath("/admin/contests");
    safeRevalidatePath("/dashboard");

    return { success: true };
  } catch (error) {
    console.error("Error removing participant:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to remove participant" };
  }
}

export async function deleteContestAction(contestId: string) {
  try {
    const session = await requireRole(["ADMIN"]);

    await prisma.contest.delete({
      where: { id: contestId },
    });

    await recordAuditLog({
      actorId: session.userId,
      action: "DELETE_CONTEST",
      targetType: "CONTEST",
      targetId: contestId,
    });

    safeRevalidatePath("/admin/contests");
    safeRevalidatePath("/dashboard");

    return { success: true };
  } catch (error) {
    console.error("Error deleting contest:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to delete contest" };
  }
}
