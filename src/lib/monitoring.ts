/**
 * ACI Career EDGE Assess / EDGE-Arena — Contest Monitoring & Telemetry Engine
 * 
 * Manages contest-specific proctoring configurations and real telemetry events:
 * 1. Camera / webcam permission
 * 2. Microphone permission
 * 3. Fullscreen requirement & exit event tracking
 * 4. Browser focus / tab-switch tracking
 * 5. Live screen sharing (status: not yet provisioned)
 * 6. Live webcam viewing (status: not yet provisioned)
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export interface ContestMonitoringSettings {
  cameraEnabled: boolean;
  micEnabled: boolean;
  fullscreenEnabled: boolean;
  tabSwitchEnabled: boolean;
  liveScreenShareEnabled: boolean; // Truthful feasibility indicator
  liveWebcamEnabled: boolean;      // Truthful feasibility indicator
  screenCaptureEnabled: boolean;   // Permission-based screenshot evidence on alert
  cameraCaptureEnabled: boolean;   // Permission-based camera still capture on alert
  enableAlertPenalties: boolean;   // 5 pts deduction per confirmed alert
  alertPenaltyPoints: number;      // Default: 5
  enableAiPenalties: boolean;      // 10 pts deduction for confirmed AI violation
  aiPenaltyPoints: number;         // Default: 10
  evidenceRetentionDays: number;   // Evidence retention period in days (default: 90)
  noticeText?: string;
  updatedAt?: string;
}

export const DEFAULT_MONITORING_SETTINGS: ContestMonitoringSettings = {
  cameraEnabled: false,
  micEnabled: false,
  fullscreenEnabled: true,
  tabSwitchEnabled: true,
  liveScreenShareEnabled: false,
  liveWebcamEnabled: false,
  screenCaptureEnabled: false,
  cameraCaptureEnabled: false,
  enableAlertPenalties: true,
  alertPenaltyPoints: 5,
  enableAiPenalties: false,
  aiPenaltyPoints: 10,
  evidenceRetentionDays: 90,
  noticeText:
    "Proctored session: Fullscreen and focus events are logged. Sensitive video streams are not recorded unless explicitly consented and permitted.",
};

export interface MonitoringEventItem {
  id: string;
  timestamp: string;
  eventType: "SESSION_START" | "TAB_SWITCH" | "FULLSCREEN_ENTER" | "FULLSCREEN_EXIT" | "CAMERA_STATUS" | "MIC_STATUS" | "HEARTBEAT";
  status: string;
  details?: string;
  penaltyApplied?: number;
  penaltyReason?: string;
  evidenceId?: string;
  hasScreenCapture?: boolean;
  hasCameraCapture?: boolean;
  captureSuccess?: boolean;
}

export interface ContestPenaltyItem {
  id: string;
  contestId: string;
  userId: string;
  submissionId?: string;
  eventId?: string;
  penaltyType: "MONITORING_ALERT" | "AI_VIOLATION" | "MANUAL_DEDUCTION";
  points: number;
  reason: string;
  timestamp: string;
  confirmedBy?: string;
  originalScore?: number;
  adjustedScore?: number;
}

export interface ParticipantMonitoringSession {
  participantId: string;
  userId: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  institution: string;
  sessionStatus: "IN_PROGRESS" | "SUBMITTED" | "NOT_STARTED";
  cameraState: "Permission Granted" | "Unavailable" | "Disabled";
  micState: "Permission Granted" | "Unavailable" | "Disabled";
  fullscreenState: "Compliant" | "Exit Recorded" | "Disabled";
  alertCount: number;
  totalPenalties: number;
  lastActive: string | null;
  events: MonitoringEventItem[];
  penalties: ContestPenaltyItem[];
}

export interface ContestMonitoringOverview {
  contestId: string;
  contestTitle: string;
  settings: ContestMonitoringSettings;
  participants: ParticipantMonitoringSession[];
  summary: {
    totalEnrolled: number;
    activeSessions: number;
    submittedSessions: number;
    totalAlerts: number;
    totalPenalties: number;
  };
}

/**
 * Loads the active monitoring configuration for a specific contest.
 */
export async function getContestMonitoringSettings(
  contestId: string
): Promise<ContestMonitoringSettings> {
  try {
    const record = await prisma.auditLog.findFirst({
      where: {
        targetType: "CONTEST_MONITORING_SETTINGS",
        targetId: contestId,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!record || !record.metadata || typeof record.metadata !== "object") {
      return { ...DEFAULT_MONITORING_SETTINGS };
    }

    const meta = record.metadata as Record<string, unknown>;
    return {
      cameraEnabled: Boolean(meta.cameraEnabled),
      micEnabled: Boolean(meta.micEnabled),
      fullscreenEnabled: meta.fullscreenEnabled !== undefined ? Boolean(meta.fullscreenEnabled) : true,
      tabSwitchEnabled: meta.tabSwitchEnabled !== undefined ? Boolean(meta.tabSwitchEnabled) : true,
      liveScreenShareEnabled: Boolean(meta.liveScreenShareEnabled),
      liveWebcamEnabled: Boolean(meta.liveWebcamEnabled),
      screenCaptureEnabled: Boolean(meta.screenCaptureEnabled),
      cameraCaptureEnabled: Boolean(meta.cameraCaptureEnabled),
      enableAlertPenalties: meta.enableAlertPenalties !== undefined ? Boolean(meta.enableAlertPenalties) : true,
      alertPenaltyPoints: typeof meta.alertPenaltyPoints === "number" ? meta.alertPenaltyPoints : 5,
      enableAiPenalties: Boolean(meta.enableAiPenalties),
      aiPenaltyPoints: typeof meta.aiPenaltyPoints === "number" ? meta.aiPenaltyPoints : 10,
      evidenceRetentionDays: typeof meta.evidenceRetentionDays === "number" ? meta.evidenceRetentionDays : 90,
      noticeText: (meta.noticeText as string) || DEFAULT_MONITORING_SETTINGS.noticeText,
      updatedAt: record.createdAt.toISOString(),
    };
  } catch (err) {
    console.error("Error reading contest monitoring settings:", err);
    return { ...DEFAULT_MONITORING_SETTINGS };
  }
}

/**
 * Saves contest-specific monitoring permissions (Admin only).
 */
export async function saveContestMonitoringSettings(
  contestId: string,
  settings: Partial<ContestMonitoringSettings>,
  adminUserId: string
): Promise<ContestMonitoringSettings> {
  const current = await getContestMonitoringSettings(contestId);
  const updated: ContestMonitoringSettings = {
    ...current,
    ...settings,
    updatedAt: new Date().toISOString(),
  };

  const existing = await prisma.auditLog.findFirst({
    where: {
      targetType: "CONTEST_MONITORING_SETTINGS",
      targetId: contestId,
    },
  });

  const jsonMetadata = updated as unknown as Prisma.InputJsonValue;

  if (existing) {
    await prisma.auditLog.update({
      where: { id: existing.id },
      data: {
        actorId: adminUserId,
        metadata: jsonMetadata,
      },
    });
  } else {
    await prisma.auditLog.create({
      data: {
        action: "UPDATE_MONITORING_SETTINGS",
        targetType: "CONTEST_MONITORING_SETTINGS",
        targetId: contestId,
        actorId: adminUserId,
        metadata: jsonMetadata,
      },
    });
  }

  return updated;
}

/**
 * Calculates final score by deducting penalties and enforcing zero-floor.
 */
export function calculateCandidateFinalScore(rawScore: number, totalPenalties: number): number {
  return Math.max(0, Math.round((rawScore - totalPenalties) * 100) / 100);
}

/**
 * Loads all confirmed penalties for candidates in a contest.
 */
export async function getContestPenalties(
  contestId: string,
  userId?: string
): Promise<ContestPenaltyItem[]> {
  try {
    const logs = await prisma.auditLog.findMany({
      where: {
        targetType: "CONTEST_PENALTY",
        metadata: {
          path: ["contestId"],
          equals: contestId,
        },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    const penalties: ContestPenaltyItem[] = [];
    for (const log of logs) {
      const meta = (log.metadata || {}) as Record<string, unknown>;
      const targetUserId = (meta.userId as string) || log.actorId || "";
      if (targetUserId && meta.contestId === contestId && (!userId || targetUserId === userId)) {
        penalties.push({
          id: log.id,
          contestId: meta.contestId as string,
          userId: targetUserId,
          submissionId: meta.submissionId as string | undefined,
          eventId: meta.eventId as string | undefined,
          penaltyType: (meta.penaltyType as "MONITORING_ALERT" | "AI_VIOLATION" | "MANUAL_DEDUCTION") || "MONITORING_ALERT",
          points: Number(meta.points || 0),
          reason: (meta.reason as string) || "Monitoring violation penalty",
          timestamp: (meta.timestamp as string) || log.createdAt.toISOString(),
          confirmedBy: (meta.confirmedBy as string) || (meta.evaluatorEmail as string) || (meta.evaluatorName as string) || undefined,
          originalScore: typeof meta.originalScore === "number" ? meta.originalScore : undefined,
          adjustedScore: typeof meta.adjustedScore === "number" ? meta.adjustedScore : undefined,
        });
      }
    }
    return penalties;
  } catch (err) {
    console.error("Error fetching contest penalties:", err);
    return [];
  }
}
