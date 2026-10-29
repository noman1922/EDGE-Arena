"use server";

import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import {
  hashPassword,
  validatePasswordStrength,
} from "@/lib/credentials";
import { logSystemError } from "@/lib/error-logger";
import { revalidatePath } from "next/cache";

export interface EvaluatorAccount {
  id: string;
  name: string;
  email: string;
  role: string;
  institution?: string | null;
  candidateId?: string | null;
  mustChangePassword: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface CreateEvaluatorInput {
  name: string;
  email: string;
  password: string;
  institution?: string;
  evaluatorId?: string;
}

export interface CsvImportResult {
  success: boolean;
  totalRows: number;
  createdCount: number;
  skippedCount: number;
  failedCount: number;
  failedRows: Array<{
    rowNumber: number;
    email: string;
    reason: string;
  }>;
  error?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function getAdminEvaluators(): Promise<EvaluatorAccount[]> {
  await requireRole(["ADMIN"]);

  const users = await prisma.user.findMany({
    where: { role: "EVALUATOR" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      institution: true,
      candidateId: true,
      mustChangePassword: true,
      isActive: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    institution: u.institution,
    candidateId: u.candidateId,
    mustChangePassword: Boolean(u.mustChangePassword),
    isActive: u.isActive !== false,
    createdAt: u.createdAt.toISOString(),
  }));
}

export async function createEvaluatorAccountAction(input: CreateEvaluatorInput) {
  try {
    await requireRole(["ADMIN"]);

    if (!input.name || !input.name.trim()) {
      return { success: false, error: "Full name is required." };
    }

    if (!input.email || !input.email.trim()) {
      return { success: false, error: "Email address is required." };
    }

    const trimmedEmail = input.email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      return { success: false, error: "Please enter a valid email address." };
    }

    if (!input.password) {
      return { success: false, error: "Initial password is required." };
    }

    const strengthCheck = validatePasswordStrength(input.password);
    if (!strengthCheck.isValid) {
      return { success: false, error: strengthCheck.error || "Password does not meet security requirements." };
    }

    // Check duplicate email
    const existing = await prisma.user.findUnique({
      where: { email: trimmedEmail },
    });
    if (existing) {
      return {
        success: false,
        error: `An account with email "${trimmedEmail}" already exists.`,
      };
    }

    // Check duplicate evaluator ID if provided
    if (input.evaluatorId && input.evaluatorId.trim()) {
      const existingId = await prisma.user.findUnique({
        where: { candidateId: input.evaluatorId.trim() },
      });
      if (existingId) {
        return {
          success: false,
          error: `An account with identifier "${input.evaluatorId.trim()}" already exists.`,
        };
      }
    }

    // Hash password with scrypt
    const { hash, salt } = hashPassword(input.password);

    const user = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        name: input.name.trim(),
        email: trimmedEmail,
        role: "EVALUATOR", // Server-enforced EVALUATOR role
        passwordHash: hash,
        passwordSalt: salt,
        mustChangePassword: true, // First login password change mandatory
        isActive: true,
        institution: input.institution?.trim() || null,
        candidateId: input.evaluatorId?.trim() || null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        institution: true,
        candidateId: true,
      },
    });

    try {
      revalidatePath("/admin/evaluators");
    } catch {}

    return {
      success: true,
      user,
    };
  } catch (error) {
    const sanitized = await logSystemError({
      route: "/admin/evaluators",
      operation: "createEvaluatorAccountAction",
      category: "VALIDATION",
      error,
    });
    return {
      success: false,
      error: sanitized.error,
    };
  }
}

export async function bulkImportEvaluatorsAction(csvContent: string): Promise<CsvImportResult> {
  try {
    await requireRole(["ADMIN"]);

    if (!csvContent || !csvContent.trim()) {
      return {
        success: false,
        totalRows: 0,
        createdCount: 0,
        skippedCount: 0,
        failedCount: 0,
        failedRows: [],
        error: "CSV content is empty.",
      };
    }

    // Limit upload size (max 2MB of text)
    if (csvContent.length > 2 * 1024 * 1024) {
      return {
        success: false,
        totalRows: 0,
        createdCount: 0,
        skippedCount: 0,
        failedCount: 0,
        failedRows: [],
        error: "CSV file exceeds maximum upload size (2MB).",
      };
    }

    const lines = csvContent
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length < 2) {
      return {
        success: false,
        totalRows: 0,
        createdCount: 0,
        skippedCount: 0,
        failedCount: 0,
        failedRows: [],
        error: "CSV must contain a header row and at least one evaluator record.",
      };
    }

    // Parse header
    const headerLine = lines[0].toLowerCase();
    const headers = headerLine.split(",").map((h) => h.trim().replace(/^["']|["']$/g, ""));

    const nameIdx = headers.findIndex((h) => h === "name" || h === "full_name" || h === "fullname");
    const emailIdx = headers.findIndex((h) => h === "email" || h === "email_address");
    const passIdx = headers.findIndex(
      (h) => h === "password" || h === "initial_password" || h === "temp_password"
    );
    const instIdx = headers.findIndex((h) => h === "institution" || h === "organization");
    const idIdx = headers.findIndex((h) => h === "evaluator_id" || h === "evaluatorid" || h === "id");

    if (nameIdx === -1 || emailIdx === -1 || passIdx === -1) {
      return {
        success: false,
        totalRows: lines.length - 1,
        createdCount: 0,
        skippedCount: 0,
        failedCount: 0,
        failedRows: [],
        error: "Missing required CSV columns. Required headers: 'name', 'email', 'password'.",
      };
    }

    const seenEmailsInFile = new Set<string>();
    const failedRows: Array<{ rowNumber: number; email: string; reason: string }> = [];
    const validRowsToCreate: Array<{
      name: string;
      email: string;
      password: string;
      institution?: string;
      candidateId?: string;
    }> = [];

    const dataLines = lines.slice(1);

    for (let i = 0; i < dataLines.length; i++) {
      const rowNumber = i + 2; // 1-indexed, accounting for header
      const line = dataLines[i];
      if (!line) continue;

      // Handle CSV comma splitting safely
      const cols = line.split(",").map((c) => c.trim().replace(/^["']|["']$/g, ""));
      const name = cols[nameIdx] || "";
      const rawEmail = cols[emailIdx] || "";
      const password = cols[passIdx] || "";
      const institution = instIdx !== -1 ? cols[instIdx] : undefined;
      const evaluatorId = idIdx !== -1 ? cols[idIdx] : undefined;

      const normalizedEmail = rawEmail.trim().toLowerCase();

      if (!name) {
        failedRows.push({ rowNumber, email: rawEmail, reason: "Full name is empty." });
        continue;
      }

      if (!normalizedEmail || !EMAIL_REGEX.test(normalizedEmail)) {
        failedRows.push({ rowNumber, email: rawEmail, reason: "Invalid email format." });
        continue;
      }

      if (seenEmailsInFile.has(normalizedEmail)) {
        failedRows.push({
          rowNumber,
          email: normalizedEmail,
          reason: "Duplicate email address within CSV file.",
        });
        continue;
      }
      seenEmailsInFile.add(normalizedEmail);

      const strength = validatePasswordStrength(password);
      if (!strength.isValid) {
        failedRows.push({
          rowNumber,
          email: normalizedEmail,
          reason: strength.error || "Password must be at least 8 characters.",
        });
        continue;
      }

      validRowsToCreate.push({
        name,
        email: normalizedEmail,
        password,
        institution,
        candidateId: evaluatorId,
      });
    }

    // Check existing database records
    let createdCount = 0;
    let skippedCount = 0;

    for (const record of validRowsToCreate) {
      try {
        const existing = await prisma.user.findUnique({
          where: { email: record.email },
        });

        if (existing) {
          skippedCount++;
          failedRows.push({
            rowNumber: 0,
            email: record.email,
            reason: "Account with this email already exists in the database.",
          });
          continue;
        }

        const { hash, salt } = hashPassword(record.password);

        await prisma.user.create({
          data: {
            id: crypto.randomUUID(),
            name: record.name,
            email: record.email,
            role: "EVALUATOR", // Server-side enforced EVALUATOR role
            passwordHash: hash,
            passwordSalt: salt,
            mustChangePassword: true,
            isActive: true,
            institution: record.institution || null,
            candidateId: record.candidateId || null,
          },
        });

        createdCount++;
      } catch (err) {
        skippedCount++;
        failedRows.push({
          rowNumber: 0,
          email: record.email,
          reason: "Failed to persist account to database.",
        });
      }
    }

    try {
      revalidatePath("/admin/evaluators");
    } catch {}

    return {
      success: true,
      totalRows: dataLines.length,
      createdCount,
      skippedCount,
      failedCount: failedRows.length,
      failedRows,
    };
  } catch (error) {
    const sanitized = await logSystemError({
      route: "/admin/evaluators/import",
      operation: "bulkImportEvaluatorsAction",
      category: "VALIDATION",
      error,
    });
    return {
      success: false,
      totalRows: 0,
      createdCount: 0,
      skippedCount: 0,
      failedCount: 0,
      failedRows: [],
      error: sanitized.error,
    };
  }
}

export async function getEvaluatorCsvTemplate(): Promise<string> {
  await requireRole(["ADMIN"]);
  return `name,email,password,institution\nDr. Sarah Conner,sarah.evaluator@example.com,EvalPass2025!,School of Engineering\nProf. Arthur Dent,arthur.evaluator@example.com,EvalPass2025!,Department of Architecture`;
}
