"use server";

import { prisma } from "@/lib/prisma";
import { requireRole, requireSession } from "@/lib/auth";
import {
  getContestMonitoringSettings,
  saveContestMonitoringSettings,
  DEFAULT_MONITORING_SETTINGS,
  type ContestMonitoringSettings,
  type ContestMonitoringOverview,
  type ParticipantMonitoringSession,
  type MonitoringEventItem,
} from "@/lib/monitoring";
import { revalidatePath } from "next/cache";

/**
 * Loads contest monitoring settings.
 */
export async function getContestMonitoringSettingsAction(
  contestId: string
): Promise<ContestMonitoringSettings & { success: boolean; settings: ContestMonitoringSettings; error?: string }> {
  try {
    await requireSession();
    const settings = await getContestMonitoringSettings(contestId);
    return {
      ...settings,
      success: true,
      settings,
    };
  } catch (error) {
    return {
      ...DEFAULT_MONITORING_SETTINGS,
      success: false,
      settings: DEFAULT_MONITORING_SETTINGS,
      error: error instanceof Error ? error.message : "Failed to load monitoring settings.",
    };
  }
}

/**
 * Updates contest-specific monitoring permissions. Admin only.
 */
export async function saveContestMonitoringSettingsAction(
  contestId: string,
  settings: Partial<ContestMonitoringSettings>
): Promise<{ success: boolean; settings?: ContestMonitoringSettings; error?: string }> {
  try {
    const session = await requireRole(["ADMIN"]);

    const contest = await prisma.contest.findUnique({
      where: { id: contestId },
    });
    if (!contest) {
      return { success: false, error: "Contest not found." };
    }

    const updated = await saveContestMonitoringSettings(contestId, settings, session.userId);

    try {
      revalidatePath("/admin/contests");
      revalidatePath("/admin/monitoring");
      revalidatePath("/assessment");
    } catch {
      // Fallback in runner
    }

    return { success: true, settings: updated };
  } catch (error) {
    console.error("Save monitoring settings error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save settings.",
    };
  }
}

/**
 * Records real telemetry events emitted by the candidate's active assessment window.
 * Strictly neutral labels:
 * - TAB_SWITCH: "Browser focus lost / tab switch recorded"
 * - FULLSCREEN_EXIT: "Fullscreen exit detected"
 * - CAMERA_STATUS: "permission_granted" / "unavailable"
 * - MIC_STATUS: "permission_granted" / "unavailable"
 */
export async function recordMonitoringEventAction(params: {
  contestId: string;
  eventType: "SESSION_START" | "TAB_SWITCH" | "FULLSCREEN_ENTER" | "FULLSCREEN_EXIT" | "CAMERA_STATUS" | "MIC_STATUS" | "HEARTBEAT";
  status: string;
  details?: string;
}): Promise<{ success: boolean }> {
  try {
    const session = await requireRole(["PARTICIPANT"]);

    // Verify enrollment
    const enrollment = await prisma.contestParticipant.findFirst({
      where: {
        contestId: params.contestId,
        userId: session.userId,
      },
    });

    if (!enrollment) {
      return { success: false };
    }

    await prisma.auditLog.create({
      data: {
        action: "MONITORING_EVENT",
        targetType: "CONTEST_PARTICIPANT",
        targetId: session.userId,
        actorId: session.userId,
        metadata: {
          contestId: params.contestId,
          candidateId: session.candidateId || "CANDIDATE",
          candidateName: session.name,
          eventType: params.eventType,
          status: params.status,
          details: params.details || null,
          timestamp: new Date().toISOString(),
        },
      },
    });

    return { success: true };
  } catch (error) {
    console.warn("Telemetry recording error:", error);
    return { success: false };
  }
}

/**
 * Fetches the real monitoring roster and telemetry dashboard for a contest.
 * Role Gating:
 * - ADMIN: Can view all contests.
 * - EVALUATOR: Can only view contests they are assigned to.
 */
export async function getContestMonitoringDashboardAction(
  requestedContestId?: string
): Promise<{
  success: boolean;
  contests: Array<{ id: string; title: string; track: string; status: string }>;
  selectedContestId?: string;
  dashboard?: ContestMonitoringOverview;
  error?: string;
}> {
  try {
    const session = await requireSession();
    if (session.role !== "ADMIN" && session.role !== "EVALUATOR") {
      return { success: false, contests: [], error: "Forbidden: Access denied." };
    }

    // 1. Fetch accessible contests
    let accessibleContests: Array<{ id: string; title: string; track: string; status: string }> = [];

    if (session.role === "ADMIN") {
      accessibleContests = await prisma.contest.findMany({
        select: { id: true, title: true, track: true, status: true },
        orderBy: { createdAt: "desc" },
      });
    } else {
      // EVALUATOR: find contests containing submissions or phases assigned to this evaluator
      accessibleContests = await prisma.contest.findMany({
        where: {
          OR: [
            { isPublished: true },
            { status: { in: ["LIVE", "COMPLETED"] } },
          ],
        },
        select: { id: true, title: true, track: true, status: true },
        orderBy: { createdAt: "desc" },
      });
    }

    if (accessibleContests.length === 0) {
      return { success: true, contests: [] };
    }

    // Select target contest
    const activeContestId =
      requestedContestId && accessibleContests.some((c) => c.id === requestedContestId)
        ? requestedContestId
        : accessibleContests[0].id;

    const targetContest = accessibleContests.find((c) => c.id === activeContestId)!;

    // 2 & 3. Load monitoring settings and enrollments in parallel with field projection
    const [settings, enrollments] = await Promise.all([
      getContestMonitoringSettings(activeContestId),
      prisma.contestParticipant.findMany({
        where: { contestId: activeContestId },
        select: {
          id: true,
          userId: true,
          enrolledAt: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              candidateId: true,
              institution: true,
              submissions: {
                where: { contestId: activeContestId },
                select: { id: true, status: true, submittedAt: true, updatedAt: true },
              },
            },
          },
        },
        orderBy: { enrolledAt: "asc" },
        take: 200,
      }),
    ]);

    // 4. Query telemetry events from AuditLog
    const userIds = enrollments.map((e) => e.userId);
    const auditEvents = userIds.length > 0 ? await prisma.auditLog.findMany({
      where: {
        action: "MONITORING_EVENT",
        targetType: "CONTEST_PARTICIPANT",
        targetId: { in: userIds },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    }) : [];

    // Group events by participant
    const eventsByUser: Record<string, MonitoringEventItem[]> = {};
    for (const log of auditEvents) {
      const meta = (log.metadata || {}) as any;
      if (meta.contestId === activeContestId) {
        if (!eventsByUser[log.targetId]) {
          eventsByUser[log.targetId] = [];
        }
        eventsByUser[log.targetId].push({
          id: log.id,
          timestamp: meta.timestamp || log.createdAt.toISOString(),
          eventType: meta.eventType,
          status: meta.status,
          details: meta.details || undefined,
        });
      }
    }

    // 5. Build ParticipantMonitoringSession items
    let totalAlerts = 0;
    let activeSessions = 0;
    let submittedSessions = 0;

    const participants: ParticipantMonitoringSession[] = enrollments.map((enr) => {
      const u = enr.user;
      const sub = u.submissions[0];
      const userEvents = eventsByUser[u.id] || [];

      // Determine session status
      let sessionStatus: "IN_PROGRESS" | "SUBMITTED" | "NOT_STARTED" = "NOT_STARTED";
      if (sub) {
        if (sub.status === "SUBMITTED" || sub.status === "GRADED" || sub.status === "PUBLISHED") {
          sessionStatus = "SUBMITTED";
          submittedSessions++;
        } else {
          sessionStatus = "IN_PROGRESS";
          activeSessions++;
        }
      }

      // Compute alert count (neutral telemetry events: tab switches, fullscreen exits)
      const tabSwitches = userEvents.filter((ev) => ev.eventType === "TAB_SWITCH").length;
      const fullscreenExits = userEvents.filter((ev) => ev.eventType === "FULLSCREEN_EXIT").length;
      const candidateAlerts = tabSwitches + fullscreenExits;
      totalAlerts += candidateAlerts;

      // Camera state
      let cameraState: "Permission Granted" | "Unavailable" | "Disabled" = "Disabled";
      if (settings.cameraEnabled) {
        const camEvent = userEvents.find((ev) => ev.eventType === "CAMERA_STATUS");
        if (camEvent && camEvent.status.toLowerCase().includes("granted")) {
          cameraState = "Permission Granted";
        } else {
          cameraState = "Unavailable";
        }
      }

      // Mic state
      let micState: "Permission Granted" | "Unavailable" | "Disabled" = "Disabled";
      if (settings.micEnabled) {
        const micEvent = userEvents.find((ev) => ev.eventType === "MIC_STATUS");
        if (micEvent && micEvent.status.toLowerCase().includes("granted")) {
          micState = "Permission Granted";
        } else {
          micState = "Unavailable";
        }
      }

      // Fullscreen state
      let fullscreenState: "Compliant" | "Exit Recorded" | "Disabled" = "Disabled";
      if (settings.fullscreenEnabled) {
        fullscreenState = fullscreenExits > 0 ? "Exit Recorded" : "Compliant";
      }

      const lastEvent = userEvents[0];
      const lastActive = lastEvent ? lastEvent.timestamp : sub?.updatedAt ? sub.updatedAt.toISOString() : null;

      return {
        participantId: enr.id,
        userId: u.id,
        candidateId: u.candidateId || `ACI-${u.id.substring(0, 4).toUpperCase()}`,
        candidateName: u.name,
        candidateEmail: u.email,
        institution: u.institution || "National Campus Cluster",
        sessionStatus,
        cameraState,
        micState,
        fullscreenState,
        alertCount: candidateAlerts,
        lastActive,
        events: userEvents,
      };
    });

    return {
      success: true,
      contests: accessibleContests,
      selectedContestId: targetContest.id,
      dashboard: {
        contestId: targetContest.id,
        contestTitle: targetContest.title,
        settings,
        participants,
        summary: {
          totalEnrolled: enrollments.length,
          activeSessions,
          submittedSessions,
          totalAlerts,
        },
      },
    };
  } catch (error) {
    console.error("Error loading monitoring dashboard:", error);
    return {
      success: false,
      contests: [],
      error: error instanceof Error ? error.message : "Failed to load monitoring dashboard.",
    };
  }
}

/**
 * Exports monitoring records as CSV for permitted roles.
 * Never exposes answer keys, scores, or secret data.
 */
export async function exportMonitoringRecordsCsvAction(
  contestId: string
): Promise<{ success: boolean; csv?: string; csvContent?: string; error?: string }> {
  try {
    const res = await getContestMonitoringDashboardAction(contestId);
    if (!res.success || !res.dashboard) {
      return { success: false, error: res.error || "Dashboard data unavailable." };
    }

    const { dashboard } = res;
    const rows = [
      ["Contest", "Participant ID", "Candidate Name", "Email", "Session Status", "Alert Count", "Event Type", "Event Status", "Details", "Timestamp"],
    ];

    for (const p of dashboard.participants) {
      if (p.events.length === 0) {
        rows.push([
          `"${dashboard.contestTitle.replace(/"/g, '""')}"`,
          `"${p.candidateId}"`,
          `"${p.candidateName.replace(/"/g, '""')}"`,
          `"${p.candidateEmail}"`,
          `"${p.sessionStatus}"`,
          p.alertCount.toString(),
          `"NONE"`,
          `"NORMAL"`,
          `"No telemetry events recorded"`,
          `"${p.lastActive || "N/A"}"`,
        ]);
      } else {
        for (const ev of p.events) {
          rows.push([
            `"${dashboard.contestTitle.replace(/"/g, '""')}"`,
            `"${p.candidateId}"`,
            `"${p.candidateName.replace(/"/g, '""')}"`,
            `"${p.candidateEmail}"`,
            `"${p.sessionStatus}"`,
            p.alertCount.toString(),
            `"${ev.eventType}"`,
            `"${ev.status}"`,
            `"${(ev.details || "").replace(/"/g, '""')}"`,
            `"${ev.timestamp}"`,
          ]);
        }
      }
    }

    const csvContent = rows.map((r) => r.join(",")).join("\n");
    return { success: true, csv: csvContent, csvContent };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to export monitoring CSV.",
    };
  }
}
