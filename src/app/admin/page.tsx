"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  DEMO_METRICS,
  DEMO_CONTESTS,
  DEMO_EVALUATION_STREAM,
  DEMO_INSTITUTIONS,
} from "@/lib/demo-data";

export default function AdminOverviewPage() {
  const [filterTab, setFilterTab] = useState<"All" | "Live" | "Draft">("All");
  const [searchTerm, setSearchTerm] = useState("");

  const filteredPrograms = DEMO_CONTESTS.filter((p) => {
    const matchesFilter = filterTab === "All" || p.status === filterTab;
    const matchesSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.stage.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="flex flex-col w-full pb-space-xl">
      {/* Disclaimer Banner */}
      <div className="mb-4 px-4 py-2.5 bg-surface-container-low rounded border border-[#e2e8f0] text-secondary font-label-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px] text-primary-container">
            info
          </span>
          <span>
            <strong className="text-on-surface">Demo Environment:</strong> All benchmark metrics, candidate figures, and evaluation streams below are synthetic fixtures for UI verification.
          </span>
        </div>
        <span className="text-secondary/70 shrink-0">Stage 1 Architecture Verification</span>
      </div>

      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-md pt-2 pb-space-lg">
        <div>
          <div className="flex items-center gap-space-xs text-secondary font-label-xs uppercase tracking-wider mb-1">
            <span>Diagnostic Suite</span>
            <span>/</span>
            <span className="text-primary-container font-semibold">Sample Benchmark Suite</span>
          </div>
          <h1 className="font-display-lg text-on-surface">Overview</h1>
          <p className="font-body-md text-secondary mt-1">
            Diagnostic benchmark telemetry and sample cohort progress
          </p>
        </div>

        {/* Top Actions */}
        <div className="flex items-center gap-space-sm self-start md:self-auto flex-wrap">
          <button
            onClick={() => alert("[Demo Action] Sample diagnostic report generated.")}
            className="inline-flex items-center gap-space-xs px-space-md py-2 bg-surface-container-lowest text-on-surface font-label-md rounded border border-[#e2e8f0] shadow-2xs hover:bg-surface-container transition-all active:scale-[0.98]"
          >
            <span className="material-symbols-outlined text-[18px] text-secondary">
              ios_share
            </span>
            <span>Export Report (Sample)</span>
          </button>
          <Link
            href="/admin/contests"
            className="inline-flex items-center gap-space-xs px-space-md py-2 bg-primary-container text-on-primary font-label-md rounded shadow-2xs hover:bg-[#166534] transition-all active:scale-[0.98]"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            <span>Create Contest</span>
          </Link>
        </div>
      </div>

      {/* Metric Cards Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-md mb-space-xl">
        {/* Stat 1 */}
        <div className="p-space-lg bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-secondary mb-3">
            <span className="font-label-sm uppercase tracking-wide">Active Contests</span>
            <span className="material-symbols-outlined text-[18px] text-primary-container">
              workspace_premium
            </span>
          </div>
          <div>
            <div className="font-display-lg text-on-surface tracking-tight leading-none mb-2 tabular-nums">
              {DEMO_METRICS.activeContests.value}{" "}
              <span className="font-headline-sm font-normal text-secondary">
                / {DEMO_METRICS.activeContests.total}
              </span>
            </div>
            <div className="font-body-sm text-secondary flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-primary-container"></span>
              <span>{DEMO_METRICS.activeContests.note}</span>
            </div>
          </div>
        </div>

        {/* Stat 2 */}
        <div className="p-space-lg bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-secondary mb-3">
            <span className="font-label-sm uppercase tracking-wide">Enrolled Cohort</span>
            <span className="material-symbols-outlined text-[18px] text-secondary">group</span>
          </div>
          <div>
            <div className="font-display-lg text-on-surface tracking-tight leading-none mb-2 tabular-nums">
              {DEMO_METRICS.enrolledLeaders.value}
            </div>
            <div className="font-body-sm text-secondary">
              {DEMO_METRICS.enrolledLeaders.note}
            </div>
          </div>
        </div>

        {/* Stat 3 */}
        <div className="p-space-lg bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-secondary mb-3">
            <span className="font-label-sm uppercase tracking-wide">Pending Evaluations</span>
            <span className="material-symbols-outlined text-[18px] text-tertiary">
              pending_actions
            </span>
          </div>
          <div>
            <div className="font-display-lg text-on-surface tracking-tight leading-none mb-2 tabular-nums">
              {DEMO_METRICS.pendingEvaluations.value}
            </div>
            <div className="font-body-sm text-secondary flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-error"></span>
              <span>{DEMO_METRICS.pendingEvaluations.note}</span>
            </div>
          </div>
        </div>

        {/* Stat 4 */}
        <div className="p-space-lg bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-secondary mb-3">
            <span className="font-label-sm uppercase tracking-wide">Average Completion</span>
            <span className="material-symbols-outlined text-[18px] text-primary-container">
              speed
            </span>
          </div>
          <div>
            <div className="font-display-lg text-on-surface tracking-tight leading-none mb-2 tabular-nums">
              {DEMO_METRICS.avgCompletion.value}
            </div>
            <div className="font-body-sm text-primary-container flex items-center gap-1">
              <span className="material-symbols-outlined text-[15px]">trending_up</span>
              <span>{DEMO_METRICS.avgCompletion.note}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Primary Workspace: Programs (8 Cols) vs Live Audit Log (4 Cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
        {/* Left Column: Contests Programs */}
        <div className="lg:col-span-8 flex flex-col gap-space-md">
          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm pb-space-xs">
            <div>
              <h2 className="font-headline-lg text-on-surface">Sample Benchmark Contests</h2>
              <p className="font-body-sm text-secondary">
                Configured multi-phase challenge templates
              </p>
            </div>
            <div className="flex items-center gap-space-sm flex-wrap">
              {/* Filter Tabs */}
              <div className="inline-flex p-1 bg-surface-container rounded gap-1 font-label-xs border border-[#e2e8f0]">
                {(["All", "Live", "Draft"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setFilterTab(tab)}
                    className={`px-space-sm py-1 rounded transition-colors ${
                      filterTab === tab
                        ? "bg-surface-container-lowest text-on-surface font-semibold shadow-2xs"
                        : "text-secondary hover:text-on-surface"
                    }`}
                  >
                    {tab} ({tab === "All" ? DEMO_CONTESTS.length : DEMO_CONTESTS.filter(c => c.status === tab).length})
                  </button>
                ))}
              </div>

              {/* Search */}
              <div className="relative">
                <span className="material-symbols-outlined absolute left-2.5 top-2.5 text-[16px] text-secondary">
                  search
                </span>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Filter programs..."
                  className="w-40 sm:w-48 pl-8 pr-space-sm py-1.5 bg-surface-container-lowest border border-[#e2e8f0] rounded text-on-surface font-body-sm placeholder:text-secondary focus:outline-none focus:border-primary-container"
                />
              </div>
            </div>
          </div>

          {/* Program List Card / Empty State */}
          <div className="bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs divide-y divide-[#f1f5f9] overflow-hidden">
            {filteredPrograms.length > 0 ? (
              filteredPrograms.map((program) => (
                <div
                  key={program.id}
                  className="p-space-lg flex flex-col sm:flex-row sm:items-center justify-between gap-space-md hover:bg-surface-container-low/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-space-xs mb-1">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-label-xs font-semibold tracking-wide ${program.badgeColor}`}
                      >
                        {program.status === "Live" && (
                          <span className="w-1.5 h-1.5 rounded-full bg-primary-container animate-pulse"></span>
                        )}
                        {program.status}
                      </span>
                      <span className="font-label-xs text-secondary">• {program.track}</span>
                    </div>

                    <h3 className="font-headline-sm text-on-surface truncate">
                      {program.name}
                    </h3>
                    <p className="font-body-sm text-secondary mt-0.5 truncate">
                      {program.stage}
                    </p>

                    <div className="flex flex-wrap items-center gap-x-space-md gap-y-1 mt-3 font-label-sm text-secondary">
                      <span className="inline-flex items-center gap-1">
                        <span className="material-symbols-outlined text-[15px]">calendar_today</span>
                        {program.dates}{" "}
                        {program.status === "Live" && (
                          <span className="text-primary-container font-medium">
                            ({program.daysLeft})
                          </span>
                        )}
                      </span>
                      {program.status === "Live" ? (
                        <span className="inline-flex items-center gap-1">
                          <span className="material-symbols-outlined text-[15px]">
                            assignment_turned_in
                          </span>
                          {program.cohortText} · {program.submitted} Submitted
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-secondary/70">
                          <span className="material-symbols-outlined text-[15px]">person_off</span>
                          {program.cohortText}
                        </span>
                      )}
                    </div>

                    {program.status === "Live" && (
                      <div className="w-full max-w-md bg-surface-container rounded-full h-1.5 mt-3 overflow-hidden">
                        <div
                          className="bg-primary-container h-full rounded-full transition-all duration-500"
                          style={{ width: `${program.progress}%` }}
                        ></div>
                      </div>
                    )}
                  </div>

                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-space-sm pt-2 sm:pt-0 shrink-0">
                    {program.status === "Live" && (
                      <span className="font-label-xs text-secondary hidden sm:inline tabular-nums">
                        {program.progress}% Complete
                      </span>
                    )}
                    <Link
                      href={`/admin/contests?focus=${program.id}`}
                      className="inline-flex items-center gap-1 px-space-md py-1.5 bg-surface-container hover:bg-surface-container-high text-primary-container font-label-md rounded transition-colors whitespace-nowrap border border-[#e2e8f0]"
                    >
                      <span>{program.status === "Live" ? "Manage Contest" : "Edit Draft"}</span>
                      <span className="material-symbols-outlined text-[16px]">
                        {program.status === "Live" ? "arrow_forward" : "edit_note"}
                      </span>
                    </Link>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-12 text-center flex flex-col items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center text-secondary mb-3">
                  <span className="material-symbols-outlined text-[24px]">search_off</span>
                </div>
                <h4 className="font-headline-sm font-semibold text-on-surface">No Contests Found</h4>
                <p className="font-body-sm text-secondary mt-1 max-w-sm">
                  No sample benchmark matches your active search term &quot;{searchTerm}&quot; or filter &quot;{filterTab}&quot;.
                </p>
                <button
                  onClick={() => {
                    setSearchTerm("");
                    setFilterTab("All");
                  }}
                  className="mt-4 px-4 py-1.5 rounded bg-surface-container-low hover:bg-surface-container text-on-surface font-label-sm border border-[#e2e8f0]"
                >
                  Clear Filters
                </button>
              </div>
            )}
          </div>

          {/* Institutional Distribution Bento */}
          <div className="p-space-lg bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-space-md">
            <div className="flex items-center gap-space-md">
              <div className="w-10 h-10 rounded bg-tertiary-fixed flex items-center justify-center text-on-tertiary-fixed shrink-0">
                <span className="material-symbols-outlined text-[20px]">account_balance</span>
              </div>
              <div>
                <span className="font-headline-sm text-on-surface">Sample Institution Cohort</span>
                <p className="font-body-sm text-secondary">
                  Synthetic test institutions for multi-campus benchmark verification
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {DEMO_INSTITUTIONS.map((inst, i) => (
                <span
                  key={i}
                  className="font-label-xs bg-surface-container px-2.5 py-1 rounded text-on-surface-variant font-medium border border-[#e2e8f0]"
                >
                  {inst}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Live Audit Stream & Integrity */}
        <div className="lg:col-span-4 flex flex-col gap-space-md">
          {/* Evaluation Stream */}
          <div className="bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs p-space-lg">
            <div className="flex items-center justify-between pb-space-sm mb-space-sm border-b border-[#f1f5f9]">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary-container animate-pulse"></span>
                <h2 className="font-headline-sm text-on-surface">Evaluation Stream</h2>
              </div>
              <span className="font-label-xs text-secondary font-medium uppercase tracking-wide">
                Sample Feed
              </span>
            </div>

            <div className="flex flex-col divide-y divide-[#f1f5f9]">
              {DEMO_EVALUATION_STREAM.map((item) => (
                <div key={item.id} className="py-space-sm flex gap-space-sm items-start">
                  <div
                    className={`w-7 h-7 rounded-full ${item.bg} flex items-center justify-center font-label-xs font-bold mt-0.5 shrink-0`}
                  >
                    {item.icon ? (
                      <span className="material-symbols-outlined text-[16px]">{item.icon}</span>
                    ) : (
                      item.initials
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-body-sm text-on-surface leading-snug">
                      <span className="font-semibold">{item.evaluator}</span>: {item.detail}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {item.score && (
                        <span className="font-label-xs text-primary-container font-medium tabular-nums">
                          {item.score}
                        </span>
                      )}
                      <span className="text-secondary font-label-xs">• {item.time}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => alert("[Demo Action] Full synthetic audit log export ready.")}
              className="mt-space-md w-full block text-center py-2 bg-surface-container-low hover:bg-surface-container text-secondary hover:text-on-surface font-label-sm rounded transition-colors border border-[#e2e8f0]"
            >
              View full review audit log (Sample)
            </button>
          </div>

          {/* Integrity Protocol Card */}
          <div className="bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs p-space-lg">
            <div className="flex items-center justify-between mb-3">
              <span className="font-label-xs uppercase tracking-wider text-secondary font-semibold">
                Integrity Protocol
              </span>
              <span className="font-label-xs bg-tertiary-fixed text-on-tertiary-fixed px-2 py-0.5 rounded font-medium">
                v4.2 Active
              </span>
            </div>
            <p className="font-headline-sm text-on-surface mb-1">Standard Strict Proctoring</p>
            <p className="font-body-sm text-secondary mb-space-md">
              Biometric identity confirmation & browser isolation enabled for all active cohorts.
            </p>
            <div className="flex items-center justify-between pt-space-sm border-t border-[#f1f5f9] text-secondary font-label-sm">
              <span>Candidate Flag Rate</span>
              <span className="font-semibold text-primary-container">0.02% (Nominal)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
