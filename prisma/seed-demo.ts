/**
 * ACI Career EDGE Assess — Development Seed Script
 * 
 * Provisions initial cohort and isolated administrative/evaluator accounts.
 * Does NOT seed demo contest questions, answer keys, or fake assessment submissions.
 * Administrators create real contests, phases, tasks, rubrics, and questions dynamically.
 */

import { PrismaClient, UserRole } from "@prisma/client";
import { hashPassword } from "../src/lib/credentials";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding core cohort and institutional administrative accounts...");

  // 1. Create Base Cohort
  const cohort = await prisma.cohort.upsert({
    where: { code: "CLP-2025" },
    update: {},
    create: {
      code: "CLP-2025",
      name: "Campus Leadership Programme 2025",
      institutionCount: 12,
      startDate: new Date("2025-01-15T00:00:00Z"),
      endDate: new Date("2025-12-31T23:59:59Z"),
    },
  });

  // Default credentials hash
  const defaultCreds = hashPassword("EdgeArena#2025");

  // 2. Administrator Account
  const DEMO_ADMIN_ID = "00000000-0000-4000-8000-000000000000";
  const admin = await prisma.user.upsert({
    where: { email: "admin.demo@example.com" },
    update: {
      role: UserRole.ADMIN,
      passwordHash: defaultCreds.hash,
      passwordSalt: defaultCreds.salt,
      mustChangePassword: false,
      isActive: true,
    },
    create: {
      id: DEMO_ADMIN_ID,
      email: "admin.demo@example.com",
      name: "Platform Administrator",
      role: UserRole.ADMIN,
      institution: "ACI Career EDGE Academy Central",
      cohortId: cohort.id,
      passwordHash: defaultCreds.hash,
      passwordSalt: defaultCreds.salt,
      mustChangePassword: false,
      isActive: true,
    },
  });

  // Store admin credentials in AuditLog
  await prisma.auditLog.create({
    data: {
      action: "SET_CREDENTIALS",
      targetType: "USER_CREDENTIALS",
      targetId: admin.id,
      actorId: admin.id,
      metadata: {
        hash: defaultCreds.hash,
        salt: defaultCreds.salt,
        mustChangePassword: false,
      },
    },
  });

  // 3. Academic Evaluator Account
  const DEMO_EVALUATOR_ID = "00000000-0000-4000-8000-000000000001";
  const evaluator = await prisma.user.upsert({
    where: { email: "evaluator.demo@example.com" },
    update: {
      role: UserRole.EVALUATOR,
      passwordHash: defaultCreds.hash,
      passwordSalt: defaultCreds.salt,
      mustChangePassword: false,
      isActive: true,
    },
    create: {
      id: DEMO_EVALUATOR_ID,
      email: "evaluator.demo@example.com",
      name: "Academic Evaluator",
      role: UserRole.EVALUATOR,
      institution: "Leadership Evaluation Panel",
      cohortId: cohort.id,
      passwordHash: defaultCreds.hash,
      passwordSalt: defaultCreds.salt,
      mustChangePassword: false,
      isActive: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      action: "SET_CREDENTIALS",
      targetType: "USER_CREDENTIALS",
      targetId: evaluator.id,
      actorId: admin.id,
      metadata: {
        hash: defaultCreds.hash,
        salt: defaultCreds.salt,
        mustChangePassword: false,
      },
    },
  });

  // 4. Candidate Account (Unassigned to any contest)
  const DEMO_CANDIDATE_ID = "00000000-0000-4000-8000-000000000002";
  const candidate = await prisma.user.upsert({
    where: { email: "candidate.demo@example.com" },
    update: {
      role: UserRole.PARTICIPANT,
      passwordHash: defaultCreds.hash,
      passwordSalt: defaultCreds.salt,
      mustChangePassword: false,
      isActive: true,
    },
    create: {
      id: DEMO_CANDIDATE_ID,
      email: "candidate.demo@example.com",
      name: "Candidate Participant",
      candidateId: "ACI-2025-C01",
      role: UserRole.PARTICIPANT,
      institution: "National Campus Cluster A",
      cohortId: cohort.id,
      passwordHash: defaultCreds.hash,
      passwordSalt: defaultCreds.salt,
      mustChangePassword: false,
      isActive: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      action: "SET_CREDENTIALS",
      targetType: "USER_CREDENTIALS",
      targetId: candidate.id,
      actorId: admin.id,
      metadata: {
        hash: defaultCreds.hash,
        salt: defaultCreds.salt,
        mustChangePassword: false,
      },
    },
  });

  // If old demo contest "demo-ncic-2025" exists, clean it up
  const oldContest = await prisma.contest.findUnique({
    where: { slug: "demo-ncic-2025" },
    include: {
      phases: {
        include: {
          tasks: {
            include: {
              questions: {
                include: {
                  answerKey: true,
                  options: true,
                },
              },
              rubrics: true,
            },
          },
        },
      },
    },
  });

  if (oldContest) {
    console.log("Removing legacy demo contest questions and answer keys...");
    await prisma.contest.delete({ where: { id: oldContest.id } });
    console.log("Legacy demo contest successfully removed.");
  }

  console.log("Seed finished. No hardcoded contest questions or answer keys remain.");
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
