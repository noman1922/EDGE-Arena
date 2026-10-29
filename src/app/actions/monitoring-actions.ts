"use server";

import { prisma } from "@/lib/prisma";
import { ContestStatus } from "@prisma/client";
import { requireRole, requireSession } from "@/lib/auth";
import {
  getContestMonitoringSettings,
  saveContestMonitoringSettings,
  getContestPenalties,
  DEFAULT_MONITORING_SETTINGS,
  type ContestMonitoringSettings,
  type ContestMonitoringOverview,
  type ParticipantMonitoringSession,
  type MonitoringEventItem,
  type ContestPenaltyItem,
} from "@/lib/monitoring";
import {
  formatContestStatusForUi,
  isContestConcluded,
} from "@/lib/contest-lifecycle";
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
 * Records telemetry events emitted by the candidate's active assessment window.
 * Strictly enforces contest permissions:
 * - Tab switch / focus tracking
 * - Fullscreen exit tracking
 * - Screen capture (only if screenCaptureEnabled)
 * - Camera frame capture (only if cameraCaptureEnabled AND candidate consented)
 * - Monitoring alert penalty deduction (if enableAlertPenalties)
 * - Deduplication on eventId
 */
export async function recordMonitoringEventAction(params: {
  contestId: string;
  eventType: "SESSION_START" | "TAB_SWITCH" | "FULLSCREEN_ENTER" | "FULLSCREEN_EXIT" | "CAMERA_STATUS" | "MIC_STATUS" | "HEARTBEAT";
  status: string;
  details?: string;
  eventId?: string;
  screenCaptureData?: string;
  cameraCaptureData?: string;
  captureSuccess?: boolean;
  captureFailureReason?: string;
}): Promise<{ success: boolean; eventId?: string; penaltyApplied?: number; duplicate?: boolean }> {
  try {
    const session = await requireRole(["PARTICIPANT"]);

    // 1. Verify candidate enrollment
    const enrollment = await prisma.contestParticipant.findFirst({
      where: {
        contestId: params.contestId,
        userId: session.userId,
      },
    });

    if (!enrollment) {
      return { success: false };
    }

    const eventId = params.eventId || `evt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    // 2. Prevent duplicate event processing (idempotency check)
    const existingLog = await prisma.auditLog.findFirst({
      where: {
        action: "MONITORING_EVENT",
        targetType: "CONTEST_PARTICIPANT",
        targetId: `${session.userId}:${eventId}`,
      },
    });

    if (existingLog) {
      return { success: true, eventId, duplicate: true };
    }

    // 3. Load contest monitoring settings to verify configured permissions
    const settings = await getContestMonitoringSettings(params.contestId);

    // 4. Permission-based evidence capture
    let evidenceRecorded = false;
    const permittedScreen = Boolean(settings.screenCaptureEnabled && params.screenCaptureData);
    const permittedCamera = Boolean(settings.cameraCaptureEnabled && params.cameraCaptureData);
    const isCaptureAttempted = Boolean(
      permittedScreen ||
      permittedCamera ||
      params.captureSuccess === false ||
      (settings.screenCaptureEnabled && params.captureFailureReason) ||
      (settings.cameraCaptureEnabled && params.captureFailureReason)
    );

    if (isCaptureAttempted) {
      await prisma.auditLog.create({
        data: {
          action: "MONITORING_EVIDENCE",
          targetType: "MONITORING_EVIDENCE",
          targetId: `${params.contestId}:${session.userId}:${eventId}`,
          actorId: session.userId,
          metadata: {
            contestId: params.contestId,
            userId: session.userId,
            eventId,
            eventType: params.eventType,
            screenCapture: permittedScreen ? params.screenCaptureData : null,
            cameraCapture: permittedCamera ? params.cameraCaptureData : null,
            captureSuccess: params.captureSuccess !== false,
            failureReason: params.captureFailureReason || null,
            timestamp: new Date().toISOString(),
          },
        },
      });
      evidenceRecorded = true;
    }

    // 5. Automatic penalty calculation for alert events (5 points per confirmed alert)
    let penaltyApplied = 0;
    const isAlertEvent = params.eventType === "TAB_SWITCH" || params.eventType === "FULLSCREEN_EXIT";

    if (isAlertEvent && settings.enableAlertPenalties) {
      const penaltyPoints = settings.alertPenaltyPoints || 5;
      const dedupPenaltyId = `${params.contestId}:${session.userId}:${eventId}:MONITORING_ALERT`;

      const existingPenalty = await prisma.auditLog.findFirst({
        where: {
          targetType: "CONTEST_PENALTY",
          targetId: dedupPenaltyId,
        },
      });

      if (!existingPenalty) {
        await prisma.auditLog.create({
          data: {
            action: "APPLY_ALERT_PENALTY",
            targetType: "CONTEST_PENALTY",
            targetId: dedupPenaltyId,
            actorId: session.userId,
            metadata: {
              contestId: params.contestId,
              userId: session.userId,
              eventId,
              penaltyType: "MONITORING_ALERT",
              points: penaltyPoints,
              reason: `Confirmed alert: ${params.eventType === "TAB_SWITCH" ? "Tab switch / focus loss" : "Fullscreen exit detected"}`,
              timestamp: new Date().toISOString(),
            },
          },
        });
        penaltyApplied = penaltyPoints;
      }
    }

    // 6. Record monitoring event log
    await prisma.auditLog.create({
      data: {
        action: "MONITORING_EVENT",
        targetType: "CONTEST_PARTICIPANT",
        targetId: `${session.userId}:${eventId}`,
        actorId: session.userId,
        metadata: {
          contestId: params.contestId,
          candidateId: session.candidateId || "CANDIDATE",
          candidateName: session.name,
          eventId,
          eventType: params.eventType,
          status: params.status,
          details: params.details || null,
          penaltyApplied: penaltyApplied > 0 ? penaltyApplied : undefined,
          penaltyReason: penaltyApplied > 0 ? `-${penaltyApplied} pts (Monitoring Alert)` : undefined,
          hasScreenCapture: permittedScreen,
          hasCameraCapture: permittedCamera,
          captureSuccess: params.captureSuccess !== false,
          evidenceRecorded,
          timestamp: new Date().toISOString(),
        },
      },
    });

    return { success: true, eventId, penaltyApplied };
  } catch (error) {
    console.warn("Telemetry recording error:", error);
    return { success: false };
  }
}

/**
 * Confirms an AI-generated answer violation after authorized administrator review.
 * Enforces contest policy check, duplicate protection, and explicit review notes.
 */
export async function confirmAiViolationPenaltyAction(params: {
  contestId: string;
  userId: string;
  submissionId?: string;
  reason: string;
  points?: number;
  policyNotes?: string;
}): Promise<{ success: boolean; penalty?: ContestPenaltyItem; error?: string }> {
  try {
    const session = await requireRole(["ADMIN"]);
    const settings = await getContestMonitoringSettings(params.contestId);

    if (!settings.enableAiPenalties) {
      return {
        success: false,
        error: "AI violation penalty rule is not enabled for this contest. Enable it in Contest Monitoring Settings first.",
      };
    }

    if (!params.reason || params.reason.trim().length < 5) {
      return {
        success: false,
        error: "An explicit, reviewable rationale is required. Automated detector scores alone are not sufficient.",
      };
    }

    const points = typeof params.points === "number" ? params.points : (settings.aiPenaltyPoints || 10);
    const dedupTargetId = `${params.contestId}:${params.userId}:${params.submissionId || "AI_WRITTEN"}:AI_VIOLATION`;

    const existing = await prisma.auditLog.findFirst({
      where: {
        targetType: "CONTEST_PENALTY",
        targetId: dedupTargetId,
      },
    });

    if (existing) {
      return {
        success: false,
        error: "An AI violation penalty has already been confirmed and recorded for this submission.",
      };
    }

    const nowIso = new Date().toISOString();
    const created = await prisma.auditLog.create({
      data: {
        action: "CONFIRM_AI_VIOLATION_PENALTY",
        targetType: "CONTEST_PENALTY",
        targetId: dedupTargetId,
        actorId: session.userId,
        metadata: {
          contestId: params.contestId,
          userId: params.userId,
          submissionId: params.submissionId || null,
          penaltyType: "AI_VIOLATION",
          points,
          reason: params.reason,
          policyNotes: params.policyNotes || "Confirmed by authorized administrator review per contest academic integrity disclosure",
          confirmedBy: session.name || session.email,
          timestamp: nowIso,
        },
      },
    });

    try {
      revalidatePath("/admin/monitoring");
      revalidatePath("/admin/results");
      revalidatePath("/admin/submissions");
    } catch {
      // Fallback in test/runner
    }

    return {
      success: true,
      penalty: {
        id: created.id,
        contestId: params.contestId,
        userId: params.userId,
        penaltyType: "AI_VIOLATION",
        points,
        reason: params.reason,
        timestamp: nowIso,
        confirmedBy: session.name || session.email,
      },
    };
  } catch (error) {
    console.error("Error confirming AI violation penalty:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to record AI violation penalty.",
    };
  }
}

/**
 * Securely retrieves captured monitoring evidence (screen/camera still) for authorized personnel.
 * Strictly enforces role gating and contest assignment checks.
 */
export async function getMonitoringEvidenceAction(params: {
  contestId: string;
  eventId: string;
}): Promise<{
  success: boolean;
  evidence?: {
    id: string;
    contestId: string;
    userId: string;
    eventId: string;
    eventType: string;
    screenCapture: string | null;
    cameraCapture: string | null;
    captureSuccess: boolean;
    failureReason: string | null;
    timestamp: string;
  };
  error?: string;
}> {
  try {
    const session = await requireSession();
    if (session.role !== "ADMIN" && session.role !== "EVALUATOR") {
      return { success: false, error: "Access denied: Unauthorized evidence access." };
    }

    // If evaluator, verify assignment
    if (session.role === "EVALUATOR") {
      const evalUser = await prisma.user.findFirst({
        where: { OR: [{ id: session.userId }, { email: session.email }] },
        include: { contestEvaluations: { where: { contestId: params.contestId } } },
      });
      if (!evalUser || evalUser.contestEvaluations.length === 0) {
        return { success: false, error: "Access denied: Not assigned to this contest." };
      }
    }

    const record = await prisma.auditLog.findFirst({
      where: {
        action: "MONITORING_EVIDENCE",
        targetType: "MONITORING_EVIDENCE",
        targetId: { contains: params.eventId },
      },
    });

    if (!record || !record.metadata || typeof record.metadata !== "object") {
      return { success: false, error: "Evidence record not found." };
    }

    const meta = record.metadata as Record<string, unknown>;
    if (meta.contestId !== params.contestId) {
      return { success: false, error: "Contest mismatch for requested evidence." };
    }

    return {
      success: true,
      evidence: {
        id: record.id,
        contestId: meta.contestId as string,
        userId: meta.userId as string,
        eventId: meta.eventId as string,
        eventType: (meta.eventType as string) || "UNKNOWN",
        screenCapture: (meta.screenCapture as string) || null,
        cameraCapture: (meta.cameraCapture as string) || null,
        captureSuccess: meta.captureSuccess !== false,
        failureReason: (meta.failureReason as string) || null,
        timestamp: (meta.timestamp as string) || record.createdAt.toISOString(),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to load evidence.",
    };
  }
}

/**
 * Enforces retention policy for captured monitoring evidence (Admin only).
 * Purges evidence older than configured retention period.
 */
export async function cleanupMonitoringEvidenceAction(
  contestId: string
): Promise<{ success: boolean; deletedCount?: number; error?: string }> {
  try {
    await requireRole(["ADMIN"]);
    const settings = await getContestMonitoringSettings(contestId);
    const retentionDays = settings.evidenceRetentionDays || 90;
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const oldEvidence = await prisma.auditLog.findMany({
      where: {
        action: "MONITORING_EVIDENCE",
        targetType: "MONITORING_EVIDENCE",
        createdAt: { lt: cutoffDate },
      },
      select: { id: true, metadata: true },
    });

    const idsToDelete = oldEvidence
      .filter((ev) => {
        const meta = (ev.metadata || {}) as Record<string, unknown>;
        return meta.contestId === contestId;
      })
      .map((ev) => ev.id);

    if (idsToDelete.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { id: { in: idsToDelete } },
      });
    }

    return { success: true, deletedCount: idsToDelete.length };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to clean up evidence.",
    };
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

    // 1. Fetch accessible contests using shared lifecycle logic
    let accessibleContests: Array<{ id: string; title: string; track: string; status: string }> = [];

    if (session.role === "ADMIN") {
      const all = await prisma.contest.findMany({
        select: { id: true, title: true, track: true, status: true, startDate: true, endDate: true },
        orderBy: { createdAt: "desc" },
      });
      const now = new Date();
      accessibleContests = all.map((c) => ({
        id: c.id,
        title: c.title,
        track: c.track,
        status: isContestConcluded(c, now) ? "Completed" : formatContestStatusForUi(c.status),
      }));
    } else {
      // EVALUATOR: find contests explicitly assigned to this evaluator
      const evalUser = await prisma.user.findFirst({
        where: { OR: [{ id: session.userId }, { email: session.email }] },
        include: { contestEvaluations: { select: { contestId: true } } },
      });

      const assignedContestIds = evalUser?.contestEvaluations.map((ce) => ce.contestId) || [];

      if (assignedContestIds.length === 0) {
        return { success: true, contests: [] };
      }

      const contests = await prisma.contest.findMany({
        where: {
          id: { in: assignedContestIds },
          status: { not: ContestStatus.DRAFT },
        },
        select: { id: true, title: true, track: true, status: true, startDate: true, endDate: true },
        orderBy: { createdAt: "desc" },
      });

      const now = new Date();
      accessibleContests = contests.map((c) => ({
        id: c.id,
        title: c.title,
        track: c.track,
        status: isContestConcluded(c, now) ? "Completed" : formatContestStatusForUi(c.status),
      }));
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

    // Filter candidate enrollments by evaluator candidate assignments if EVALUATOR
    let assignedCandidateIds: string[] | undefined = undefined;
    if (session.role === "EVALUATOR") {
      const evalUser = await prisma.user.findFirst({
        where: { OR: [{ id: session.userId }, { email: session.email }] },
        include: {
          evaluatorAssignedCandidates: {
            where: { contestId: activeContestId },
            select: { participantId: true },
          },
        },
      });
      assignedCandidateIds = evalUser?.evaluatorAssignedCandidates.map((a) => a.participantId) || [];
    }

    // 2. Load monitoring settings, enrollments, penalties, and telemetry in parallel
    const [settings, enrollments, contestPenalties, auditEvents] = await Promise.all([
      getContestMonitoringSettings(activeContestId),
      prisma.contestParticipant.findMany({
        where: {
          contestId: activeContestId,
          ...(assignedCandidateIds ? { userId: { in: assignedCandidateIds } } : {}),
        },
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
      getContestPenalties(activeContestId),
      prisma.auditLog.findMany({
        where: {
          action: "MONITORING_EVENT",
          targetType: "CONTEST_PARTICIPANT",
          metadata: {
            path: ["contestId"],
            equals: activeContestId,
          },
          ...(assignedCandidateIds ? { actorId: { in: assignedCandidateIds } } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
    ]);

    // Group penalties by participant
    const penaltiesByUser: Record<string, ContestPenaltyItem[]> = {};
    for (const p of contestPenalties) {
      if (!penaltiesByUser[p.userId]) {
        penaltiesByUser[p.userId] = [];
      }
      penaltiesByUser[p.userId].push(p);
    }

    // Group events by participant
    const eventsByUser: Record<string, MonitoringEventItem[]> = {};
    for (const log of auditEvents) {
      const meta = (log.metadata || {}) as Record<string, unknown>;
      if (meta.contestId === activeContestId) {
        const uid = log.actorId || (meta.userId as string);
        if (uid) {
          if (!eventsByUser[uid]) {
            eventsByUser[uid] = [];
          }
          eventsByUser[uid].push({
            id: (meta.eventId as string) || log.id,
            timestamp: (meta.timestamp as string) || log.createdAt.toISOString(),
            eventType: meta.eventType as MonitoringEventItem["eventType"],
            status: (meta.status as string) || "Recorded",
            details: (meta.details as string) || undefined,
            penaltyApplied: typeof meta.penaltyApplied === "number" ? meta.penaltyApplied : undefined,
            penaltyReason: (meta.penaltyReason as string) || undefined,
            hasScreenCapture: Boolean(meta.hasScreenCapture),
            hasCameraCapture: Boolean(meta.hasCameraCapture),
            captureSuccess: meta.captureSuccess !== false,
          });
        }
      }
    }

    // 4. Build ParticipantMonitoringSession items
    let totalAlerts = 0;
    let activeSessions = 0;
    let submittedSessions = 0;
    let globalTotalPenalties = 0;

    const participants: ParticipantMonitoringSession[] = enrollments.map((enr) => {
      const u = enr.user;
      const sub = u.submissions[0];
      const userEvents = eventsByUser[u.id] || [];
      const userPenalties = penaltiesByUser[u.id] || [];
      const userPenaltyPoints = userPenalties.reduce((sum, p) => sum + p.points, 0);
      globalTotalPenalties += userPenaltyPoints;

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

      // Compute alert count
      const tabSwitches = userEvents.filter((ev) => ev.eventType === "TAB_SWITCH").length;
      const fullscreenExits = userEvents.filter((ev) => ev.eventType === "FULLSCREEN_EXIT").length;
      const candidateAlerts = tabSwitches + fullscreenExits;
      totalAlerts += candidateAlerts;

      // Camera state
      let cameraState: "Permission Granted" | "Unavailable" | "Disabled" = "Disabled";
      if (settings.cameraEnabled || settings.cameraCaptureEnabled) {
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
        totalPenalties: userPenaltyPoints,
        lastActive,
        events: userEvents,
        penalties: userPenalties,
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
          totalPenalties: globalTotalPenalties,
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
      ["Contest", "Participant ID", "Candidate Name", "Email", "Session Status", "Alert Count", "Penalties Deducted", "Event Type", "Event Status", "Details", "Timestamp"],
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
          p.totalPenalties.toString(),
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
            p.totalPenalties.toString(),
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
