"use client";

import React, { useState, useEffect, useTransition, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
  getContestMonitoringDashboardAction,
  exportMonitoringRecordsCsvAction,
  getMonitoringEvidenceAction,
  confirmAiViolationPenaltyAction,
} from "@/app/actions/monitoring-actions";
import {
  ParticipantMonitoringSession,
  MonitoringEventItem,
  ContestMonitoringOverview,
} from "@/lib/monitoring";

interface MonitoringDashboardViewProps {
  role: "ADMIN" | "EVALUATOR";
}

export function MonitoringDashboardView({ role }: MonitoringDashboardViewProps) {
  const searchParams = useSearchParams();
  const initialContestId = searchParams.get("contestId") || undefined;

  const [contests, setContests] = useState<Array<{ id: string; title: string; track?: string; status?: string }>>([]);
  const [selectedContestId, setSelectedContestId] = useState<string>(initialContestId || "");
  const [dashboardData, setDashboardData] = useState<ContestMonitoringOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [filterAlertsOnly, setFilterAlertsOnly] = useState(false);

  // Detail Modal State
  const [selectedParticipant, setSelectedParticipant] = useState<ParticipantMonitoringSession | null>(null);
  const [isExporting, startExportTransition] = useTransition();

  // Evidence Viewer State
  const [selectedEvidence, setSelectedEvidence] = useState<{
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
  } | null>(null);
  const [isLoadingEvidence, setIsLoadingEvidence] = useState(false);

  // AI Violation Confirmation State (Admin only)
  const [aiReason, setAiReason] = useState("");
  const [aiPoints, setAiPoints] = useState(10);
  const [isConfirmingAi, setIsConfirmingAi] = useState(false);
  const [aiFeedback, setAiFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleViewEvidence = async (eventId: string) => {
    if (!selectedContestId) return;
    try {
      setIsLoadingEvidence(true);
      const res = await getMonitoringEvidenceAction({
        contestId: selectedContestId,
        eventId,
      });
      if (res.success && res.evidence) {
        setSelectedEvidence(res.evidence);
      } else {
        alert(res.error || "No captured evidence available for this event.");
      }
    } catch {
      alert("Failed to load evidence.");
    } finally {
      setIsLoadingEvidence(false);
    }
  };

  const handleConfirmAiViolation = async () => {
    if (!selectedParticipant || !selectedContestId || !aiReason.trim()) return;
    try {
      setIsConfirmingAi(true);
      setAiFeedback(null);
      const res = await confirmAiViolationPenaltyAction({
        contestId: selectedContestId,
        userId: selectedParticipant.userId,
        reason: aiReason.trim(),
        points: aiPoints,
      });
      if (res.success && res.penalty) {
        setAiFeedback({ type: "success", text: `AI violation confirmed. ${aiPoints} points deducted.` });
        setAiReason("");
        await loadDashboard(selectedContestId);
        setSelectedParticipant((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            totalPenalties: prev.totalPenalties + aiPoints,
            penalties: [...(prev.penalties || []), res.penalty!],
          };
        });
      } else {
        setAiFeedback({ type: "error", text: res.error || "Failed to confirm AI violation." });
      }
    } catch {
      setAiFeedback({ type: "error", text: "Network or authorization failure." });
    } finally {
      setIsConfirmingAi(false);
    }
  };

  const loadDashboard = useCallback(
    async (targetContestId?: string) => {
      try {
        setIsLoading(true);
        setErrorMessage(null);
        const res = await getContestMonitoringDashboardAction(targetContestId || undefined);

        if (!res.success) {
          setErrorMessage(res.error || "Failed to load monitoring dashboard.");
          return;
        }

        setContests(res.contests);
        if (res.selectedContestId) {
          setSelectedContestId(res.selectedContestId);
        }
        setDashboardData(res.dashboard || null);
      } catch (err) {
        console.error("Monitoring load error:", err);
        setErrorMessage("Unexpected error loading proctoring telemetry.");
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    loadDashboard(initialContestId);
  }, [initialContestId, loadDashboard]);

  const handleContestChange = (contestId: string) => {
    setSelectedContestId(contestId);
    loadDashboard(contestId);
  };

  const handleExportCsv = () => {
    if (!selectedContestId) return;
    startExportTransition(async () => {
      try {
        const res = await exportMonitoringRecordsCsvAction(selectedContestId);
        if (res.success && res.csvContent) {
          const blob = new Blob([res.csvContent], { type: "text/csv;charset=utf-8;" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.setAttribute("href", url);
          link.setAttribute(
            "download",
            `monitoring_telemetry_${selectedContestId.slice(0, 8)}.csv`
          );
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } else {
          alert(res.error || "Failed to export telemetry records.");
        }
      } catch (err) {
        console.error(err);
        alert("Failed to export telemetry records.");
      }
    });
  };

  const participants = dashboardData?.participants || [];
  const filteredParticipants = participants.filter((p) => {
    const matchesSearch =
      p.candidateName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.candidateId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.candidateEmail.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesAlertFilter = !filterAlertsOnly || p.alertCount > 0;
    return matchesSearch && matchesAlertFilter;
  });

  return (
    <div className="flex flex-col w-full pb-space-xl">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-md pt-space-xs pb-space-lg">
        <div>
          <div className="flex items-center gap-space-xs text-secondary font-label-xs uppercase tracking-wider mb-1">
            <span>{role === "ADMIN" ? "Platform Administration" : "Academic Evaluation Panel"}</span>
            <span>/</span>
            <span className="text-primary-container font-semibold">Integrity Monitoring</span>
          </div>
          <h1 className="font-display-lg text-on-surface">Proctoring & Telemetry Console</h1>
          <p className="font-body-md text-secondary mt-1">
            Real-time candidate telemetry, window focus tracking, browser permission states, and audit timelines.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            onClick={() => loadDashboard(selectedContestId || undefined)}
            className="px-3 py-2 bg-surface-container hover:bg-surface-container-high text-on-surface font-label-sm font-medium rounded border border-[#e2e8f0] transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px] text-secondary">refresh</span>
            <span>Refresh</span>
          </button>

          <button
            onClick={handleExportCsv}
            disabled={isExporting || participants.length === 0}
            className="px-3.5 py-2 bg-surface-container-low hover:bg-surface-container text-on-surface font-label-sm font-semibold rounded border border-[#e2e8f0] transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[18px] text-primary-container">download</span>
            <span>{isExporting ? "Exporting..." : "Export CSV"}</span>
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-800 rounded font-label-sm flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">error</span>
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Contest Selector Strip */}
      <div className="bg-surface-container-lowest p-4 rounded-lg border border-[#e2e8f0] shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 mb-space-md">
        <div className="flex items-center gap-3">
          <label className="font-label-xs uppercase text-secondary font-semibold shrink-0">
            Active Benchmark:
          </label>
          <select
            value={selectedContestId}
            onChange={(e) => handleContestChange(e.target.value)}
            className="px-3 py-1.5 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface font-label-sm focus:outline-none focus:border-primary-container min-w-[260px]"
          >
            {contests.length === 0 ? (
              <option value="">No contests available</option>
            ) : (
              contests.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))
            )}
          </select>
        </div>

        {/* Telemetry Policy Badges */}
        {dashboardData?.settings && (
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-secondary">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Contest Policy:</span>
            <span
              className={`px-2 py-0.5 rounded border ${
                dashboardData.settings.cameraEnabled
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200 font-semibold"
                  : "bg-surface-container-low text-secondary border-[#e2e8f0]"
              }`}
            >
              Camera: {dashboardData.settings.cameraEnabled ? "Enabled" : "Off"}
            </span>
            <span
              className={`px-2 py-0.5 rounded border ${
                dashboardData.settings.micEnabled
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200 font-semibold"
                  : "bg-surface-container-low text-secondary border-[#e2e8f0]"
              }`}
            >
              Mic: {dashboardData.settings.micEnabled ? "Enabled" : "Off"}
            </span>
            <span
              className={`px-2 py-0.5 rounded border ${
                dashboardData.settings.fullscreenEnabled
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200 font-semibold"
                  : "bg-surface-container-low text-secondary border-[#e2e8f0]"
              }`}
            >
              Fullscreen: {dashboardData.settings.fullscreenEnabled ? "Required" : "Off"}
            </span>
            <span
              className={`px-2 py-0.5 rounded border ${
                dashboardData.settings.tabSwitchEnabled
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200 font-semibold"
                  : "bg-surface-container-low text-secondary border-[#e2e8f0]"
              }`}
            >
              Tab Tracking: {dashboardData.settings.tabSwitchEnabled ? "Active" : "Off"}
            </span>
          </div>
        )}
      </div>

      {/* Telemetry Overview Metrics */}
      {dashboardData && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-space-sm mb-space-md">
          <div className="p-space-sm bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs">
            <span className="font-label-xs uppercase tracking-wider text-secondary block">
              Enrolled Candidates
            </span>
            <span className="font-headline-md text-on-surface font-bold tabular-nums">
              {dashboardData.summary.totalEnrolled}
            </span>
          </div>

          <div className="p-space-sm bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs">
            <span className="font-label-xs uppercase tracking-wider text-secondary block">
              Active Sessions
            </span>
            <span className="font-headline-md text-emerald-700 font-bold tabular-nums flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              {dashboardData.summary.activeSessions}
            </span>
          </div>

          <div className="p-space-sm bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs">
            <span className="font-label-xs uppercase tracking-wider text-secondary block">
              Completed Submissions
            </span>
            <span className="font-headline-md text-primary-container font-bold tabular-nums">
              {dashboardData.summary.submittedSessions}
            </span>
          </div>

          <div className="p-space-sm bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs">
            <span className="font-label-xs uppercase tracking-wider text-secondary block">
              Telemetry Alerts
            </span>
            <span
              className={`font-headline-md font-bold tabular-nums ${
                dashboardData.summary.totalAlerts > 0 ? "text-amber-700" : "text-secondary"
              }`}
            >
              {dashboardData.summary.totalAlerts}
            </span>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-surface-container-lowest p-3 rounded-lg border border-[#e2e8f0] shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3 mb-space-sm">
        <div className="relative w-full sm:w-80">
          <span className="absolute left-3 top-2.5 material-symbols-outlined text-[18px] text-secondary">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by candidate name or ID..."
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface focus:outline-none focus:border-primary-container"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <label className="flex items-center gap-1.5 font-label-xs text-secondary cursor-pointer select-none">
            <input
              type="checkbox"
              checked={filterAlertsOnly}
              onChange={(e) => setFilterAlertsOnly(e.target.checked)}
              className="w-3.5 h-3.5 text-primary-container rounded cursor-pointer"
            />
            <span>Show alerts only</span>
          </label>
        </div>
      </div>

      {/* Monitoring Roster Table */}
      <div className="bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#e2e8f0] bg-surface-container-low/50 text-secondary font-label-xs uppercase">
                <th className="py-3 px-4 font-semibold">Participant / ID</th>
                <th className="py-3 px-4 font-semibold">Camera State</th>
                <th className="py-3 px-4 font-semibold">Microphone</th>
                <th className="py-3 px-4 font-semibold">Fullscreen</th>
                <th className="py-3 px-4 font-semibold">Alerts</th>
                <th className="py-3 px-4 font-semibold">Penalties</th>
                <th className="py-3 px-4 font-semibold">Session Status</th>
                <th className="py-3 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e2e8f0] font-body-sm text-on-surface">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-secondary">
                    <div className="inline-flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-primary-container border-t-transparent rounded-full animate-spin"></span>
                      <span>Loading participant telemetry...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredParticipants.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-secondary">
                    <div className="flex flex-col items-center justify-center">
                      <span className="material-symbols-outlined text-[32px] text-secondary/60 mb-2">
                        sensors_off
                      </span>
                      <p className="font-body-md font-medium text-on-surface">
                        No monitoring sessions recorded.
                      </p>
                      <p className="font-body-sm text-secondary mt-0.5">
                        {contests.length === 0
                          ? "No active contests are currently assigned for monitoring."
                          : "No candidates have launched an assessment session in this contest yet."}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredParticipants.map((p) => (
                  <tr key={p.participantId} className="hover:bg-surface-container-low/30 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex flex-col">
                        <span className="font-label-sm font-semibold text-on-surface">
                          {p.candidateName}
                        </span>
                        <span className="font-mono text-xs text-secondary">
                          {p.candidateId || `Participant #${p.participantId.slice(0, 6)}`}
                        </span>
                      </div>
                    </td>

                    {/* Camera */}
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${
                          p.cameraState === "Permission Granted"
                            ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                            : p.cameraState === "Unavailable"
                            ? "bg-red-50 text-red-800 border border-red-200"
                            : "bg-surface-container-low text-secondary border border-[#e2e8f0]"
                        }`}
                      >
                        <span className="material-symbols-outlined text-[13px]">
                          {p.cameraState === "Permission Granted"
                            ? "videocam"
                            : p.cameraState === "Unavailable"
                            ? "videocam_off"
                            : "do_not_disturb_on"}
                        </span>
                        <span>{p.cameraState}</span>
                      </span>
                    </td>

                    {/* Mic */}
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${
                          p.micState === "Permission Granted"
                            ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                            : p.micState === "Unavailable"
                            ? "bg-red-50 text-red-800 border border-red-200"
                            : "bg-surface-container-low text-secondary border border-[#e2e8f0]"
                        }`}
                      >
                        <span className="material-symbols-outlined text-[13px]">
                          {p.micState === "Permission Granted"
                            ? "mic"
                            : p.micState === "Unavailable"
                            ? "mic_off"
                            : "do_not_disturb_on"}
                        </span>
                        <span>{p.micState}</span>
                      </span>
                    </td>

                    {/* Fullscreen */}
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${
                          p.fullscreenState === "Compliant"
                            ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                            : p.fullscreenState === "Exit Recorded"
                            ? "bg-amber-50 text-amber-900 border border-amber-200 font-semibold"
                            : "bg-surface-container-low text-secondary border border-[#e2e8f0]"
                        }`}
                      >
                        <span className="material-symbols-outlined text-[13px]">
                          {p.fullscreenState === "Compliant"
                            ? "fullscreen"
                            : p.fullscreenState === "Exit Recorded"
                            ? "fullscreen_exit"
                            : "crop_square"}
                        </span>
                        <span>{p.fullscreenState}</span>
                      </span>
                    </td>

                    {/* Alerts */}
                    <td className="py-3 px-4">
                      {p.alertCount === 0 ? (
                        <span className="text-secondary text-xs">0 alerts</span>
                      ) : (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-900">
                          {p.alertCount} alert{p.alertCount > 1 ? "s" : ""}
                        </span>
                      )}
                    </td>

                    {/* Penalties */}
                    <td className="py-3 px-4 font-mono text-xs">
                      {p.totalPenalties > 0 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                          -{p.totalPenalties} pts
                        </span>
                      ) : (
                        <span className="text-secondary">0 pts</span>
                      )}
                    </td>

                    {/* Session Status */}
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-label-xs font-semibold ${
                          p.sessionStatus === "IN_PROGRESS"
                            ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                            : p.sessionStatus === "SUBMITTED"
                            ? "bg-blue-50 text-blue-800 border border-blue-200"
                            : "bg-surface-container text-secondary"
                        }`}
                      >
                        {p.sessionStatus === "IN_PROGRESS" && (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        )}
                        <span>{p.sessionStatus === "IN_PROGRESS" ? "Active" : p.sessionStatus}</span>
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => setSelectedParticipant(p)}
                        className="px-2.5 py-1 text-xs rounded bg-surface-container-low hover:bg-surface-container text-on-surface border border-[#e2e8f0] font-medium transition-colors cursor-pointer"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* PARTICIPANT TELEMETRY DETAIL MODAL */}
      {selectedParticipant && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest max-w-xl w-full rounded-lg border border-[#e2e8f0] shadow-xl p-6 flex flex-col gap-4 max-h-[85vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#e2e8f0]">
              <div>
                <span className="font-label-xs uppercase tracking-wider text-secondary">
                  Telemetry Inspector
                </span>
                <h3 className="font-headline-sm font-semibold text-on-surface">
                  Participant #{selectedParticipant.candidateId || selectedParticipant.participantId.slice(0, 6)}
                </h3>
              </div>
              <button
                onClick={() => setSelectedParticipant(null)}
                className="text-secondary hover:text-on-surface cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Candidate Metadata */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs bg-surface-container-low p-3 rounded border border-[#e2e8f0]">
              <div>
                <span className="text-secondary block">Name:</span>
                <span className="font-semibold text-on-surface">{selectedParticipant.candidateName}</span>
              </div>
              <div>
                <span className="text-secondary block">Email:</span>
                <span className="font-semibold text-on-surface">{selectedParticipant.candidateEmail}</span>
              </div>
              <div>
                <span className="text-secondary block">Session Status:</span>
                <span className="font-semibold text-on-surface">{selectedParticipant.sessionStatus}</span>
              </div>
              <div>
                <span className="text-secondary block">Alerts Logged:</span>
                <span className="font-semibold text-on-surface">{selectedParticipant.alertCount}</span>
              </div>
              <div>
                <span className="text-secondary block">Deducted Penalties:</span>
                <span className={`font-semibold ${selectedParticipant.totalPenalties > 0 ? "text-rose-600" : "text-emerald-700"}`}>
                  {selectedParticipant.totalPenalties > 0 ? `-${selectedParticipant.totalPenalties} pts` : "0 pts"}
                </span>
              </div>
            </div>

            {/* Confirmed Applied Penalties */}
            {selectedParticipant.penalties && selectedParticipant.penalties.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="font-label-xs uppercase tracking-wider text-rose-700 font-semibold flex items-center gap-1">
                  <span className="material-symbols-outlined text-[15px]">gavel</span>
                  <span>Applied Contest Penalties ({selectedParticipant.penalties.length})</span>
                </span>
                <div className="divide-y divide-rose-100 border border-rose-200 bg-rose-50/50 rounded text-xs">
                  {selectedParticipant.penalties.map((pen) => (
                    <div key={pen.id} className="p-2.5 flex items-start justify-between">
                      <div>
                        <span className="font-semibold text-rose-900 block">{pen.reason}</span>
                        <span className="text-[10px] text-rose-700 font-mono">
                          Ref: {pen.eventId} &bull; {new Date(pen.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <span className="font-mono font-bold text-rose-700 shrink-0 ml-2">
                        -{pen.points} pts
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Live Media Availability Notice */}
            <div className="p-2.5 rounded bg-surface-container-low border border-[#e2e8f0] text-[11px] text-secondary flex items-start gap-2">
              <span className="material-symbols-outlined text-[16px] text-primary-container shrink-0 mt-0.5">
                verified
              </span>
              <span>
                Standard Telemetry Protocol: Discrete events, permitted screenshots, and camera stills are captured on violation triggers per contest policy and logged securely with cryptographic event identifiers.
              </span>
            </div>

            {/* Event Timeline */}
            <div className="flex flex-col gap-2 mt-2">
              <span className="font-label-xs uppercase tracking-wider text-secondary font-semibold">
                Monitoring Event Timeline
              </span>

              {selectedParticipant.events.length === 0 ? (
                <div className="p-4 rounded bg-emerald-50/60 border border-emerald-200 text-emerald-800 text-xs text-center">
                  <div className="flex items-center justify-center gap-1.5 font-semibold">
                    <span className="material-symbols-outlined text-[16px]">check_circle</span>
                    <span>No monitoring alerts recorded. All telemetry normal.</span>
                  </div>
                  <p className="text-[11px] text-emerald-700 mt-1">
                    Candidate maintained browser focus and complied with all active proctoring rules.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-[#f1f5f9] border border-[#e2e8f0] rounded max-h-64 overflow-y-auto">
                  {selectedParticipant.events.map((evt) => (
                    <div key={evt.id} className="p-2.5 flex items-start justify-between text-xs hover:bg-surface-container-low/40">
                      <div className="flex items-start gap-2">
                        <span
                          className={`material-symbols-outlined text-[16px] mt-0.5 ${
                            evt.eventType === "TAB_SWITCH" || evt.eventType === "FULLSCREEN_EXIT"
                              ? "text-amber-600"
                              : "text-primary-container"
                          }`}
                        >
                          {evt.eventType === "TAB_SWITCH"
                            ? "tab"
                            : evt.eventType === "FULLSCREEN_EXIT"
                            ? "fullscreen_exit"
                            : evt.eventType === "FULLSCREEN_ENTER"
                            ? "fullscreen"
                            : "info"}
                        </span>
                        <div className="flex flex-col">
                          <span className="font-semibold text-on-surface">
                            {evt.details || evt.status}
                          </span>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1">
                            <span className="text-[10px] text-secondary uppercase tracking-wider font-mono">
                              Type: {evt.eventType}
                            </span>
                            {evt.penaltyApplied && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-rose-100 text-rose-800 border border-rose-200">
                                -5 pts penalty
                              </span>
                            )}
                            {(evt.hasScreenCapture || evt.hasCameraCapture) && (
                              <button
                                onClick={() => handleViewEvidence(evt.id)}
                                disabled={isLoadingEvidence}
                                className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-primary-container/10 text-primary-container border border-primary-container/30 hover:bg-primary-container/20 flex items-center gap-0.5 cursor-pointer"
                              >
                                <span className="material-symbols-outlined text-[11px]">
                                  {evt.hasScreenCapture && evt.hasCameraCapture
                                    ? "perm_media"
                                    : evt.hasCameraCapture
                                    ? "photo_camera"
                                    : "screenshot_monitor"}
                                </span>
                                <span>Evidence</span>
                              </button>
                            )}
                            {evt.captureSuccess === false && (
                              <span className="text-[10px] text-secondary italic">
                                (Capture unavailable)
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <span className="font-mono text-[10px] text-secondary shrink-0">
                        {new Date(evt.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Admin AI Violation Review Section */}
            {role === "ADMIN" && (
              <div className="mt-2 p-3 bg-surface-container-low rounded border border-[#e2e8f0] flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="font-label-xs uppercase tracking-wider text-secondary font-semibold flex items-center gap-1">
                    <span className="material-symbols-outlined text-[15px] text-primary-container">psychology</span>
                    <span>AI Answer Policy Review</span>
                  </span>
                  <span className="text-[11px] text-secondary font-mono">Deduction: -{aiPoints} pts</span>
                </div>
                <p className="text-[11px] text-secondary leading-snug">
                  Career EDGE Assess policy requires authorized confirmation before applying an AI-use penalty. Ensure manual verification of candidate response before recording this penalty.
                </p>

                {aiFeedback && (
                  <div
                    className={`p-2 rounded text-xs border ${
                      aiFeedback.type === "success"
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : "bg-red-50 text-red-800 border-red-200"
                    }`}
                  >
                    {aiFeedback.text}
                  </div>
                )}

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={aiReason}
                    onChange={(e) => setAiReason(e.target.value)}
                    placeholder="Enter explicit review rationale (e.g. LLM phrasing match confirmed)..."
                    className="flex-1 px-2.5 py-1.5 text-xs rounded bg-surface-container-lowest border border-[#e2e8f0] text-on-surface focus:outline-none focus:border-primary-container"
                  />
                  <button
                    onClick={handleConfirmAiViolation}
                    disabled={isConfirmingAi || !aiReason.trim()}
                    className="px-3 py-1.5 text-xs font-semibold rounded bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-50 cursor-pointer transition-colors"
                  >
                    {isConfirmingAi ? "Applying..." : "Apply Penalty"}
                  </button>
                </div>
              </div>
            )}

            {/* Modal Actions */}
            <div className="pt-3 flex items-center justify-end border-t border-[#e2e8f0]">
              <button
                type="button"
                onClick={() => setSelectedParticipant(null)}
                className="px-4 py-1.5 rounded bg-surface-container-high hover:bg-surface-container text-on-surface font-label-sm font-medium cursor-pointer"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EVIDENCE VIEWER MODAL */}
      {selectedEvidence && (
        <div className="fixed inset-0 z-60 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest max-w-2xl w-full rounded-lg border border-[#e2e8f0] shadow-2xl p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#e2e8f0]">
              <div>
                <span className="font-label-xs uppercase tracking-wider text-rose-700 font-semibold flex items-center gap-1">
                  <span className="material-symbols-outlined text-[16px]">security</span>
                  <span>Confidential Audit Evidence</span>
                </span>
                <h3 className="font-headline-sm font-semibold text-on-surface">
                  Telemetry Event #{selectedEvidence.eventId.slice(0, 8)}
                </h3>
                <span className="text-[11px] text-secondary font-mono">
                  Type: {selectedEvidence.eventType} &bull; Logged: {new Date(selectedEvidence.timestamp).toLocaleString()}
                </span>
              </div>
              <button
                onClick={() => setSelectedEvidence(null)}
                className="text-secondary hover:text-on-surface cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Watermark Notice */}
            <div className="p-2 rounded bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px]">lock</span>
              <span>
                RESTRICTED ACCESS: Evidence is collected per contest permission settings and candidate disclosure.
              </span>
            </div>

            {/* Screen Capture */}
            {selectedEvidence.screenCapture && (
              <div className="flex flex-col gap-1.5">
                <span className="font-label-xs uppercase tracking-wider text-secondary font-semibold flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">desktop_windows</span>
                  <span>Screen Capture (Candidate Active Window)</span>
                </span>
                <div className="rounded border border-[#e2e8f0] overflow-hidden bg-black/5 flex items-center justify-center max-h-72">
                  <img
                    src={selectedEvidence.screenCapture}
                    alt="Screen Capture Evidence"
                    className="max-h-72 w-auto object-contain"
                  />
                </div>
              </div>
            )}

            {/* Camera Capture */}
            {selectedEvidence.cameraCapture && (
              <div className="flex flex-col gap-1.5">
                <span className="font-label-xs uppercase tracking-wider text-secondary font-semibold flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">photo_camera</span>
                  <span>Camera Still Image (Candidate Consent Verified)</span>
                </span>
                <div className="rounded border border-[#e2e8f0] overflow-hidden bg-black/5 flex items-center justify-center max-h-72">
                  <img
                    src={selectedEvidence.cameraCapture}
                    alt="Camera Capture Evidence"
                    className="max-h-72 w-auto object-contain"
                  />
                </div>
              </div>
            )}

            {!selectedEvidence.screenCapture && !selectedEvidence.cameraCapture && (
              <div className="p-6 text-center text-secondary border border-dashed border-[#e2e8f0] rounded">
                <span className="material-symbols-outlined text-[32px] mb-1">no_photography</span>
                <p className="font-body-sm font-semibold text-on-surface">No image payload captured</p>
                <p className="text-xs text-secondary mt-1">
                  {selectedEvidence.failureReason || "Capture was disabled by contest permission settings or browser API restriction."}
                </p>
              </div>
            )}

            <div className="pt-3 flex items-center justify-end border-t border-[#e2e8f0]">
              <button
                type="button"
                onClick={() => setSelectedEvidence(null)}
                className="px-4 py-1.5 rounded bg-surface-container-high hover:bg-surface-container text-on-surface font-label-sm font-medium cursor-pointer"
              >
                Close Evidence
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
