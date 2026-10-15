/**
 * ACI Career EDGE Assess — Synthetic Development Seed Script
 * 
 * DISCLAIMER:
 * All records created by this script are synthetic demo fixtures.
 * Run with: npx tsx prisma/seed-demo.ts (when live database is configured)
 */

import { PrismaClient, UserRole, ContestStatus, PhaseStatus, QuestionType, ParticipantStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding synthetic demo benchmark dataset...");

  // 1. Create Sample Cohort
  const cohort = await prisma.cohort.upsert({
    where: { code: "CLP-2025" },
    update: {},
    create: {
      code: "CLP-2025",
      name: "Campus Leadership Programme 2025 (Demo Cohort)",
      institutionCount: 12,
      startDate: new Date("2025-01-15T00:00:00Z"),
      endDate: new Date("2025-06-30T23:59:59Z"),
    },
  });

  // 2. Create Demo Evaluator
  const DEMO_EVALUATOR_ID = "00000000-0000-4000-8000-000000000001";
  const evaluator = await prisma.user.upsert({
    where: { email: "evaluator.demo@example.com" },
    update: {},
    create: {
      id: DEMO_EVALUATOR_ID,
      email: "evaluator.demo@example.com",
      name: "Demo Evaluator",
      role: UserRole.EVALUATOR,
      institution: "Leadership Evaluation Panel (Demo)",
      cohortId: cohort.id,
    },
  });

  // 3. Create Demo Candidate
  const DEMO_CANDIDATE_ID = "00000000-0000-4000-8000-000000000002";
  const candidate = await prisma.user.upsert({
    where: { email: "candidate.demo@example.com" },
    update: {},
    create: {
      id: DEMO_CANDIDATE_ID,
      email: "candidate.demo@example.com",
      name: "Demo Candidate",
      candidateId: "DEMO-CANDIDATE-01",
      role: UserRole.PARTICIPANT,
      institution: "National Campus Cluster A (Demo)",
      cohortId: cohort.id,
    },
  });

  // 4. Create Live Contest: Campus ESG Transformation Strategy 2025
  const contest = await prisma.contest.upsert({
    where: { slug: "demo-ncic-2025" },
    update: {},
    create: {
      slug: "demo-ncic-2025",
      title: "[Sample Benchmark] Campus ESG Transformation Strategy 2025",
      track: "Track A (Sample)",
      description: "Multi-phase benchmark evaluating campus decarbonization and policy sequencing.",
      status: ContestStatus.LIVE,
      cohortId: cohort.id,
      startDate: new Date("2025-01-15T00:00:00Z"),
      endDate: new Date("2025-02-28T23:59:59Z"),
      isPublished: false,
    },
  });

  // 5. Enroll Candidate in Contest
  await prisma.contestParticipant.upsert({
    where: {
      contestId_userId: {
        contestId: contest.id,
        userId: candidate.id,
      },
    },
    update: {},
    create: {
      contestId: contest.id,
      userId: candidate.id,
      status: ParticipantStatus.ACTIVE,
    },
  });

  // 6. Create Phase 2
  const phase = await prisma.phase.upsert({
    where: {
      contestId_phaseNumber: {
        contestId: contest.id,
        phaseNumber: 2,
      },
    },
    update: {},
    create: {
      contestId: contest.id,
      phaseNumber: 2,
      title: "Stage 2: ESG Transformation & Policy Modeling",
      description: "Diagnostic benchmark focusing on Scope 1 thermal plant decarbonization.",
      weightPercentage: 35.0,
      deadline: new Date("2025-02-28T23:59:59Z"),
      status: PhaseStatus.OPEN,
    },
  });

  // 7. Create Task 2.1
  const task = await prisma.task.upsert({
    where: {
      phaseId_taskNumber: {
        phaseId: phase.id,
        taskNumber: 1,
      },
    },
    update: {},
    create: {
      phaseId: phase.id,
      taskNumber: 1,
      title: "Task 2.1: Campus ESG Transformation Strategy",
      instructions: "Answer quantitative diagnostics, submit structured executive summary, and upload pitch deck.",
      totalPoints: 100,
    },
  });

  // 8. Create Question 1 (MCQ)
  const q1 = await prisma.question.upsert({
    where: {
      taskId_questionNumber: {
        taskId: task.id,
        questionNumber: 1,
      },
    },
    update: {},
    create: {
      taskId: task.id,
      questionNumber: 1,
      type: QuestionType.MCQ,
      prompt: "Which metric represents Scope 1 emissions in university sustainability reporting?",
      instructions: "Select the single emission boundary definition conforming strictly to GHG Protocol standards.",
      points: 10,
      isMandatory: true,
      options: {
        create: [
          { optionKey: "A", text: "Purchased campus electricity & high-voltage grid transmission", scopeTag: "Scope 2" },
          { optionKey: "B", text: "Direct fuel combustion in campus physical plant boilers and fleet vehicles", scopeTag: "Scope 1" },
          { optionKey: "C", text: "Student and faculty daily commuting cycles and travel", scopeTag: "Scope 3" },
          { optionKey: "D", text: "Contracted third-party dining waste disposal and landfill diversion", scopeTag: "Scope 3" },
        ],
      },
      answerKey: {
        create: {
          correctOptionKey: "B",
          explanation: "Scope 1 emissions are direct greenhouse gas emissions from sources that are owned or controlled by the reporting institution.",
          scoringGuide: "Award 10 points for exact match with Option B. Zero points otherwise.",
        },
      },
    },
  });

  // 9. Create Question 2 (Written Response)
  await prisma.question.upsert({
    where: {
      taskId_questionNumber: {
        taskId: task.id,
        questionNumber: 2,
      },
    },
    update: {},
    create: {
      taskId: task.id,
      questionNumber: 2,
      type: QuestionType.WRITTEN,
      prompt: "Executive Written Response",
      instructions: "Provide an executive summary detailing how the campus physical plant can achieve a 40% reduction in thermal energy consumption over 18 months.",
      points: 25,
      isMandatory: true,
      minWords: 200,
      maxWords: 300,
    },
  });

  // 10. Create Rubrics for Evaluation
  const rubrics = [
    { name: "Analytical Depth & Quantitative Proof", weight: 40.0, maxPoints: 40.0 },
    { name: "ESG Alignment & Global Compliance", weight: 35.0, maxPoints: 35.0 },
    { name: "Executive Communication & Defense", weight: 25.0, maxPoints: 25.0 },
  ];

  for (const r of rubrics) {
    await prisma.rubricCriterion.upsert({
      where: {
        taskId_name: {
          taskId: task.id,
          name: r.name,
        },
      },
      update: {},
      create: {
        taskId: task.id,
        name: r.name,
        weightPercentage: r.weight,
        maxPoints: r.maxPoints,
      },
    });
  }

  console.log("Seeding completed successfully.");
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
