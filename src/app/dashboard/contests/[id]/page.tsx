"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import {
  getTaskAssessmentData,
  type TaskAssessmentData,
} from "@/app/actions/assessment-actions";
import { formatDhakaDisplay } from "@/hooks/use-contest-timer";

function CountdownBadge({ targetDateIso }: { targetDateIso: string }) {
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    isReady: boolean;
  }>({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    isReady: false,
  });

  useEffect(() => {
    function compute() {
      const target = new Date(targetDateIso).getTime();
      const now = Date.now();
      const diffMs = target - now;

      if (diffMs <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, isReady: true });
        return;
      }

      const totalSec = Math.floor(diffMs / 1000);
      const days = Math.floor(totalSec / 86400);
      const hours = Math.floor((totalSec % 86400) / 3600);
      const minutes = Math.floor((totalSec % 3600) / 60);
      const seconds = totalSec % 60;

      setTimeLeft({ days, hours, minutes, seconds, isReady: false });
    }

    compute();
    const interval = setInterval(compute, 1000);
    return () => clearInterval(interval);
  }, [targetDateIso]);

  if (timeLeft.isReady) {
    return (
      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-mono text-sm font-bold shadow-2xs">
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
        <span>Contest Is Now Starting... Refresh to Enter</span>
      </div>
    );
  }

  return (
    <div className="inline-flex flex-wrap items-center gap-2 px-4 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 font-mono text-xs sm:text-sm font-semibold shadow-2xs">
      <span className="material-symbols-outlined text-[18px] text-amber-600 animate-pulse">timer</span>
      <span>Assessment Starts In:</span>
      <span className="px-2 py-0.5 rounded bg-white border border-amber-200 text-amber-800 font-bold tabular-nums">
        {timeLeft.days}d : {timeLeft.hours.toString().padStart(2, "0")}h :{" "}
        {timeLeft.minutes.toString().padStart(2, "0")}m :{" "}
        {timeLeft.seconds.toString().padStart(2, "0")}s
      </span>
    </div>
  );
}

function ContestCurriculumContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const contestId = typeof params?.id === "string" ? params.id : "";
  const notStartedError = searchParams.get("error") === "not_started";

  const [data, setData] = useState<TaskAssessmentData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedPhases, setExpandedPhases] = useState<Record<string, boolean>>({});

  useEffect(() => {
    async function loadCurriculum() {
      if (!contestId) return;
      try {
        setIsLoading(true);
        const res = await getTaskAssessmentData(contestId);
        setData(res);

        // Expand all phases by default
        if (res.phases) {
          const expandMap: Record<string, boolean> = {};
          res.phases.forEach((p) => {
            expandMap[p.id] = true;
          });
          setExpandedPhases(expandMap);
        }
      } catch (err) {
        console.error("Failed to load curriculum overview:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadCurriculum();
  }, [contestId]);

  const togglePhase = (phaseId: string) => {
    setExpandedPhases((prev) => ({
      ...prev,
      [phaseId]: !prev[phaseId],
    }));
  };

  if (isLoading) {
    return (
      <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 py-12 flex flex-col items-center justify-center text-[#545f73]">
        <span className="w-8 h-8 border-3 border-[#15803d] border-t-transparent rounded-full animate-spin mb-3"></span>
        <p className="text-sm font-medium">Loading assessment curriculum roadmap...</p>
      </div>
    );
  }

  if (!data || !data.contest) {
    return (
      <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 py-12">
        <div className="bg-white rounded-xl border border-[#e2e8f0] p-8 text-center shadow-2xs text-[#191c1e]">
          <div className="w-12 h-12 rounded-full bg-[#f2f4f6] flex items-center justify-center text-[#545f73] mx-auto mb-3">
            <span className="material-symbols-outlined text-[24px]">assignment_late</span>
          </div>
          <h3 className="text-lg font-semibold text-[#191c1e]">Contest Not Found</h3>
          <p className="text-sm text-[#545f73] mt-1 max-w-md mx-auto">
            The requested assessment benchmark could not be loaded or you are not enrolled.
          </p>
          <Link
            href="/dashboard"
            className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#15803d] hover:bg-[#166534] text-white font-medium text-sm transition-colors shadow-2xs"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            <span>Back to Dashboard</span>
          </Link>
        </div>
      </div>
    );
  }

  const allTasks = data.allTasks || [];
  const completedTasksCount = allTasks.filter((t) => t.isSubmitted).length;
  const totalTasksCount = allTasks.length || 1;
  const progressPercent = Math.round((completedTasksCount / totalTasksCount) * 100);
  const totalPoints = allTasks.reduce((acc, t) => acc + (t.totalPoints || 0), 0);

  // PRE-CONTEST GATE CHECK
  const isUpcoming =
    Boolean(data.isContestUpcoming) ||
    (data.contest.status as string) === "UPCOMING";

  if (isUpcoming) {
    return (
      <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6 bg-white text-[#191c1e]">
        {/* Breadcrumb Navigation */}
        <nav className="flex items-center gap-2 text-xs text-[#545f73]" aria-label="Breadcrumb">
          <Link href="/dashboard" className="hover:text-[#191c1e] transition-colors">
            Dashboard
          </Link>
          <span>/</span>
          <Link href="/dashboard/contests" className="hover:text-[#191c1e] transition-colors">
            Contests
          </Link>
          <span>/</span>
          <span className="text-[#191c1e] font-medium truncate max-w-xs sm:max-w-md">
            {data.contest.title}
          </span>
        </nav>

        {/* Redirect Notice Toast */}
        {notStartedError && (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm flex items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-center gap-2.5">
              <span className="material-symbols-outlined text-[20px] text-amber-700">info</span>
              <span className="font-semibold">This assessment has not started yet.</span>
            </div>
            <span className="text-xs text-amber-700">Tasks remain locked until live start time</span>
          </div>
        )}

        {/* PRE-CONTEST HEADER ONLY */}
        <div className="bg-white rounded-xl border border-[#e2e8f0] p-6 sm:p-8 shadow-2xs flex flex-col gap-6 relative overflow-hidden text-[#191c1e]">
          <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-amber-500"></div>

          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
            <div className="flex flex-col gap-3 max-w-2xl">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                  Upcoming Assessment
                </span>
                {data.contest.startDate && (
                  <span className="text-xs text-[#545f73] flex items-center gap-1 font-mono">
                    <span className="material-symbols-outlined text-[14px]">event</span>
                    Starts: {formatDhakaDisplay(data.contest.startDate)}
                  </span>
                )}
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-[#191c1e] tracking-tight">
                {data.contest.title}
              </h1>
              {data.contest.track && (
                <div className="flex items-center gap-1.5 text-xs text-[#545f73] font-medium">
                  <span className="material-symbols-outlined text-[16px] text-amber-600">category</span>
                  <span>{data.contest.track}</span>
                </div>
              )}
              {data.contest.description && (
                <p className="text-sm text-[#545f73] leading-relaxed mt-1">
                  {data.contest.description}
                </p>
              )}

              {/* Prominent Live Countdown Badge */}
              {data.contest.startDate && (
                <div className="pt-2">
                  <CountdownBadge targetDateIso={data.contest.startDate} />
                </div>
              )}
            </div>

            {/* Quick Metrics Badge */}
            <div className="bg-[#f8fafc] p-4 rounded-xl border border-[#e2e8f0] flex items-center gap-4 shrink-0 self-start">
              <div className="flex flex-col">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#545f73]">
                  Benchmark Value
                </span>
                <span className="text-xl font-bold text-[#191c1e] tabular-nums">
                  {totalPoints > 0 ? `${totalPoints} Points` : "100 Points"}
                </span>
                <span className="text-[11px] text-amber-700 font-medium mt-0.5">
                  Scheduled · Pre-Contest Stage
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Clean Informational Card */}
        <div className="bg-white rounded-xl border border-[#e2e8f0] p-8 text-center shadow-2xs flex flex-col items-center justify-center gap-3">
          <div className="w-14 h-14 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-500 mb-1">
            <span className="material-symbols-outlined text-[28px]">lock_clock</span>
          </div>
          <h3 className="text-base sm:text-lg font-semibold text-[#191c1e]">
            Curriculum Modules are Pre-Locked
          </h3>
          <p className="text-sm text-[#545f73] max-w-lg leading-relaxed">
            Curriculum modules and assessment tasks will unlock automatically when the contest goes live.
            Please ensure you have a stable network connection and return when the countdown reaches zero.
          </p>
          <div className="pt-2">
            <Link
              href="/dashboard/contests"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[#e2e8f0] bg-white hover:bg-[#f8fafc] text-[#191c1e] text-xs font-medium transition-colors shadow-2xs"
            >
              <span className="material-symbols-outlined text-[16px]">arrow_back</span>
              <span>Back to Contests List</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // LIVE CONTEST CURRICULUM OVERVIEW
  return (
    <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6 bg-white text-[#191c1e]">
      {/* Breadcrumb Navigation */}
      <nav className="flex items-center gap-2 text-xs text-[#545f73]" aria-label="Breadcrumb">
        <Link href="/dashboard" className="hover:text-[#191c1e] transition-colors">
          Dashboard
        </Link>
        <span>/</span>
        <Link href="/dashboard/contests" className="hover:text-[#191c1e] transition-colors">
          Contests
        </Link>
        <span>/</span>
        <span className="text-[#191c1e] font-medium truncate max-w-xs sm:max-w-md">
          {data.contest.title}
        </span>
      </nav>

      {/* Curriculum Overview Banner */}
      <div className="bg-white rounded-xl border border-[#e2e8f0] p-6 sm:p-8 shadow-2xs flex flex-col gap-6 relative overflow-hidden text-[#191c1e]">
        <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-[#15803d]"></div>

        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="flex flex-col gap-2 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#f0fdf4] text-[#166534] border border-[#bbf7d0]">
                Modular Curriculum Path
              </span>
              {data.contest.endDate && (
                <span className="text-xs text-[#545f73] flex items-center gap-1 font-mono">
                  <span className="material-symbols-outlined text-[14px]">calendar_clock</span>
                  Due: {formatDhakaDisplay(data.contest.endDate)}
                </span>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#191c1e] tracking-tight">
              {data.contest.title}
            </h1>
            <p className="text-sm text-[#545f73] leading-relaxed">
              Complete each required phase and unit in sequence. Your submissions and answers are automatically recorded and encrypted.
            </p>
          </div>

          {/* Quick Metrics Badge */}
          <div className="bg-[#f8fafc] p-4 rounded-xl border border-[#e2e8f0] flex items-center gap-4 shrink-0 self-start">
            <div className="flex flex-col">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#545f73]">
                Total Benchmark Value
              </span>
              <span className="text-xl font-bold text-[#191c1e] tabular-nums">
                {totalPoints} Points
              </span>
              <span className="text-[11px] text-[#15803d] font-medium">
                {data.phases?.length || 0} Stages · {allTasks.length} Units
              </span>
            </div>
          </div>
        </div>

        {/* Global Progress Track */}
        <div className="bg-[#f8fafc] p-4 rounded-lg border border-[#e2e8f0] flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-[#191c1e] flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-[#15803d]">
                {progressPercent === 100 ? "verified" : "incomplete_circle"}
              </span>
              <span>Overall Progress ({completedTasksCount} of {totalTasksCount} Units Completed)</span>
            </span>
            <span className="font-mono font-bold text-[#15803d] tabular-nums">
              {progressPercent}%
            </span>
          </div>
          <div className="w-full bg-[#e2e8f0] h-2 rounded-full overflow-hidden">
            <div
              className="bg-[#15803d] h-full rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progressPercent}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* Curriculum Path Modules (Phases as Expandable Modules) */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-[#191c1e] uppercase tracking-wider flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-[#15803d]">school</span>
            <span>Curriculum Modules & Units</span>
          </h2>
          <span className="text-xs text-[#545f73]">
            Click any active unit to launch the focused document reader
          </span>
        </div>

        {(!data.phases || data.phases.length === 0) ? (
          <div className="bg-white rounded-xl border border-[#e2e8f0] p-8 text-center text-[#545f73]">
            No modules have been published for this benchmark yet.
          </div>
        ) : (
          data.phases.map((phase) => {
            const isExpanded = expandedPhases[phase.id] !== false;
            const phaseTasks = phase.tasks || [];
            const phaseCompletedCount = phaseTasks.filter((t) => t.isSubmitted).length;
            const isPhaseCompleted = phaseTasks.length > 0 && phaseCompletedCount === phaseTasks.length;
            const isPhaseLocked = Boolean(phase.isLocked);
            const isPhaseUpcoming = phase.status === "UPCOMING" && !isPhaseLocked;
            const isPhaseConcluded = phase.status === "CLOSED" || phase.status === "EVALUATING";

            return (
              <div
                key={phase.id}
                className="bg-white rounded-xl border border-[#e2e8f0] shadow-2xs overflow-hidden transition-all text-[#191c1e]"
              >
                {/* Module Header Bar (Clickable Accordion) */}
                <div
                  onClick={() => togglePhase(phase.id)}
                  className="p-4 sm:p-5 flex items-center justify-between cursor-pointer hover:bg-[#f8fafc] transition-colors select-none"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm shrink-0 border ${
                        isPhaseCompleted
                          ? "bg-[#f0fdf4] text-[#166534] border-[#bbf7d0]"
                          : isPhaseLocked
                          ? "bg-slate-100 text-slate-400 border-slate-200"
                          : "bg-[#f2f4f6] text-[#191c1e] border-[#e2e8f0]"
                      }`}
                    >
                      {isPhaseCompleted ? (
                        <span className="material-symbols-outlined text-[20px]">check</span>
                      ) : isPhaseLocked ? (
                        <span className="material-symbols-outlined text-[18px]">lock</span>
                      ) : (
                        phase.phaseNumber
                      )}
                    </div>

                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-[#545f73]">
                          Module {phase.phaseNumber}
                        </span>
                        <span
                          className={`px-2 py-0.2 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                            isPhaseCompleted
                              ? "bg-[#dcfce7] text-[#166534]"
                              : isPhaseLocked
                              ? "bg-slate-100 text-slate-500 border border-slate-200"
                              : isPhaseUpcoming
                              ? "bg-[#eff6ff] text-[#1e40af]"
                              : isPhaseConcluded
                              ? "bg-[#f1f5f9] text-[#475569]"
                              : "bg-[#f0fdf4] text-[#15803d]"
                          }`}
                        >
                          {isPhaseCompleted
                            ? "Completed"
                            : isPhaseLocked
                            ? "Locked Stage"
                            : isPhaseUpcoming
                            ? "Upcoming"
                            : isPhaseConcluded
                            ? "Concluded"
                            : "Active Stage"}
                        </span>
                      </div>
                      <h3 className="text-base sm:text-lg font-semibold text-[#191c1e] truncate">
                        {phase.title}
                      </h3>
                      {isPhaseLocked && phase.unlockRequirementText && (
                        <span className="text-[11px] text-[#545f73] mt-0.5">
                          {phase.unlockRequirementText}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="hidden sm:flex flex-col items-end text-right">
                      <span className="text-xs font-semibold text-[#191c1e]">
                        {phaseCompletedCount} / {phaseTasks.length} Units Done
                      </span>
                      <span className="text-[11px] text-[#545f73]">
                        Deadline: {formatDhakaDisplay(phase.deadline)}
                      </span>
                    </div>

                    <span
                      className={`material-symbols-outlined text-[20px] text-[#545f73] transition-transform duration-200 ${
                        isExpanded ? "rotate-180" : ""
                      }`}
                    >
                      expand_more
                    </span>
                  </div>
                </div>

                {/* Module Units List (Tasks) */}
                {isExpanded && (
                  <div className="border-t border-[#e2e8f0] divide-y divide-[#e2e8f0] bg-white">
                    {phaseTasks.length === 0 ? (
                      <p className="p-4 text-xs italic text-[#545f73] text-center">
                        No units configured under this module yet.
                      </p>
                    ) : (
                      phaseTasks.map((unit) => {
                        const unitUrl = `/assessment/${data.contest?.id}/${phase.id}/${unit.id}`;
                        const isUnitLocked = Boolean(unit.isLocked);

                        return (
                          <div
                            key={unit.id}
                            className={`p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                              isUnitLocked ? "bg-[#fafafa]" : "hover:bg-[#f8fafc]"
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              {unit.isSubmitted ? (
                                <span className="material-symbols-outlined text-[20px] text-[#15803d] shrink-0" title="Completed">
                                  check_circle
                                </span>
                              ) : isUnitLocked ? (
                                <span className="material-symbols-outlined text-[20px] text-slate-400 shrink-0" title="Locked">
                                  lock
                                </span>
                              ) : unit.hasDraft ? (
                                <span className="material-symbols-outlined text-[20px] text-amber-500 shrink-0" title="Draft in progress">
                                  edit_note
                                </span>
                              ) : (
                                <span className="w-5 h-5 rounded-full border border-[#cbd5e1] flex items-center justify-center shrink-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-[#94a3b8]"></span>
                                </span>
                              )}

                              <div className="flex flex-col min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-[11px] font-mono font-semibold text-[#545f73]">
                                    Unit {phase.phaseNumber}.{unit.taskNumber}
                                  </span>
                                  {/* Deliverable Type Badges */}
                                  <span
                                    className={`px-2 py-0.2 rounded text-[10px] font-semibold uppercase tracking-wider border ${
                                      unit.questionTypes.includes("FILE_UPLOAD")
                                        ? "bg-[#f5f3ff] text-[#4338ca] border-[#e0e7ff]"
                                        : unit.questionTypes.includes("WRITTEN")
                                        ? "bg-[#eff6ff] text-[#1d4ed8] border-[#dbeafe]"
                                        : "bg-[#f0fdf4] text-[#15803d] border-[#bbf7d0]"
                                    }`}
                                  >
                                    {unit.questionTypes.includes("FILE_UPLOAD")
                                      ? "PDF Document"
                                      : unit.questionTypes.includes("WRITTEN")
                                      ? "Written Essay"
                                      : "Multiple Choice"}
                                  </span>
                                  <span className="text-[11px] font-medium text-[#545f73] tabular-nums">
                                    {unit.totalPoints} pts
                                  </span>
                                </div>
                                <h4
                                  className={`text-sm font-semibold truncate mt-0.5 ${
                                    isUnitLocked ? "text-slate-500" : "text-[#191c1e]"
                                  }`}
                                >
                                  {unit.title}
                                </h4>
                              </div>
                            </div>

                            <div className="flex flex-col items-end gap-1 shrink-0 self-end sm:self-center">
                              {unit.isSubmitted ? (
                                <Link
                                  href={unitUrl}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#e2e8f0] bg-white hover:bg-[#f8fafc] text-[#191c1e] text-xs font-medium transition-colors shadow-2xs"
                                >
                                  <span className="material-symbols-outlined text-[16px] text-[#15803d]">
                                    verified
                                  </span>
                                  <span>Review Unit</span>
                                </Link>
                              ) : isUnitLocked ? (
                                <div className="flex flex-col items-end gap-1">
                                  <div
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-400 border border-slate-200 text-xs font-semibold cursor-not-allowed select-none"
                                    title={unit.unlockRequirementText || "Unit is locked"}
                                  >
                                    <span className="material-symbols-outlined text-[15px]">lock</span>
                                    <span>Locked</span>
                                  </div>
                                  {unit.unlockRequirementText && (
                                    <span className="text-[10px] text-[#545f73] font-medium">
                                      {unit.unlockRequirementText}
                                    </span>
                                  )}
                                </div>
                              ) : unit.hasDraft ? (
                                <Link
                                  href={unitUrl}
                                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#15803d] hover:bg-[#166534] text-white text-xs font-semibold transition-colors shadow-2xs"
                                >
                                  <span>Resume Unit</span>
                                  <span className="material-symbols-outlined text-[16px]">
                                    arrow_forward
                                  </span>
                                </Link>
                              ) : (
                                <Link
                                  href={unitUrl}
                                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#15803d] hover:bg-[#166534] text-white text-xs font-semibold transition-colors shadow-2xs"
                                >
                                  <span>Start Unit</span>
                                  <span className="material-symbols-outlined text-[16px]">
                                    arrow_forward
                                  </span>
                                </Link>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default function ContestCurriculumOverviewPage() {
  return (
    <Suspense
      fallback={
        <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 py-12 flex flex-col items-center justify-center text-[#545f73]">
          <span className="w-8 h-8 border-3 border-[#15803d] border-t-transparent rounded-full animate-spin mb-3"></span>
          <p className="text-sm font-medium">Loading assessment curriculum roadmap...</p>
        </div>
      }
    >
      <ContestCurriculumContent />
    </Suspense>
  );
}
