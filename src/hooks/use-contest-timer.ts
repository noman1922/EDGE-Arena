"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { getContestDeadlineAction } from "@/app/actions/assessment-actions";

export interface UseContestTimerOptions {
  contestId?: string;
  phaseId?: string;
  initialDeadlineIso?: string;
  initialSecondsLeft?: number;
  isContestEndedInitial?: boolean;
  heartbeatIntervalMs?: number;
  onDeadlineExtended?: (newDeadlineIso: string) => void;
}

export function formatSecondsToTimer(totalSeconds: number): string {
  if (totalSeconds <= 0) return "00:00:00";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [
    hours.toString().padStart(2, "0"),
    minutes.toString().padStart(2, "0"),
    seconds.toString().padStart(2, "0"),
  ].join(":");
}

export function formatDhakaDisplay(dateString?: string): string {
  if (!dateString) return "N/A";
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return "N/A";
    return d.toLocaleString("en-US", {
      timeZone: "Asia/Dhaka",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return dateString;
  }
}

export function useContestTimer({
  contestId,
  phaseId,
  initialDeadlineIso,
  initialSecondsLeft,
  isContestEndedInitial = false,
  heartbeatIntervalMs = 30000,
  onDeadlineExtended,
}: UseContestTimerOptions) {
  const [deadlineIso, setDeadlineIso] = useState<string>(initialDeadlineIso || "");
  const [secondsLeft, setSecondsLeft] = useState<number>(() => {
    if (initialSecondsLeft !== undefined) return initialSecondsLeft;
    if (initialDeadlineIso) {
      const diff = Math.max(0, Math.floor((new Date(initialDeadlineIso).getTime() - Date.now()) / 1000));
      return diff;
    }
    return 3600;
  });
  const [localEnded, setLocalEnded] = useState<boolean>(false);
  const [hasExtended, setHasExtended] = useState<boolean>(false);

  const [prevInitialDeadline, setPrevInitialDeadline] = useState(initialDeadlineIso);
  const [prevInitialSeconds, setPrevInitialSeconds] = useState(initialSecondsLeft);

  const deadlineRef = useRef<string>(deadlineIso);

  useEffect(() => {
    deadlineRef.current = deadlineIso;
  }, [deadlineIso]);

  if (initialDeadlineIso !== prevInitialDeadline) {
    setPrevInitialDeadline(initialDeadlineIso);
    if (initialDeadlineIso) {
      setDeadlineIso(initialDeadlineIso);
    }
  }

  if (initialSecondsLeft !== prevInitialSeconds) {
    setPrevInitialSeconds(initialSecondsLeft);
    if (initialSecondsLeft !== undefined) {
      setSecondsLeft(initialSecondsLeft);
    }
  }

  const isEnded = isContestEndedInitial || localEnded || secondsLeft <= 0;

  // 1-second live countdown ticker
  useEffect(() => {
    if (isEnded) return;

    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          setLocalEnded(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isEnded]);

  // Heartbeat function to fetch latest authoritative deadline from server
  const checkServerDeadline = useCallback(async () => {
    if (!contestId) return;

    try {
      const res = await getContestDeadlineAction(contestId, phaseId);
      if (res.success && res.deadline) {
        const previousDeadlineMs = deadlineRef.current ? new Date(deadlineRef.current).getTime() : 0;
        const newDeadlineMs = new Date(res.deadline).getTime();

        // If deadline was extended in database
        if (newDeadlineMs > previousDeadlineMs && previousDeadlineMs > 0) {
          setHasExtended(true);
          onDeadlineExtended?.(res.deadline);
        }

        // Gracefully adjust timer without touching input state or drafts
        setDeadlineIso(res.deadline);
        deadlineRef.current = res.deadline;
        setSecondsLeft(res.secondsLeft);
        setLocalEnded(res.isConcluded || res.secondsLeft <= 0);
      }
    } catch (err) {
      // Graceful fallback: maintain local countdown on network jitter
      console.warn("Timer heartbeat background sync skipped:", err);
    }
  }, [contestId, phaseId, onDeadlineExtended]);

  // Background heartbeat polling (every 30s) + focus re-sync
  useEffect(() => {
    if (!contestId) return;

    const timer = setInterval(() => {
      checkServerDeadline();
    }, heartbeatIntervalMs);

    const handleFocus = () => {
      checkServerDeadline();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);

    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    };
  }, [contestId, checkServerDeadline, heartbeatIntervalMs]);

  const dismissExtensionNotice = useCallback(() => {
    setHasExtended(false);
  }, []);

  const isUrgent = secondsLeft > 300 && secondsLeft <= 900;
  const isCritical = secondsLeft > 0 && secondsLeft <= 300;

  return {
    secondsLeft,
    isEnded,
    isUrgent,
    isCritical,
    formattedTimer: formatSecondsToTimer(secondsLeft),
    deadlineIso,
    formattedDeadline: formatDhakaDisplay(deadlineIso),
    dhakaDeadline: formatDhakaDisplay(deadlineIso),
    syncState: "synced" as const,
    hasExtended,
    dismissExtensionNotice,
    refreshDeadline: checkServerDeadline,
  };
}
