/**
 * ACI Career EDGE Assess / EDGE-Arena — System Error Logging & Sanitization Framework
 *
 * Implements:
 * - Correlation reference IDs (ERR-XXXXXXXX)
 * - Sanitization of sensitive secrets (passwords, tokens, credentials, connection strings)
 * - Structured server-side logging
 * - Persistent SystemErrorLog storage in PostgreSQL
 * - Authorized administrative diagnostics retrieval
 */

import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";

export type ErrorCategory =
  | "AUTH"
  | "VALIDATION"
  | "AUTHORIZATION"
  | "DATABASE"
  | "STORAGE"
  | "INTERNAL";

export interface LogSystemErrorInput {
  route: string;
  operation: string;
  category: ErrorCategory;
  error: unknown;
  httpStatus?: number;
  status?: "FAILED" | "PARTIAL";
  metadata?: Record<string, unknown>;
}

export interface SanitizedErrorResult {
  success: false;
  error: string;
  errorId: string;
  isRecoverable?: boolean;
}

/**
 * Strips credentials, tokens, DB connection strings and secrets from error strings.
 */
function sanitizeErrorMessage(rawText: string): string {
  if (!rawText) return "";

  return rawText
    // Mask passwords and tokens
    .replace(/(password|token|secret|apiKey|authorization)["\s:=]+["']?([^\s"';&]+)["']?/gi, "$1=***REDACTED***")
    // Mask database URLs
    .replace(/(postgres|postgresql|mysql):\/\/[^\s"';]+/gi, "postgres://***REDACTED_DB_URL***")
    // Mask bearer tokens
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, "Bearer ***REDACTED***")
    // Mask Supabase service keys
    .replace(/ey[A-Za-z0-9-_]+\.ey[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/g, "***JWT_REDACTED***")
    // Mask file paths with username directories
    .replace(/[A-Za-z]:\\[Users|home]+[^\s"']+/gi, "[SERVER_PATH]");
}

/**
 * Logs unexpected server-side errors to the database and structured stdout.
 * Returns a user-safe reference ID and sanitized response.
 */
export async function logSystemError(
  input: LogSystemErrorInput
): Promise<SanitizedErrorResult> {
  const errorId = `ERR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const now = new Date();

  let rawMessage = "Unknown internal server exception.";
  let stackTrace = "";

  if (input.error instanceof Error) {
    rawMessage = input.error.message;
    stackTrace = input.error.stack || "";
  } else if (typeof input.error === "string") {
    rawMessage = input.error;
  } else if (input.error && typeof input.error === "object") {
    try {
      rawMessage = JSON.stringify(input.error);
    } catch {
      rawMessage = String(input.error);
    }
  }

  const sanitizedMessage = sanitizeErrorMessage(rawMessage);
  const sanitizedStack = sanitizeErrorMessage(stackTrace);
  const details = sanitizedStack
    ? `${sanitizedMessage}\n${sanitizedStack.slice(0, 1500)}`
    : sanitizedMessage;

  // Structured console log
  console.error(
    `[SystemError] ID=${errorId} Route=${input.route} Op=${input.operation} Cat=${input.category}:`,
    sanitizedMessage
  );

  // Persistent storage in SystemErrorLog
  try {
    await prisma.systemErrorLog.create({
      data: {
        id: errorId,
        route: input.route.slice(0, 190),
        operation: input.operation.slice(0, 190),
        category: input.category,
        httpStatus: input.httpStatus || 500,
        details,
        status: input.status || "FAILED",
        createdAt: now,
      },
    });
  } catch (dbError) {
    // If DB logging itself fails, log to stdout without throwing
    console.error(`[SystemError] Failed to persist error log ${errorId} to database:`, dbError);
  }

  return {
    success: false,
    error: "Something went wrong. Please contact your system administrator.",
    errorId,
    isRecoverable: true,
  };
}

/**
 * Retrieves sanitized system error logs for administrative review. Admin only.
 */
export async function getSystemErrorLogs(params?: {
  category?: string;
  search?: string;
  limit?: number;
}) {
  await requireRole(["ADMIN"]);

  const limit = Math.min(params?.limit || 100, 200);

  const logs = await prisma.systemErrorLog.findMany({
    where: {
      ...(params?.category && params.category !== "ALL"
        ? { category: params.category }
        : {}),
      ...(params?.search
        ? {
            OR: [
              { id: { contains: params.search, mode: "insensitive" } },
              { route: { contains: params.search, mode: "insensitive" } },
              { operation: { contains: params.search, mode: "insensitive" } },
              { details: { contains: params.search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return logs.map((l) => ({
    id: l.id,
    timestamp: l.createdAt.toISOString(),
    route: l.route,
    operation: l.operation,
    category: l.category,
    httpStatus: l.httpStatus,
    details: l.details,
    status: l.status,
  }));
}
