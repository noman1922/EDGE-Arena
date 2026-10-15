"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { ParticipantHeader } from "@/components/layout/participant-header";
import { ParticipantFooter } from "@/components/layout/participant-footer";
import {
  getParticipantDashboard,
  type ParticipantDashboardContest,
} from "@/app/actions/assessment-actions";

export default function ParticipantDashboardPage() {
  const [candidate, setCandidate] = useState<{
    id: string;
    candidateId: string;
    name: string;
    email: string;
    cohort: string;
    institution: string;
  } | null>(null);

  const [contests, setContests] = useState<ParticipantDashboardContest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadDashboard = async () => {
    try {
      setIsLoading(true);
      const data = await getParticipantDashboard();
      setCandidate(data.candidate);
      setContests(data.contests);
    } catch (err) {
      console.error("Failed to load participant dashboard:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-space-lg sm:py-space-xl flex flex-col gap-space-xl">
          {/* Live Status Banner */}
          <div className="px-4 py-2 bg-on-tertiary-container/60 rounded border border-primary-container/30 text-on-surface font-label-xs flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-primary-container">verified</span>
              <strong>Candidate Database Verified:</strong> Connected to live Supabase Mumbai database. Scoped exclusively to your enrolled assignments.
            </span>
            <span className="text-primary-container font-mono font-semibold">Stage 3 Live</span>
          </div>

          {/* Welcome Header Section */}
          <header className="flex flex-col md:flex-row md:items-end justify-between gap-space-md bg-surface-container-lowest p-space-lg sm:p-space-xl rounded-lg border border-[#e2e8f0] shadow-2xs relative overflow-hidden">
            <div className="flex flex-col gap-space-xs z-10">
              <div className="inline-flex items-center gap-space-xs font-label-xs uppercase tracking-wider text-secondary">
                <span>Candidate ID: {candidate?.candidateId ?? "DEMO-CANDIDATE-01"}</span>
                <span>·</span>
                <span>{candidate?.cohort ?? "Campus Leadership Programme 2025"}</span>
              </div>
              <h1 className="font-display-lg text-on-surface tracking-tight">
                Welcome back, {candidate?.name ?? "Demo Candidate"}
              </h1>
              <p className="font-body-md text-secondary">
                {candidate?.institution ?? "National Campus Leadership Diagnostic Track"}
              </p>
            </div>

            <div className="z-10 flex items-center gap-space-sm bg-surface-container-low px-space-md py-space-sm rounded border border-[#e2e8f0] self-start md:self-auto">
              <span className="w-2 h-2 rounded-full bg-primary-container animate-pulse"></span>
              <div className="flex flex-col">
                <span className="font-label-xs text-on-surface-variant font-semibold">
                  {contests.length} Assigned {contests.length === 1 ? "Challenge" : "Challenges"}
                </span>
                <span className="font-label-xs text-secondary">
                  Live Participant Workspace
                </span>
              </div>
            </div>
          </header>

          {/* Main Content Area: Assigned Contests */}
          <section className="flex flex-col gap-space-lg">
            <div className="flex items-center justify-between pb-space-xs">
              <div className="flex items-baseline gap-space-sm">
                <h2 className="font-headline-lg text-on-surface tracking-tight">
                  Assigned Benchmark Contests
                </h2>
                <span className="font-label-sm text-secondary bg-surface-container-high px-space-sm py-0.5 rounded-full border border-[#e2e8f0]">
                  {contests.length} Active
                </span>
              </div>
              <button
                onClick={() => loadDashboard()}
                className="text-secondary hover:text-on-surface font-label-xs flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[16px]">refresh</span>
                <span>Refresh</span>
              </button>
            </div>

            {/* Contest Cards Stack */}
            <div className="flex flex-col gap-space-lg">
              {isLoading ? (
                <div className="bg-surface-container-lowest rounded-lg p-12 border border-[#e2e8f0] text-center text-secondary">
                  <div className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-primary-container border-t-transparent rounded-full animate-spin"></span>
                    <span>Loading your assigned benchmarks...</span>
                  </div>
                </div>
              ) : contests.length > 0 ? (
                contests.map((c) => (
                  <article
                    key={c.contestId}
                    className="bg-surface-container-lowest rounded-lg p-space-lg sm:p-space-xl border border-[#e2e8f0] shadow-2xs flex flex-col gap-space-lg hover:shadow-xs transition-shadow relative overflow-hidden"
                  >
                    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-primary-container"></div>
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-space-md pl-1">
                      <div className="flex flex-col gap-space-xs max-w-2xl">
                        <div className="flex flex-wrap items-center gap-space-sm">
                          <span className="bg-tertiary-fixed text-on-tertiary-fixed font-label-xs px-2.5 py-0.5 rounded-full font-semibold">
                            {c.stageTitle}
                          </span>
                          <span className="font-label-xs text-secondary flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">
                              lock_clock
                            </span>
                            Proctored Session
                          </span>
                        </div>
                        <h3 className="font-headline-lg text-on-surface tracking-tight pt-1">
                          {c.title}
                        </h3>
                        <p className="font-body-md text-secondary">
                          {c.taskTitle}
                        </p>
                      </div>

                      {/* Deadline Callout Box */}
                      <div className="bg-surface-container-low px-space-md py-space-sm rounded border border-[#e2e8f0] flex items-center gap-space-sm shrink-0 self-start">
                        <span className="material-symbols-outlined text-primary-container text-[20px]">
                          calendar_clock
                        </span>
                        <div className="flex flex-col">
                          <span className="font-label-xs text-secondary font-medium uppercase tracking-wider">
                            Submission Due
                          </span>
                          <span className="font-label-sm text-on-surface font-semibold">
                            {c.deadlineFormatted}
                          </span>
                          <span className="font-label-xs text-primary-container font-semibold">
                            {c.daysRemainingText}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Progress Track */}
                    <div className="flex flex-col gap-space-xs bg-surface-container-low p-space-md rounded border border-[#e2e8f0] ml-1">
                      <div className="flex items-center justify-between font-label-sm">
                        <span className="text-on-surface font-medium flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-primary-container text-[16px]">
                            {c.status === "SUBMITTED" ? "check_circle" : "edit_note"}
                          </span>
                          {c.progressText}
                        </span>
                        <span className="text-secondary font-medium tabular-nums">
                          {c.progressPercent}% Completed
                        </span>
                      </div>
                      <div className="w-full bg-surface-variant h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-primary-container h-full rounded-full transition-all duration-500"
                          style={{ width: `${c.progressPercent}%` }}
                        ></div>
                      </div>
                    </div>

                    {/* Actions Row */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-md pt-space-xs ml-1">
                      <div className="text-secondary font-label-sm flex items-center gap-1">
                        <span className="material-symbols-outlined text-[16px]">domain</span>
                        <span>{c.track}</span>
                      </div>
                      {c.canContinue ? (
                        <Link
                          href="/assessment"
                          className="inline-flex items-center justify-center gap-space-sm px-space-lg py-2.5 rounded bg-primary-container hover:bg-[#166534] text-on-primary font-label-md transition-colors shadow-2xs text-center font-medium active:scale-[0.98]"
                        >
                          <span>{c.progressPercent > 0 ? "Continue Assessment" : "Start Assessment"}</span>
                          <span className="material-symbols-outlined text-[18px]">
                            arrow_forward
                          </span>
                        </Link>
                      ) : (
                        <Link
                          href="/assessment"
                          className="inline-flex items-center justify-center gap-space-sm px-space-lg py-2 rounded bg-surface-container-high hover:bg-surface-container text-on-surface font-label-md transition-colors border border-[#e2e8f0]"
                        >
                          <span className="material-symbols-outlined text-[18px] text-primary-container">
                            verified
                          </span>
                          <span>View Submitted Record</span>
                        </Link>
                      )}
                    </div>
                  </article>
                ))
              ) : (
                <div className="bg-surface-container-lowest rounded-lg p-12 border border-[#e2e8f0] text-center">
                  <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center text-secondary mx-auto mb-3">
                    <span className="material-symbols-outlined text-[24px]">assignment_late</span>
                  </div>
                  <h4 className="font-headline-sm font-semibold text-on-surface">No Assigned Contests</h4>
                  <p className="font-body-sm text-secondary mt-1 max-w-md mx-auto">
                    You do not currently have any active challenge assignments. Ask your cohort administrator to enroll your email ({candidate?.email}).
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* Help & Support Callout */}
          <aside className="bg-surface-container-low p-space-lg rounded-lg border border-[#e2e8f0] flex flex-col sm:flex-row sm:items-center justify-between gap-space-md font-body-sm text-secondary">
            <div className="flex items-center gap-space-sm">
              <span className="material-symbols-outlined text-secondary text-[20px]">
                help_outline
              </span>
              <span>
                Need assistance with assessment access? Contact Academy Support or review the Student Code of Conduct.
              </span>
            </div>
            <div className="flex items-center gap-space-xs font-label-xs text-secondary shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-container"></span>
              <span className="font-medium">System Status: Fully Operational</span>
            </div>
          </aside>
    </div>
  );
}
