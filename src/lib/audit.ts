import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export interface LogAuditInput {
  actorId?: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string;
}

/**
 * Persists an immutable administrative or system action event in the PostgreSQL database.
 */
export async function recordAuditLog(input: LogAuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: input.actorId || null,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        metadata: input.metadata || undefined,
        ipAddress: input.ipAddress || null,
      },
    });
  } catch (error) {
    console.error("Failed to record audit log event:", error);
  }
}
