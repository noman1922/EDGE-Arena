"use server";

import { requireRole } from "@/lib/auth";
import { getSystemErrorLogs } from "@/lib/error-logger";
import { prisma } from "@/lib/prisma";

export async function getSystemErrorLogsAction(params?: {
  category?: string;
  search?: string;
  limit?: number;
}) {
  await requireRole(["ADMIN"]);
  return await getSystemErrorLogs(params);
}

export async function clearOldSystemErrorLogsAction(daysToKeep = 30) {
  await requireRole(["ADMIN"]);
  const cutoff = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
  const deleted = await prisma.systemErrorLog.deleteMany({
    where: {
      createdAt: { lt: cutoff },
    },
  });
  return { success: true, count: deleted.count };
}
