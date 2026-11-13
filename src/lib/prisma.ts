import { PrismaClient } from "@prisma/client";

function buildPrismaClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (url && url.includes(":6543")) {
    const params: string[] = [];
    if (!url.includes("pgbouncer=true")) params.push("pgbouncer=true");
    if (!url.includes("connection_limit=")) params.push("connection_limit=2");
    if (!url.includes("pool_timeout=")) params.push("pool_timeout=15");
    if (params.length > 0) {
      const separator = url.includes("?") ? "&" : "?";
      process.env.DATABASE_URL = `${url}${separator}${params.join("&")}`;
    }
  }

  return new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["error", "warn"]
        : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? buildPrismaClient();

// Reuse the single PrismaClient instance across warm serverless/Fluid Compute invocations
globalForPrisma.prisma = prisma;
