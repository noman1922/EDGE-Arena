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
import { requireRole, requireSession } from "@/lib/auth";

export interface ContestMonitoringSettings {
  cameraEnabled: boolean;
  micEnabled: boolean;
  fullscreenEnabled: boolean;
  tabSwitchEnabled: boolean;
  liveScreenShareEnabled: boolean; // Truthful feasibility indicator
  liveWebcamEnabled: boolean;      // Truthful feasibility indicator
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
  noticeText:
    "Proctored session: Fullscreen and focus events are logged. Sensitive video streams are not recorded unless explicitly consented and permitted.",
};

export interface MonitoringEventItem {
  id: string;
  timestamp: string;
  eventType: "SESSION_START" | "TAB_SWITCH" | "FULLSCREEN_ENTER" | "FULLSCREEN_EXIT" | "CAMERA_STATUS" | "MIC_STATUS" | "HEARTBEAT";
  status: string;
  details?: string;
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
  lastActive: string | null;
  events: MonitoringEventItem[];
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

    const meta = record.metadata as any;
    return {
      cameraEnabled: Boolean(meta.cameraEnabled),
      micEnabled: Boolean(meta.micEnabled),
      fullscreenEnabled: meta.fullscreenEnabled !== undefined ? Boolean(meta.fullscreenEnabled) : true,
      tabSwitchEnabled: meta.tabSwitchEnabled !== undefined ? Boolean(meta.tabSwitchEnabled) : true,
      liveScreenShareEnabled: Boolean(meta.liveScreenShareEnabled),
      liveWebcamEnabled: Boolean(meta.liveWebcamEnabled),
      noticeText: meta.noticeText || DEFAULT_MONITORING_SETTINGS.noticeText,
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

  if (existing) {
    await prisma.auditLog.update({
      where: { id: existing.id },
      data: {
        actorId: adminUserId,
        metadata: updated as any,
      },
    });
  } else {
    await prisma.auditLog.create({
      data: {
        action: "UPDATE_MONITORING_SETTINGS",
        targetType: "CONTEST_MONITORING_SETTINGS",
        targetId: contestId,
        actorId: adminUserId,
        metadata: updated as any,
      },
    });
  }

  return updated;
}
