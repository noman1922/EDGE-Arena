"use server";

import { prisma } from "@/lib/prisma";
import { ContestStatus, ParticipantStatus, PhaseStatus, UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";

export interface AdminContestListItem {
  id: string;
  slug: string;
  name: string;
  stage: string;
  track: string;
  description: string | null;
  status: "Live" | "Draft" | "Completed";
  cohortText: string;
  cohortSubtext: string;
  submitted: number;
  total: number;
  avgScore: string;
  dates: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  rubrics: Array<{ name: string; weight: number; passRate: number }>;
  recentUploads: Array<{ name: string; time: string; score?: string }>;
  participants: Array<{ id: string; userId: string; name: string; email: string; status: string; enrolledAt: string }>;
}

export async function getAdminContests(): Promise<AdminContestListItem[]> {
  try {
    const contests = await prisma.contest.findMany({
      include: {
        cohort: true,
        phases: {
          orderBy: { phaseNumber: "asc" },
          include: {
            tasks: {
              include: {
                rubrics: true,
                submissions: {
                  include: {
                    user: true,
                  },
                },
              },
            },
          },
        },
        participants: {
          include: {
            user: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return contests.map((c) => {
      // Format status
      let uiStatus: "Live" | "Draft" | "Completed" = "Draft";
      if (c.status === ContestStatus.LIVE) uiStatus = "Live";
      else if (c.status === ContestStatus.COMPLETED || c.status === ContestStatus.ARCHIVED) uiStatus = "Completed";

      // Current stage string
      const activePhase = c.phases.find((p) => p.status === PhaseStatus.OPEN) || c.phases[0];
      const stageText = activePhase
        ? `Phase ${activePhase.phaseNumber}: ${activePhase.title}`
        : "Initial Setup";

      // Calculate submissions vs total participants
      const totalParticipants = c.participants.length;
      const allSubmissions = c.phases.flatMap((p) => p.tasks.flatMap((t) => t.submissions));
      const submittedCount = allSubmissions.filter((s) => s.status !== "DRAFT").length;

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

      // Format date window
      const startStr = c.startDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const endStr = c.endDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const dateWindow = `${startStr} – ${endStr}`;

      // Recent uploads
      const recentUploads = allSubmissions
        .filter((s) => s.submittedAt !== null)
        .sort((a, b) => (b.submittedAt?.getTime() ?? 0) - (a.submittedAt?.getTime() ?? 0))
        .slice(0, 3)
        .map((s) => ({
          name: s.user.name || s.user.email,
          time: s.submittedAt ? s.submittedAt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "Recently",
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
        cohortText: c.cohort?.name || "Global Leadership Cohort",
        cohortSubtext: `${totalParticipants} Enrolled Candidate${totalParticipants === 1 ? "" : "s"}`,
        submitted: submittedCount,
        total: totalParticipants > 0 ? totalParticipants : 1,
        avgScore: "84.2",
        dates: dateWindow,
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

    const contestStatus = input.status === "LIVE" ? ContestStatus.LIVE : ContestStatus.DRAFT;

    // Create Contest with default Phase and Task
    const newContest = await prisma.contest.create({
      data: {
        slug,
        title: input.title,
        track: input.track,
        description: input.description || null,
        status: contestStatus,
        cohortId: cohort.id,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        isPublished: false,
        phases: {
          create: {
            phaseNumber: 1,
            title: "Phase 1: Diagnostic Assessment",
            description: "Initial evaluation stage and case examination.",
            weightPercentage: 100.0,
            deadline: new Date(input.endDate),
            status: contestStatus === ContestStatus.LIVE ? PhaseStatus.OPEN : PhaseStatus.UPCOMING,
            tasks: {
              create: {
                taskNumber: 1,
                title: `Task 1.1: ${input.title} Core Challenge`,
                instructions: "Review reference materials, answer diagnostic questions, and submit your analysis.",
                totalPoints: 100,
                questions: {
                  create: [
                    {
                      questionNumber: 1,
                      type: "MCQ",
                      prompt: "Identify the primary strategic focus of this challenge track.",
                      instructions: "Select the option that best characterizes the baseline initiative.",
                      points: 10,
                      isMandatory: true,
                      options: {
                        create: [
                          { optionKey: "A", text: "Targeted operational optimization & resource efficiency", scopeTag: "Operational" },
                          { optionKey: "B", text: "Theoretical framework modeling without implementation", scopeTag: "Academic" },
                          { optionKey: "C", text: "External PR marketing campaign", scopeTag: "Marketing" },
                          { optionKey: "D", text: "Ad-hoc compliance reporting only", scopeTag: "Compliance" },
                        ],
                      },
                      answerKey: {
                        create: {
                          correctOptionKey: "A",
                          explanation: "Operational optimization and resource efficiency form the core strategic objective.",
                          scoringGuide: "Award 10 points for Option A.",
                        },
                      },
                    },
                    {
                      questionNumber: 2,
                      type: "WRITTEN",
                      prompt: "Executive Strategy Proposal",
                      instructions: "Provide an executive summary detailing your implementation milestones, ROI projections, and stakeholder engagement plan.",
                      points: 25,
                      isMandatory: true,
                      minWords: 200,
                      maxWords: 300,
                    },
                  ],
                },
                rubrics: {
                  create: [
                    { name: "Analytical Depth & Quantitative Proof", weightPercentage: 40.0, maxPoints: 40.0 },
                    { name: "ESG Alignment & Global Compliance", weightPercentage: 35.0, maxPoints: 35.0 },
                    { name: "Executive Communication & Defense", weightPercentage: 25.0, maxPoints: 25.0 },
                  ],
                },
              },
            },
          },
        },
      },
    });

    safeRevalidatePath("/admin/contests");
    safeRevalidatePath("/dashboard");

    return { success: true, contestId: newContest.id, slug: newContest.slug };
  } catch (error) {
    console.error("Error creating contest:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to create contest" };
  }
}

export async function assignParticipantAction(contestId: string, email: string, name?: string) {
  try {
    if (!contestId || !email) {
      return { success: false, error: "Contest ID and participant email are required." };
    }

    const trimmedEmail = email.trim().toLowerCase();
    const displayName = name?.trim() || trimmedEmail.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

    // 1. Find or create the User record
    const user = await prisma.user.upsert({
      where: { email: trimmedEmail },
      update: {},
      create: {
        id: crypto.randomUUID(),
        email: trimmedEmail,
        name: displayName,
        role: UserRole.PARTICIPANT,
        candidateId: `CAND-${Math.floor(1000 + Math.random() * 9000)}`,
        institution: "National Campus Leadership (Enrolled)",
      },
    });

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
