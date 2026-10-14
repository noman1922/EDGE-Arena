"use client";

import React, { useState } from "react";
import Link from "next/link";
import { DEMO_CONTESTS, DEMO_METRICS, ContestFixture } from "@/lib/demo-data";

export default function ContestManagementPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | "Live" | "Completed" | "Draft">("All");
  const [selectedContest, setSelectedContest] = useState<ContestFixture | null>(null);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  const filteredContests = DEMO_CONTESTS.filter((c) => {
    const matchesFilter = statusFilter === "All" || c.status === statusFilter;
    const matchesSearch =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.stage.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const toggleSelectAll = () => {
    if (selectedRows.length === filteredContests.length) {
      setSelectedRows([]);
    } else {
      setSelectedRows(filteredContests.map((c) => c.id));
    }
  };

  const toggleSelectRow = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedRows((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]
    );
  };

  return (
    <div className="flex flex-col w-full pb-space-xl">
      {/* Top Breadcrumb & Live Health Telemetry Bar */}
      <div className="flex flex-wrap items-center justify-between gap-space-sm pb-space-sm border-b border-[#e2e8f0]">
        <div className="flex items-center gap-space-xs font-label-xs text-secondary">
          <span>WORKSPACE</span>
          <span className="material-symbols-outlined text-[14px]">chevron_right</span>
          <span>DEMO COHORT CLP-2025</span>
          <span className="material-symbols-outlined text-[14px]">chevron_right</span>
          <span className="text-primary-container font-semibold">ASSESSMENT ENGINE</span>
        </div>
        <div className="flex items-center gap-space-xs font-label-xs text-on-surface-variant">
          <span className="w-2 h-2 rounded-full bg-primary-container animate-pulse"></span>
          <span className="font-semibold text-on-surface">Telemetry Active (Mock):</span>
          <span className="text-secondary">Sync latency 42ms • 4 assessment tracks</span>
        </div>
      </div>

      {/* Header Section */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-space-md mt-space-sm mb-space-lg">
        <div>
          <div className="flex items-center gap-space-sm">
            <h1 className="font-display-lg text-on-surface tracking-tight">Contests</h1>
            <span className="px-space-sm py-0.5 rounded-full bg-surface-container-high border border-[#e2e8f0] text-secondary font-label-xs font-semibold tabular-nums">
              {DEMO_CONTESTS.length} Sample Templates
            </span>
          </div>
          <p className="font-body-md text-secondary mt-1 max-w-2xl">
            Manage leadership challenges, phases, diagnostic evaluation rubrics, and automated candidate grading pipelines.
          </p>
        </div>

        {/* Actions Group */}
        <div className="flex items-center gap-space-sm flex-wrap">
          <button
            onClick={() => alert("[Demo Action] Sample contests CSV exported.")}
            className="h-10 px-space-md bg-surface-container-lowest hover:bg-surface-container text-on-surface rounded border border-[#e2e8f0] shadow-2xs flex items-center gap-space-xs font-label-md transition-colors"
          >
            <span className="material-symbols-outlined text-[18px] text-secondary">
              file_download
            </span>
            <span>Export CSV</span>
          </button>
          <button
            onClick={() => alert("[Demo Action] Contest template import dialog.")}
            className="h-10 px-space-md bg-surface-container-lowest hover:bg-surface-container text-on-surface rounded border border-[#e2e8f0] shadow-2xs flex items-center gap-space-xs font-label-md transition-colors"
          >
            <span className="material-symbols-outlined text-[18px] text-secondary">
              upload_file
            </span>
            <span>Import Contests</span>
          </button>
          <button
            onClick={() => alert("[Demo Action] Create Contest wizard ready.")}
            className="h-10 px-space-md bg-primary-container hover:bg-[#166534] text-on-primary rounded shadow-2xs flex items-center gap-space-xs font-label-md font-medium transition-all active:scale-[0.98]"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            <span>Create Contest</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs p-space-sm mb-space-md flex flex-col md:flex-row items-stretch md:items-center justify-between gap-space-sm">
        <div className="flex-1 flex items-center gap-space-sm px-space-sm">
          <span className="material-symbols-outlined text-[20px] text-secondary">search</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter by challenge name, phase, rubric tags (e.g. 'ESG', 'Ideation')..."
            className="w-full bg-transparent text-on-surface placeholder:text-secondary font-body-md focus:outline-none"
          />
          <span className="hidden md:inline-flex text-[10px] font-label-xs px-1.5 py-0.5 rounded bg-surface-container text-secondary border border-[#e2e8f0]">
            /
          </span>
        </div>

        <div className="flex items-center gap-space-xs flex-wrap">
          {/* Segment Controls */}
          <div className="flex items-center bg-surface-container-low p-0.5 rounded border border-[#e2e8f0]">
            {(["All", "Live", "Completed", "Draft"] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-space-sm py-1 rounded font-label-xs transition-colors ${
                  statusFilter === status
                    ? "bg-surface-container-lowest text-on-surface font-semibold shadow-2xs"
                    : "text-secondary hover:text-on-surface"
                }`}
              >
                {status}{" "}
                {status !== "All" &&
                  `(${DEMO_CONTESTS.filter((c) => c.status === status).length})`}
              </button>
            ))}
          </div>

          <div className="px-space-sm py-1 bg-surface-container-low rounded border border-[#e2e8f0] font-label-xs text-on-surface flex items-center gap-1">
            <span className="material-symbols-outlined text-[16px] text-secondary">groups</span>
            <span>Sample Cohort 2025</span>
          </div>
        </div>
      </div>

      {/* Structured Data Table Card */}
      <div className="bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs overflow-hidden flex flex-col">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low h-10 text-secondary font-label-xs tracking-wider uppercase border-b border-[#e2e8f0]">
                <th className="py-2 px-space-md font-medium w-8">
                  <input
                    type="checkbox"
                    checked={
                      selectedRows.length === filteredContests.length &&
                      filteredContests.length > 0
                    }
                    onChange={toggleSelectAll}
                    aria-label="Select all"
                    className="w-4 h-4 rounded accent-primary cursor-pointer"
                  />
                </th>
                <th className="py-2 px-space-md font-medium">Contest Name & Phase</th>
                <th className="py-2 px-space-md font-medium">Status</th>
                <th className="py-2 px-space-md font-medium">Enrolled Cohort</th>
                <th className="py-2 px-space-md font-medium min-w-[200px]">Submission Progress</th>
                <th className="py-2 px-space-md font-medium">Window / Dates</th>
                <th className="py-2 px-space-md font-medium text-right pr-space-lg">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f5f9] text-on-surface font-body-md">
              {filteredContests.length > 0 ? (
                filteredContests.map((c) => {
                  const percent = Math.round((c.submitted / c.total) * 100);
                  const isSelected = selectedRows.includes(c.id);

                  return (
                    <tr
                      key={c.id}
                      onClick={() => setSelectedContest(c)}
                      className="group hover:bg-surface-container-low/60 transition-colors cursor-pointer"
                    >
                      <td className="py-4 px-space-md" onClick={(e) => toggleSelectRow(c.id, e)}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          aria-label="Select Row"
                          className="w-4 h-4 rounded accent-primary cursor-pointer"
                        />
                      </td>
                      <td className="py-4 px-space-md">
                        <div className="flex items-start gap-space-sm">
                          <div
                            className={`w-8 h-8 rounded ${c.iconBg} flex items-center justify-center ${c.iconColor} mt-0.5 shrink-0`}
                          >
                            <span className="material-symbols-outlined text-[18px]">
                              {c.icon}
                            </span>
                          </div>
                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-space-xs">
                              <span className="font-headline-sm text-on-surface group-hover:text-primary-container transition-colors truncate">
                                {c.name}
                              </span>
                              <span className="material-symbols-outlined text-[14px] text-secondary opacity-0 group-hover:opacity-100 transition-opacity">
                                open_in_new
                              </span>
                            </div>
                            <span className="font-label-sm text-secondary truncate mt-0.5">
                              {c.stage}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-space-md whitespace-nowrap">
                        {c.status === "Live" && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-on-tertiary-container text-on-primary-fixed-variant font-label-xs font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary-container animate-pulse"></span>
                            Live
                          </span>
                        )}
                        {c.status === "Completed" && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-xs font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
                            Completed
                          </span>
                        )}
                        {c.status === "Draft" && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-container-high text-secondary font-label-xs font-medium">
                            Draft
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-space-md whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="font-label-md font-medium">{c.cohortText}</span>
                          <span className="font-label-xs text-secondary">{c.cohortSubtext}</span>
                        </div>
                      </td>
                      <td className="py-4 px-space-md">
                        {c.status !== "Draft" ? (
                          <div className="flex flex-col gap-1.5">
                            <div className="flex justify-between items-center font-label-xs">
                              <span className="font-medium text-on-surface">
                                {c.submitted} / {c.total} Submitted
                              </span>
                              <span className="font-semibold text-primary-container tabular-nums">
                                {percent}%
                              </span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-surface-container overflow-hidden">
                              <div
                                className="h-full bg-primary-container rounded-full transition-all duration-500"
                                style={{ width: `${percent}%` }}
                              ></div>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-space-xs font-label-sm text-secondary">
                            <span className="material-symbols-outlined text-[16px]">edit_note</span>
                            <span>Drafting Rubric (Step 2 of 4)</span>
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-space-md whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-label-sm text-on-surface">
                          <span className="material-symbols-outlined text-[16px] text-secondary">
                            date_range
                          </span>
                          <span>{c.dates}</span>
                        </div>
                      </td>
                      <td
                        className="py-4 px-space-md text-right pr-space-lg whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-space-xs">
                          <button
                            onClick={() => setSelectedContest(c)}
                            className="px-space-sm py-1.5 rounded bg-primary-container hover:bg-[#166534] text-on-primary font-label-xs font-medium transition-colors"
                          >
                            Manage
                          </button>
                          <div className="relative inline-block text-left">
                            <button
                              onClick={() =>
                                setActiveMenu(activeMenu === c.id ? null : c.id)
                              }
                              className="p-1.5 text-secondary hover:text-on-surface rounded hover:bg-surface-container transition-colors"
                            >
                              <span className="material-symbols-outlined text-[18px]">
                                more_vert
                              </span>
                            </button>
                            {activeMenu === c.id && (
                              <div className="absolute right-0 mt-1 w-36 bg-surface-container-lowest border border-[#e2e8f0] rounded shadow-md z-30 py-1">
                                <button
                                  onClick={() => setActiveMenu(null)}
                                  className="w-full text-left px-space-sm py-1.5 font-label-xs text-on-surface hover:bg-surface-container flex items-center gap-1.5"
                                >
                                  <span className="material-symbols-outlined text-[16px]">edit</span>
                                  Edit
                                </button>
                                <button
                                  onClick={() => setActiveMenu(null)}
                                  className="w-full text-left px-space-sm py-1.5 font-label-xs text-on-surface hover:bg-surface-container flex items-center gap-1.5"
                                >
                                  <span className="material-symbols-outlined text-[16px]">
                                    content_copy
                                  </span>
                                  Duplicate
                                </button>
                                <button
                                  onClick={() => setActiveMenu(null)}
                                  className="w-full text-left px-space-sm py-1.5 font-label-xs text-error hover:bg-error-container/20 flex items-center gap-1.5"
                                >
                                  <span className="material-symbols-outlined text-[16px]">archive</span>
                                  Archive
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="py-12 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center text-secondary mb-3">
                        <span className="material-symbols-outlined text-[24px]">search_off</span>
                      </div>
                      <h4 className="font-headline-sm font-semibold text-on-surface">No Contests Found</h4>
                      <p className="font-body-sm text-secondary mt-1">
                        No sample benchmarks match &quot;{searchQuery}&quot;.
                      </p>
                      <button
                        onClick={() => {
                          setSearchQuery("");
                          setStatusFilter("All");
                        }}
                        className="mt-3 px-3.5 py-1.5 rounded bg-surface-container-low hover:bg-surface-container text-on-surface font-label-sm border border-[#e2e8f0]"
                      >
                        Reset Search
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer */}
        <div className="p-space-sm px-space-md bg-surface-container-low flex flex-col sm:flex-row items-center justify-between gap-space-sm font-label-sm text-secondary border-t border-[#e2e8f0]">
          <div className="flex items-center gap-space-sm">
            <span>
              Showing <strong className="text-on-surface">1–{filteredContests.length}</strong> of{" "}
              <strong className="text-on-surface">{DEMO_CONTESTS.length}</strong> sample templates
            </span>
            <span className="text-secondary/40">•</span>
            <span className="hidden sm:inline">Select row for diagnostic telemetry preview</span>
          </div>
          <div className="flex items-center gap-space-xs">
            <button
              disabled
              className="h-8 px-2.5 rounded bg-surface-container-lowest border border-[#e2e8f0] text-secondary opacity-50 cursor-not-allowed flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[16px]">chevron_left</span>
              <span>Previous</span>
            </button>
            <span className="px-space-sm py-1 rounded bg-surface-container text-on-surface font-semibold border border-[#e2e8f0]">
              1
            </span>
            <button
              disabled
              className="h-8 px-2.5 rounded bg-surface-container-lowest border border-[#e2e8f0] text-secondary opacity-50 cursor-not-allowed flex items-center gap-1"
            >
              <span>Next</span>
              <span className="material-symbols-outlined text-[16px]">chevron_right</span>
            </button>
          </div>
        </div>
      </div>

      {/* Operational Bento Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md mt-space-lg">
        <div className="p-space-md bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-secondary mb-space-sm">
            <span className="font-label-xs uppercase tracking-wider">Evaluation Velocity</span>
            <span className="material-symbols-outlined text-[18px] text-primary-container">
              speed
            </span>
          </div>
          <div className="flex items-baseline gap-space-xs">
            <span className="font-display-lg text-on-surface tabular-nums">
              {DEMO_METRICS.evaluationVelocity.value}
            </span>
            <span className="font-label-xs text-primary-container font-semibold flex items-center">
              <span className="material-symbols-outlined text-[14px]">arrow_upward</span>
              {DEMO_METRICS.evaluationVelocity.change}
            </span>
          </div>
          <p className="font-body-sm text-secondary mt-1">
            {DEMO_METRICS.evaluationVelocity.note}
          </p>
        </div>

        <div className="p-space-md bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-secondary mb-space-sm">
            <span className="font-label-xs uppercase tracking-wider">Cohort Integrity Index</span>
            <span className="material-symbols-outlined text-[18px] text-tertiary">security</span>
          </div>
          <div className="flex items-baseline gap-space-xs">
            <span className="font-display-lg text-on-surface tabular-nums">
              {DEMO_METRICS.integrityIndex.value}
            </span>
            <span className="font-label-xs text-secondary font-medium">
              {DEMO_METRICS.integrityIndex.note}
            </span>
          </div>
          <p className="font-body-sm text-secondary mt-1">
            Biometric proctoring telemetry validated with zero critical breaches.
          </p>
        </div>

        <div className="p-space-md bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-secondary mb-space-sm">
            <span className="font-label-xs uppercase tracking-wider">Next Benchmark Milestone</span>
            <span className="material-symbols-outlined text-[18px] text-secondary">
              calendar_clock
            </span>
          </div>
          <div className="flex items-baseline gap-space-xs">
            <span className="font-display-lg text-on-surface tabular-nums">
              {DEMO_METRICS.nextMilestone.value}
            </span>
            <span className="font-label-xs text-secondary font-medium">
              {DEMO_METRICS.nextMilestone.note}
            </span>
          </div>
          <p className="font-body-sm text-secondary mt-1">
            Sample submission cut-off at 23:59 GMT (Simulated Schedule).
          </p>
        </div>
      </div>

      {/* Linear-Style Slide-Over Drawer */}
      {selectedContest && (
        <div
          className="fixed inset-0 bg-inverse-surface/40 backdrop-blur-xs z-50 flex justify-end transition-opacity"
          onClick={() => setSelectedContest(null)}
        >
          <div
            className="w-full max-w-xl bg-surface-container-lowest h-full shadow-2xl p-space-lg flex flex-col justify-between border-l border-[#e2e8f0]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col overflow-y-auto pr-1">
              {/* Drawer Header */}
              <div className="flex items-center justify-between pb-space-md border-b border-[#f1f5f9]">
                <div className="flex items-center gap-space-xs">
                  <span className="px-2 py-0.5 rounded bg-on-tertiary-container text-on-primary-fixed-variant font-label-xs font-semibold">
                    {selectedContest.status} Track
                  </span>
                  <span className="font-label-xs text-secondary font-mono">
                    ID: DEMO-CLP-2025-01
                  </span>
                </div>
                <button
                  onClick={() => setSelectedContest(null)}
                  className="p-1 rounded text-secondary hover:text-on-surface hover:bg-surface-container"
                  aria-label="Close inspector"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>

              {/* Title Lockup */}
              <h2 className="font-headline-lg text-on-surface tracking-tight mt-3">
                {selectedContest.name}
              </h2>
              <p className="font-body-md text-secondary mt-1">{selectedContest.stage}</p>

              {/* Metric Strip */}
              <div className="grid grid-cols-2 gap-space-sm my-space-md">
                <div className="p-space-sm bg-surface-container-low rounded border border-[#e2e8f0]">
                  <span className="font-label-xs text-secondary block">Participation Rate</span>
                  <span className="font-headline-md text-primary-container font-bold tabular-nums">
                    {Math.round((selectedContest.submitted / selectedContest.total) * 100)}%
                  </span>
                  <span className="font-label-xs text-secondary">
                    {selectedContest.submitted} of {selectedContest.total} enrolled
                  </span>
                </div>
                <div className="p-space-sm bg-surface-container-low rounded border border-[#e2e8f0]">
                  <span className="font-label-xs text-secondary block">Avg Assessment Score</span>
                  <span className="font-headline-md text-on-surface font-bold tabular-nums">
                    {selectedContest.avgScore}
                  </span>
                  <span className="font-label-xs text-primary-container font-medium">
                    Sample Benchmark Median
                  </span>
                </div>
              </div>

              {/* Rubric Distribution Matrix */}
              <div className="flex flex-col gap-space-sm mt-space-sm">
                <span className="font-label-xs uppercase tracking-wider text-secondary font-semibold">
                  Evaluation Rubric Matrix
                </span>
                <div className="space-y-space-sm">
                  {selectedContest.rubrics.map((rubric) => (
                    <div key={rubric.name}>
                      <div className="flex justify-between font-label-xs mb-1">
                        <span className="text-on-surface font-medium">{rubric.name}</span>
                        <span className="text-secondary tabular-nums">
                          {rubric.weight}% weight • {rubric.passRate}% pass
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-surface-container rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary-container rounded-full"
                          style={{ width: `${rubric.passRate}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent Submissions */}
              <div className="mt-space-lg flex flex-col gap-space-xs">
                <span className="font-label-xs uppercase tracking-wider text-secondary font-semibold">
                  Recent Submissions (Sample Cohort)
                </span>
                <div className="divide-y divide-[#f1f5f9] text-body-sm">
                  {selectedContest.recentUploads.length > 0 ? (
                    selectedContest.recentUploads.map((sub, i) => (
                      <div key={i} className="py-2.5 flex items-center justify-between">
                        <div className="flex items-center gap-space-xs">
                          <div className="w-6 h-6 rounded-full bg-primary-fixed flex items-center justify-center font-label-xs font-bold text-on-primary-fixed">
                            DC
                          </div>
                          <span className="text-on-surface font-medium">{sub.name}</span>
                        </div>
                        <span className="font-label-xs text-secondary">
                          {sub.score ? `${sub.score} • ` : ""}
                          {sub.time}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="py-2 text-secondary font-body-sm italic">
                      No candidate submissions received yet.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Drawer Footer Actions */}
            <div className="pt-space-md flex items-center justify-end gap-space-sm border-t border-[#f1f5f9]">
              <button
                onClick={() => setSelectedContest(null)}
                className="px-space-md py-2 rounded bg-surface-container-high hover:bg-surface-container text-on-surface font-label-md transition-colors border border-[#e2e8f0]"
              >
                Dismiss
              </button>
              <Link
                href="/assessment"
                className="px-space-md py-2 rounded bg-primary-container hover:bg-[#166534] text-on-primary font-label-md font-medium transition-colors shadow-2xs"
              >
                Inspect Submissions
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
