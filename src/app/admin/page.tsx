"use client";

import React, { useState } from "react";
import Link from "next/link";

export default function AdminOverviewPage() {
  const [filterTab, setFilterTab] = useState<"All" | "Live" | "Draft">("All");
  const [searchTerm, setSearchTerm] = useState("");

  const programs = [
    {
      id: "ncic-2025",
      title: "National Campus Innovation Challenge 2025",
      phase: "Phase 2: ESG Transformation & Strategic Planning",
      track: "Track A",
      status: "Live",
      dates: "Jan 15 – Feb 28, 2025",
      daysLeft: "4 days left",
      enrolled: 75,
      submitted: 61,
      progress: 81.3,
      badgeColor: "bg-tertiary-fixed text-on-tertiary-fixed",
    },
    {
      id: "sustainable-enterprise",
      title: "Sustainable Enterprise Ideation Hackathon",
      phase: "Phase 1: Concept Validation & Pitch Deck Assessment",
      track: "Track B",
      status: "Live",
      dates: "Feb 01 – Mar 10, 2025",
      daysLeft: "24 days left",
      enrolled: 75,
      submitted: 44,
      progress: 58.6,
      badgeColor: "bg-tertiary-fixed text-on-tertiary-fixed",
    },
    {
      id: "q2-simulation",
      title: "Q2 Executive Policy Simulation",
      phase: "Curriculum drafting in progress · 8 modules designed",
      track: "Strategic Simulation",
      status: "Draft",
      dates: "Starts Apr 05, 2025",
      daysLeft: "Upcoming",
      enrolled: 0,
      submitted: 0,
      progress: 0,
      badgeColor: "bg-surface-container-high text-secondary",
    },
  ];

  const filteredPrograms = programs.filter((p) => {
    const matchesFilter = filterTab === "All" || p.status === filterTab;
    const matchesSearch =
      p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.phase.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="flex flex-col w-full pb-space-xl">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-md pt-2 pb-space-lg">
        <div>
          <div className="flex items-center gap-space-xs text-secondary font-label-xs uppercase tracking-wider mb-1">
            <span>Diagnostic Suite</span>
            <span>/</span>
            <span className="text-primary-container font-semibold">Cohort CLP-2025</span>
          </div>
          <h1 className="font-display-lg text-on-surface">Overview</h1>
          <p className="font-body-md text-secondary mt-1">
            Platform activity and active leadership cohorts
          </p>
        </div>

        {/* Top Actions */}
        <div className="flex items-center gap-space-sm self-start md:self-auto flex-wrap">
          <button
            onClick={() => alert("Diagnostic export generated for Cohort CLP-2025.")}
            className="inline-flex items-center gap-space-xs px-space-md py-2 bg-surface-container-lowest text-on-surface font-label-md rounded border border-[#e2e8f0] shadow-2xs hover:bg-surface-container transition-all active:scale-[0.98]"
          >
            <span className="material-symbols-outlined text-[18px] text-secondary">
              ios_share
            </span>
            <span>Export Report</span>
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
              2 <span className="font-headline-sm font-normal text-secondary">/ 3</span>
            </div>
            <div className="font-body-sm text-secondary flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-primary-container"></span>
              <span>2 live · 1 upcoming</span>
            </div>
          </div>
        </div>

        {/* Stat 2 */}
        <div className="p-space-lg bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-secondary mb-3">
            <span className="font-label-sm uppercase tracking-wide">Enrolled Leaders</span>
            <span className="material-symbols-outlined text-[18px] text-secondary">group</span>
          </div>
          <div>
            <div className="font-display-lg text-on-surface tracking-tight leading-none mb-2 tabular-nums">
              75
            </div>
            <div className="font-body-sm text-secondary">
              Across 12 accredited institutions
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
              14
            </div>
            <div className="font-body-sm text-secondary flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-error"></span>
              <span>Submissions awaiting panel review</span>
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
              88.4%
            </div>
            <div className="font-body-sm text-primary-container flex items-center gap-1">
              <span className="material-symbols-outlined text-[15px]">trending_up</span>
              <span>Cohort strictly on schedule</span>
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
              <h2 className="font-headline-lg text-on-surface">Contest Programs</h2>
              <p className="font-body-sm text-secondary">
                Multi-phase benchmarks currently running
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
                    {tab} ({tab === "All" ? 3 : tab === "Live" ? 2 : 1})
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

          {/* Program List Card */}
          <div className="bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs divide-y divide-[#f1f5f9] overflow-hidden">
            {filteredPrograms.map((program) => (
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
                    {program.title}
                  </h3>
                  <p className="font-body-sm text-secondary mt-0.5 truncate">
                    {program.phase}
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
                        {program.enrolled} Leaders · {program.submitted} Submitted
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-secondary/70">
                        <span className="material-symbols-outlined text-[15px]">person_off</span>
                        Not assigned to cohort yet
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
            ))}
          </div>

          {/* Institutional Distribution Bento */}
          <div className="p-space-lg bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-space-md">
            <div className="flex items-center gap-space-md">
              <div className="w-10 h-10 rounded bg-tertiary-fixed flex items-center justify-center text-on-tertiary-fixed shrink-0">
                <span className="material-symbols-outlined text-[20px]">account_balance</span>
              </div>
              <div>
                <span className="font-headline-sm text-on-surface">12 Participating Universities</span>
                <p className="font-body-sm text-secondary">
                  Tier-1 campus clusters actively reporting benchmark diagnostics
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-label-xs bg-surface-container px-2.5 py-1 rounded text-on-surface-variant font-medium border border-[#e2e8f0]">
                NUS Singapore
              </span>
              <span className="font-label-xs bg-surface-container px-2.5 py-1 rounded text-on-surface-variant font-medium border border-[#e2e8f0]">
                IIT Delhi
              </span>
              <span className="font-label-xs bg-surface-container px-2.5 py-1 rounded text-on-surface-variant font-medium border border-[#e2e8f0]">
                Monash
              </span>
              <span className="font-label-xs text-secondary font-medium pl-1">+9 more</span>
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
                Real-time
              </span>
            </div>

            <div className="flex flex-col divide-y divide-[#f1f5f9]">
              {/* Item 1 */}
              <div className="py-space-sm flex gap-space-sm items-start">
                <div className="w-7 h-7 rounded-full bg-tertiary-fixed text-on-tertiary-fixed flex items-center justify-center font-label-xs font-bold mt-0.5 shrink-0">
                  SM
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-body-sm text-on-surface leading-snug">
                    <span className="font-semibold">Dr. Sarah Mitchell</span> reviewed{" "}
                    <span className="font-label-xs px-1.5 py-0.5 rounded bg-surface-container font-mono text-on-surface border border-[#e2e8f0]">
                      #SUB-1042
                    </span>
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-label-xs text-primary-container font-medium tabular-nums">
                      Score: 94/100
                    </span>
                    <span className="text-secondary font-label-xs">• 14m ago</span>
                  </div>
                </div>
              </div>

              {/* Item 2 */}
              <div className="py-space-sm flex gap-space-sm items-start">
                <div className="w-7 h-7 rounded-full bg-secondary-fixed text-on-secondary-fixed flex items-center justify-center font-label-xs font-bold mt-0.5 shrink-0">
                  PS
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-body-sm text-on-surface leading-snug">
                    <span className="font-semibold">Prof. Sterling</span> graded 4 written answers for{" "}
                    <span className="text-on-surface">ESG Transformation</span>
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-label-xs text-secondary">4 rubrics applied</span>
                    <span className="text-secondary font-label-xs">• 42m ago</span>
                  </div>
                </div>
              </div>

              {/* Item 3 */}
              <div className="py-space-sm flex gap-space-sm items-start">
                <div className="w-7 h-7 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center mt-0.5 shrink-0">
                  <span className="material-symbols-outlined text-[16px]">verified_user</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-body-sm text-on-surface leading-snug">
                    <span className="font-semibold">Admissions Panel</span> verified cohort credentials for 8 candidate profiles
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-label-xs text-tertiary">Verified Identity</span>
                    <span className="text-secondary font-label-xs">• 2h ago</span>
                  </div>
                </div>
              </div>

              {/* Item 4 */}
              <div className="py-space-sm flex gap-space-sm items-start">
                <div className="w-7 h-7 rounded-full bg-tertiary-fixed text-on-tertiary-fixed flex items-center justify-center mt-0.5 shrink-0">
                  <span className="material-symbols-outlined text-[16px]">auto_graph</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-body-sm text-on-surface leading-snug">
                    Automated proctoring check concluded for{" "}
                    <span className="font-label-xs px-1.5 py-0.5 rounded bg-surface-container font-mono text-on-surface border border-[#e2e8f0]">
                      Session #883
                    </span>
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-label-xs text-primary-container font-medium">
                      0 Violations logged
                    </span>
                    <span className="text-secondary font-label-xs">• 3h ago</span>
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={() => alert("Audit log export ready for compliance download.")}
              className="mt-space-md w-full block text-center py-2 bg-surface-container-low hover:bg-surface-container text-secondary hover:text-on-surface font-label-sm rounded transition-colors border border-[#e2e8f0]"
            >
              View full review audit log
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
