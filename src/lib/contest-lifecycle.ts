import { ContestStatus, PhaseStatus } from "@prisma/client";

export const DHAKA_TIMEZONE = "Asia/Dhaka";

/**
 * Normalizes any contest status string to the canonical Prisma ContestStatus enum string.
 */
export function normalizeContestStatus(status?: string | null): ContestStatus {
  if (!status) return ContestStatus.DRAFT;
  const upper = status.trim().toUpperCase();
  switch (upper) {
    case "LIVE":
      return ContestStatus.LIVE;
    case "COMPLETED":
      return ContestStatus.COMPLETED;
    case "ARCHIVED":
      return ContestStatus.ARCHIVED;
    case "DRAFT":
    default:
      return ContestStatus.DRAFT;
  }
}

/**
 * Returns formatted UI label for contest status ("Live", "Draft", "Completed", "Archived").
 */
export function formatContestStatusForUi(status?: string | null): "Live" | "Draft" | "Completed" | "Archived" {
  const normalized = normalizeContestStatus(status);
  switch (normalized) {
    case ContestStatus.LIVE:
      return "Live";
    case ContestStatus.COMPLETED:
      return "Completed";
    case ContestStatus.ARCHIVED:
      return "Archived";
    case ContestStatus.DRAFT:
    default:
      return "Draft";
  }
}

/**
 * Determines whether a contest is genuinely concluded/ended.
 * A contest is concluded IF AND ONLY IF:
 * - status is COMPLETED or ARCHIVED, OR
 * - current time has passed the contest's authoritative endDate.
 * 
 * CRITICAL RULE: A contest marked LIVE must NEVER be treated as concluded
 * merely because a phase deadline in the past exists, as long as now < contest.endDate.
 */
export function isContestConcluded(
  contest: {
    status?: string | ContestStatus | null;
    endDate: Date | string;
  },
  now: Date = new Date()
): boolean {
  const normalized = normalizeContestStatus(contest.status);
  if (normalized === ContestStatus.COMPLETED || normalized === ContestStatus.ARCHIVED) {
    return true;
  }

  const endMs = new Date(contest.endDate).getTime();
  if (isNaN(endMs)) return false;

  return now.getTime() >= endMs;
}

/**
 * Determines whether a contest is currently active/LIVE.
 * A contest is active IF:
 * - status is LIVE,
 * - current time is on or after startDate,
 * - current time is strictly before endDate,
 * - it is not concluded.
 */
export function isContestActive(
  contest: {
    status?: string | ContestStatus | null;
    startDate: Date | string;
    endDate: Date | string;
  },
  now: Date = new Date()
): boolean {
  if ((contest.status as string) === "UPCOMING") {
    return false;
  }
  const normalized = normalizeContestStatus(contest.status);
  if (normalized !== ContestStatus.LIVE) {
    return false;
  }

  const startMs = new Date(contest.startDate).getTime();
  const endMs = new Date(contest.endDate).getTime();

  if (isNaN(startMs) || isNaN(endMs)) return false;

  return now.getTime() >= startMs && now.getTime() < endMs;
}

/**
 * Determines whether a contest is scheduled / upcoming (not yet started).
 * Returns true if status is UPCOMING or current time is strictly before startDate.
 */
export function isContestUpcoming(
  contest: {
    status?: string | ContestStatus | null;
    startDate: Date | string;
    endDate?: Date | string;
  },
  now: Date = new Date()
): boolean {
  if ((contest.status as string) === "UPCOMING") {
    return true;
  }
  const normalized = normalizeContestStatus(contest.status);
  if (normalized === ContestStatus.COMPLETED || normalized === ContestStatus.ARCHIVED) {
    return false;
  }
  const startMs = new Date(contest.startDate).getTime();
  if (isNaN(startMs)) return false;

  return now.getTime() < startMs;
}

export interface ContestDeadlineCalculation {
  effectiveDeadline: Date;
  effectiveDeadlineMs: number;
  isConcluded: boolean;
  secondsLeft: number;
  controllingSource: "PHASE_DEADLINE" | "CONTEST_END_DATE";
}

/**
 * Computes the authoritative attempt deadline for an individual participant,
 * harmonizing the participant's individual timer with phase and contest bounds.
 */
export interface AttemptDeadlineCalculation {
  effectiveDeadline: Date;
  effectiveDeadlineMs: number;
  isConcluded: boolean;
  secondsLeft: number;
  controllingSource: "ATTEMPT_EXPIRY" | "PHASE_DEADLINE" | "CONTEST_END_DATE" | "PHASE_ATTEMPT_EXPIRY" | "TASK_ATTEMPT_EXPIRY";
  isAttemptExpired: boolean;
  phaseDeadline?: Date;
  phaseSecondsLeft?: number;
  isPhaseExpired?: boolean;
}

/**
 * Computes the authoritative hierarchical effective deadline and remaining seconds,
 * harmonizing the participant's individual timer with phase and contest bounds.
 *
 * Hierarchical Rules:
 * 1. Contest Outer Boundary: contest.endDate is the absolute ceiling. If contest concluded, secondsLeft = 0.
 * 2. Phase Boundary:
 *    - If phase has durationMinutes and phaseAttempt is started:
 *      phaseDeadline = MIN(phaseAttempt.startedAt + phase.durationMinutes, phase.deadline, contest.endDate)
 *    - If phaseAttempt.expiresAt is NULL or phase has no durationMinutes:
 *      phaseDeadline = MIN(phase.deadline, contest.endDate)
 * 3. Task Boundary:
 *    - If task has durationMinutes:
 *      taskDeadline = MIN(submission.startedAt + task.durationMinutes, phaseDeadline)
 *    - If task has NO durationMinutes (null):
 *      taskDeadline = phaseDeadline (No separate task countdown)
 * 4. Effective Deadline = MIN(Contest End, Phase Deadline, Task Deadline)
 */
export function getAuthoritativeAttemptDeadline(
  contest: {
    status?: string | ContestStatus | null;
    startDate?: Date | string;
    endDate: Date | string;
    durationMinutes?: number | null;
  },
  phase?: {
    id?: string;
    deadline?: Date | string | null;
    durationMinutes?: number | null;
    status?: string | PhaseStatus | null;
  } | null,
  submission?: {
    startedAt?: Date | string | null;
    expiresAt?: Date | string | null;
    status?: string | null;
  } | null,
  now: Date = new Date(),
  task?: {
    id?: string;
    durationMinutes?: number | null;
  } | null,
  phaseAttempt?: {
    startedAt?: Date | string | null;
    expiresAt?: Date | string | null;
    status?: string | null;
  } | null
): AttemptDeadlineCalculation {
  const contestEndDate = new Date(contest.endDate);
  const contestEndDateMs = contestEndDate.getTime();
  const nowMs = now.getTime();

  // 1. Contest Outer Hard Boundary
  const concluded = isContestConcluded(contest, now);
  if (concluded) {
    return {
      effectiveDeadline: contestEndDate,
      effectiveDeadlineMs: contestEndDateMs,
      isConcluded: true,
      secondsLeft: 0,
      controllingSource: "CONTEST_END_DATE",
      isAttemptExpired: true,
      phaseDeadline: contestEndDate,
      phaseSecondsLeft: 0,
      isPhaseExpired: true,
    };
  }

  // 2. Phase Boundary Calculation
  let calendarPhaseDeadlineMs = contestEndDateMs;
  if (phase?.deadline) {
    const parsed = new Date(phase.deadline).getTime();
    if (!isNaN(parsed)) {
      calendarPhaseDeadlineMs = parsed;
    }
  }
  const phaseCeilingMs = Math.min(calendarPhaseDeadlineMs, contestEndDateMs);

  let effectivePhaseDeadlineMs = phaseCeilingMs;
  let phaseControllingSource: "PHASE_ATTEMPT_EXPIRY" | "PHASE_DEADLINE" | "CONTEST_END_DATE" =
    calendarPhaseDeadlineMs < contestEndDateMs ? "PHASE_DEADLINE" : "CONTEST_END_DATE";

  if (phaseAttempt?.expiresAt) {
    const attemptPhaseExpiryMs = new Date(phaseAttempt.expiresAt).getTime();
    if (!isNaN(attemptPhaseExpiryMs) && attemptPhaseExpiryMs < phaseCeilingMs) {
      effectivePhaseDeadlineMs = attemptPhaseExpiryMs;
      phaseControllingSource = "PHASE_ATTEMPT_EXPIRY";
    }
  } else if (phaseAttempt?.startedAt && phase?.durationMinutes && phase.durationMinutes > 0) {
    const rawPhaseExpiryMs = new Date(phaseAttempt.startedAt).getTime() + phase.durationMinutes * 60 * 1000;
    if (rawPhaseExpiryMs < phaseCeilingMs) {
      effectivePhaseDeadlineMs = rawPhaseExpiryMs;
      phaseControllingSource = "PHASE_ATTEMPT_EXPIRY";
    }
  }

  const phaseSecondsLeft = Math.max(0, Math.floor((effectivePhaseDeadlineMs - nowMs) / 1000));
  const isPhaseExpired = phaseSecondsLeft <= 0;

  // 3. Task Boundary Calculation
  const hasTaskDuration = Boolean(task?.durationMinutes && task.durationMinutes > 0);
  let effectiveTaskDeadlineMs = effectivePhaseDeadlineMs;
  let controllingSource: "TASK_ATTEMPT_EXPIRY" | "PHASE_ATTEMPT_EXPIRY" | "PHASE_DEADLINE" | "CONTEST_END_DATE" = phaseControllingSource;

  if (hasTaskDuration) {
    const taskMinutes = task!.durationMinutes!;
    if (submission?.expiresAt) {
      const taskExpiryMs = new Date(submission.expiresAt).getTime();
      if (!isNaN(taskExpiryMs) && taskExpiryMs < effectivePhaseDeadlineMs) {
        effectiveTaskDeadlineMs = taskExpiryMs;
        controllingSource = "TASK_ATTEMPT_EXPIRY";
      }
    } else if (submission?.startedAt) {
      const calculatedTaskExpiryMs = new Date(submission.startedAt).getTime() + taskMinutes * 60 * 1000;
      if (calculatedTaskExpiryMs < effectivePhaseDeadlineMs) {
        effectiveTaskDeadlineMs = calculatedTaskExpiryMs;
        controllingSource = "TASK_ATTEMPT_EXPIRY";
      }
    }
  }

  const secondsLeft = Math.max(0, Math.floor((effectiveTaskDeadlineMs - nowMs) / 1000));
  const effectiveDeadline = new Date(effectiveTaskDeadlineMs);

  return {
    effectiveDeadline,
    effectiveDeadlineMs: effectiveTaskDeadlineMs,
    isConcluded: isPhaseExpired || secondsLeft <= 0,
    secondsLeft,
    controllingSource: controllingSource === "TASK_ATTEMPT_EXPIRY" ? "TASK_ATTEMPT_EXPIRY" : controllingSource,
    isAttemptExpired: secondsLeft <= 0 || isPhaseExpired,
    phaseDeadline: new Date(effectivePhaseDeadlineMs),
    phaseSecondsLeft,
    isPhaseExpired,
  };
}

/**
 * Computes the authoritative effective deadline and remaining seconds for participant assessment.
 * 
 * Approved Rules:
 * 1. If the contest is concluded (COMPLETED, ARCHIVED, or now >= contest.endDate),
 *    isConcluded = true, secondsLeft = 0.
 * 2. If the contest is LIVE and within schedule (now >= startDate && now < endDate):
 *    - If phase has a future deadline (phase.deadline > now), the countdown targets that phase deadline,
 *      bounded by contest.endDate.
 *    - If phase deadline is in the past (e.g. stale/placeholder deadline) or missing, the controlling cutoff
 *      is contest.endDate! It does NOT expire the session while the contest is LIVE.
 */
export function getAuthoritativeContestDeadline(
  contest: {
    status?: string | ContestStatus | null;
    startDate?: Date | string;
    endDate: Date | string;
  },
  phase?: {
    deadline?: Date | string | null;
    status?: string | PhaseStatus | null;
  } | null,
  now: Date = new Date()
): ContestDeadlineCalculation {
  const contestEndDate = new Date(contest.endDate);
  const contestEndDateMs = contestEndDate.getTime();
  const nowMs = now.getTime();

  const concluded = isContestConcluded(contest, now);
  if (concluded) {
    return {
      effectiveDeadline: contestEndDate,
      effectiveDeadlineMs: contestEndDateMs,
      isConcluded: true,
      secondsLeft: 0,
      controllingSource: "CONTEST_END_DATE",
    };
  }

  // Contest is currently LIVE / active
  if (phase?.deadline) {
    const phaseDeadline = new Date(phase.deadline);
    const phaseDeadlineMs = phaseDeadline.getTime();

    // If the phase deadline is in the future, it is a valid active milestone
    if (!isNaN(phaseDeadlineMs) && phaseDeadlineMs > nowMs) {
      const effectiveMs = Math.min(phaseDeadlineMs, contestEndDateMs);
      return {
        effectiveDeadline: new Date(effectiveMs),
        effectiveDeadlineMs: effectiveMs,
        isConcluded: false,
        secondsLeft: Math.max(0, Math.floor((effectiveMs - nowMs) / 1000)),
        controllingSource: "PHASE_DEADLINE",
      };
    }
  }

  // Phase deadline is in the past or not configured, but contest is LIVE.
  // The authoritative deadline is contest.endDate.
  return {
    effectiveDeadline: contestEndDate,
    effectiveDeadlineMs: contestEndDateMs,
    isConcluded: false,
    secondsLeft: Math.max(0, Math.floor((contestEndDateMs - nowMs) / 1000)),
    controllingSource: "CONTEST_END_DATE",
  };
}

/**
 * Parses a datetime string and guarantees Asia/Dhaka (+06:00) consistency
 * when no explicit timezone offset is provided (e.g. HTML datetime-local inputs).
 */
export function parseDhakaDateTime(input: string | Date): Date {
  if (input instanceof Date) return input;
  if (!input || typeof input !== "string") return new Date();

  const trimmed = input.trim();
  // If string already specifies UTC (Z) or timezone offset (+XX:XX or -XX:XX), parse directly
  if (trimmed.endsWith("Z") || /[+-]\d{2}(:\d{2})?$/.test(trimmed)) {
    return new Date(trimmed);
  }

  // HTML datetime-local format: "YYYY-MM-DDTHH:mm" or "YYYY-MM-DDTHH:mm:ss"
  // Default to Asia/Dhaka (+06:00)
  return new Date(`${trimmed}+06:00`);
}

/**
 * Formats a Date object in Asia/Dhaka timezone for display.
 */
export function formatDhakaDateString(
  date: Date | string,
  options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: DHAKA_TIMEZONE,
  }
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    ...options,
    timeZone: DHAKA_TIMEZONE,
  }).format(d);
}
