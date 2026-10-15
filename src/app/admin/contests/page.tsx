"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { DEMO_METRICS } from "@/lib/demo-data";
import {
  getAdminContests,
  createContestAction,
  assignParticipantAction,
  type AdminContestListItem,
} from "@/app/actions/contest-actions";

export default function ContestManagementPage() {
  const [contests, setContests] = useState<AdminContestListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | "Live" | "Completed" | "Draft">("All");
  const [selectedContest, setSelectedContest] = useState<AdminContestListItem | null>(null);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  // Create Contest Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newTrack, setNewTrack] = useState("Track B · Operational Excellence & AI");
  const [newDescription, setNewDescription] = useState("");
  const [newStartDate, setNewStartDate] = useState("2025-03-01T00:00");
  const [newEndDate, setNewEndDate] = useState("2025-04-15T23:59");
  const [newStatus, setNewStatus] = useState<"LIVE" | "DRAFT">("LIVE");
  const [isSubmittingContest, setIsSubmittingContest] = useState(false);

  // Assign Participant Form State (inside drawer)
  const [assignEmail, setAssignEmail] = useState("");
  const [assignName, setAssignName] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);
  const [assignMessage, setAssignMessage] = useState<string | null>(null);

  const fetchContests = async () => {
    try {
      setIsLoading(true);
      const data = await getAdminContests();
      setContests(data);
      // If a contest is currently selected in drawer, update its reference
      if (selectedContest) {
        const updated = data.find((c) => c.id === selectedContest.id);
        if (updated) setSelectedContest(updated);
      }
    } catch (err) {
      console.error("Failed to load contests from database:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchContests();
  }, []);

  const filteredContests = contests.filter((c) => {
    const matchesFilter = statusFilter === "All" || c.status === statusFilter;
    const matchesSearch =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.stage.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.track.toLowerCase().includes(searchQuery.toLowerCase());
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

  const handleCreateContest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      setIsSubmittingContest(true);
      const res = await createContestAction({
        title: newTitle.trim(),
        track: newTrack,
        description: newDescription.trim() || undefined,
        startDate: new Date(newStartDate).toISOString(),
        endDate: new Date(newEndDate).toISOString(),
        status: newStatus,
        cohortCode: "CLP-2025",
      });

      if (res.success) {
        setIsCreateModalOpen(false);
        setNewTitle("");
        setNewDescription("");
        await fetchContests();
      } else {
        alert(`Failed to create contest: ${res.error}`);
      }
    } catch (err) {
      console.error(err);
      alert("Error occurred while creating contest.");
    } finally {
      setIsSubmittingContest(false);
    }
  };

  const handleAssignParticipant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContest || !assignEmail.trim()) return;

    try {
      setIsAssigning(true);
      setAssignMessage(null);
      const res = await assignParticipantAction(
        selectedContest.id,
        assignEmail.trim(),
        assignName.trim() || undefined
      );

      if (res.success) {
        setAssignEmail("");
        setAssignName("");
        setAssignMessage(`Enrolled ${res.user?.name} (${res.user?.email}) successfully.`);
        await fetchContests();
      } else {
        setAssignMessage(`Error: ${res.error}`);
      }
    } catch (err) {
      console.error(err);
      setAssignMessage("Failed to assign participant.");
    } finally {
      setIsAssigning(false);
    }
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
          <span className="font-semibold text-on-surface">Supabase Live Connection:</span>
          <span className="text-secondary">Mumbai Region (PostgreSQL) • Active</span>
        </div>
      </div>

      {/* Header Section */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-space-md mt-space-sm mb-space-lg">
        <div>
          <div className="flex items-center gap-space-sm">
            <h1 className="font-display-lg text-on-surface tracking-tight">Contests</h1>
            <span className="px-space-sm py-0.5 rounded-full bg-surface-container-high border border-[#e2e8f0] text-secondary font-label-xs font-semibold tabular-nums">
              {contests.length} {contests.length === 1 ? "Contest" : "Contests"} in Database
            </span>
          </div>
          <p className="font-body-md text-secondary mt-1 max-w-2xl">
            Manage leadership challenges, phases, diagnostic evaluation rubrics, and automated candidate grading pipelines.
          </p>
        </div>

        {/* Actions Group */}
        <div className="flex items-center gap-space-sm flex-wrap">
          <button
            onClick={() => fetchContests()}
            className="h-10 px-space-md bg-surface-container-lowest hover:bg-surface-container text-on-surface rounded border border-[#e2e8f0] shadow-2xs flex items-center gap-space-xs font-label-md transition-colors"
          >
            <span className="material-symbols-outlined text-[18px] text-secondary">
              refresh
            </span>
            <span>Refresh</span>
          </button>
          <button
            onClick={() => setIsCreateModalOpen(true)}
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
            placeholder="Filter by challenge name, phase, rubric tags (e.g. 'ESG', 'Strategy')..."
            className="w-full bg-transparent text-on-surface placeholder:text-secondary font-body-md focus:outline-none"
          />
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
                  `(${contests.filter((c) => c.status === status).length})`}
              </button>
            ))}
          </div>

          <div className="px-space-sm py-1 bg-surface-container-low rounded border border-[#e2e8f0] font-label-xs text-on-surface flex items-center gap-1">
            <span className="material-symbols-outlined text-[16px] text-secondary">groups</span>
            <span>Cohort CLP-2025</span>
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
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-secondary">
                    <div className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-primary-container border-t-transparent rounded-full animate-spin"></span>
                      <span>Querying Supabase database...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredContests.length > 0 ? (
                filteredContests.map((c) => {
                  const percent = c.total > 0 ? Math.round((c.submitted / c.total) * 100) : 0;
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
                            <span>Drafting Challenge Config</span>
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
                        No benchmarks match &quot;{searchQuery}&quot;.
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
              Showing <strong className="text-on-surface">{filteredContests.length}</strong> of{" "}
              <strong className="text-on-surface">{contests.length}</strong> database benchmarks
            </span>
            <span className="text-secondary/40">•</span>
            <span className="hidden sm:inline">Click row to open participant assignment & inspector</span>
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
            Real-time auto-grading and rubric matrix synchronization.
          </p>
        </div>

        <div className="p-space-md bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-secondary mb-space-sm">
            <span className="font-label-xs uppercase tracking-wider">Database Security Index</span>
            <span className="material-symbols-outlined text-[18px] text-tertiary">security</span>
          </div>
          <div className="flex items-baseline gap-space-xs">
            <span className="font-display-lg text-on-surface tabular-nums">
              100%
            </span>
            <span className="font-label-xs text-primary-container font-medium">
              RLS & Triggers Verified
            </span>
          </div>
          <p className="font-body-sm text-secondary mt-1">
            Answer key isolation, role integrity checks, and deadline enforcement active.
          </p>
        </div>

        <div className="p-space-md bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-secondary mb-space-sm">
            <span className="font-label-xs uppercase tracking-wider">Active Cohort Enrollment</span>
            <span className="material-symbols-outlined text-[18px] text-secondary">
              groups
            </span>
          </div>
          <div className="flex items-baseline gap-space-xs">
            <span className="font-display-lg text-on-surface tabular-nums">
              {contests.reduce((acc, c) => acc + c.participants.length, 0)}
            </span>
            <span className="font-label-xs text-secondary font-medium">
              Assigned Leaders
            </span>
          </div>
          <p className="font-body-sm text-secondary mt-1">
            Campus Leadership Programme 2025 cohort roster.
          </p>
        </div>
      </div>

      {/* Create Contest Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-inverse-surface/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-lg border border-[#e2e8f0] max-w-lg w-full p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#e2e8f0]">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary-container">add_circle</span>
                <h3 className="font-headline-sm font-semibold text-on-surface">
                  Create New Assessment Contest
                </h3>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 rounded text-secondary hover:text-on-surface"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <form onSubmit={handleCreateContest} className="flex flex-col gap-3 font-body-sm">
              <div>
                <label className="font-label-xs text-secondary uppercase font-semibold block mb-1">
                  Contest Title *
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. AI-Driven Supply Chain Strategy 2025"
                  className="w-full px-3 py-2 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface font-body-sm focus:outline-none focus:border-primary-container"
                />
              </div>

              <div>
                <label className="font-label-xs text-secondary uppercase font-semibold block mb-1">
                  Track / Discipline *
                </label>
                <input
                  type="text"
                  required
                  value={newTrack}
                  onChange={(e) => setNewTrack(e.target.value)}
                  placeholder="e.g. Track B · Operational Strategy"
                  className="w-full px-3 py-2 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface font-body-sm focus:outline-none focus:border-primary-container"
                />
              </div>

              <div>
                <label className="font-label-xs text-secondary uppercase font-semibold block mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Summary of benchmark challenge objectives..."
                  className="w-full px-3 py-2 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface font-body-sm focus:outline-none focus:border-primary-container resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-label-xs text-secondary uppercase font-semibold block mb-1">
                    Start Date
                  </label>
                  <input
                    type="datetime-local"
                    value={newStartDate}
                    onChange={(e) => setNewStartDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface font-label-xs focus:outline-none focus:border-primary-container"
                  />
                </div>
                <div>
                  <label className="font-label-xs text-secondary uppercase font-semibold block mb-1">
                    End Date / Deadline
                  </label>
                  <input
                    type="datetime-local"
                    value={newEndDate}
                    onChange={(e) => setNewEndDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface font-label-xs focus:outline-none focus:border-primary-container"
                  />
                </div>
              </div>

              <div>
                <label className="font-label-xs text-secondary uppercase font-semibold block mb-1">
                  Initial Status
                </label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-1.5 cursor-pointer text-on-surface">
                    <input
                      type="radio"
                      name="status"
                      checked={newStatus === "LIVE"}
                      onChange={() => setNewStatus("LIVE")}
                      className="accent-primary-container"
                    />
                    <span>Live (Active for Participants)</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer text-on-surface">
                    <input
                      type="radio"
                      name="status"
                      checked={newStatus === "DRAFT"}
                      onChange={() => setNewStatus("DRAFT")}
                      className="accent-primary-container"
                    />
                    <span>Draft</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#e2e8f0]">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded bg-surface-container-high hover:bg-surface-container text-on-surface font-label-md border border-[#e2e8f0]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingContest}
                  className="px-5 py-2 rounded bg-primary-container hover:bg-[#166534] text-on-primary font-label-md font-medium shadow-2xs flex items-center gap-1.5"
                >
                  {isSubmittingContest && (
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  )}
                  <span>Save Contest to Database</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
                  <span className="font-label-xs text-secondary font-mono truncate max-w-[200px]">
                    ID: {selectedContest.id.slice(0, 8)}...
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
                    {selectedContest.total > 0
                      ? Math.round((selectedContest.submitted / selectedContest.total) * 100)
                      : 0}
                    %
                  </span>
                  <span className="font-label-xs text-secondary">
                    {selectedContest.submitted} of {selectedContest.total} enrolled
                  </span>
                </div>
                <div className="p-space-sm bg-surface-container-low rounded border border-[#e2e8f0]">
                  <span className="font-label-xs text-secondary block">Benchmark Track</span>
                  <span className="font-headline-md text-on-surface font-bold truncate block">
                    {selectedContest.track}
                  </span>
                  <span className="font-label-xs text-primary-container font-medium">
                    {selectedContest.dates}
                  </span>
                </div>
              </div>

              {/* Assign Participant Section */}
              <div className="bg-surface-container-low p-4 rounded-lg border border-[#e2e8f0] my-2">
                <span className="font-label-xs uppercase tracking-wider text-secondary font-semibold flex items-center gap-1.5 mb-2">
                  <span className="material-symbols-outlined text-[16px] text-primary-container">person_add</span>
                  Assign Participant to Contest
                </span>
                <form onSubmit={handleAssignParticipant} className="flex flex-col gap-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="email"
                      required
                      value={assignEmail}
                      onChange={(e) => setAssignEmail(e.target.value)}
                      placeholder="Candidate Email (e.g. user@acme.edu)"
                      className="px-2.5 py-1.5 rounded bg-surface-container-lowest border border-[#e2e8f0] font-label-xs text-on-surface focus:outline-none focus:border-primary-container"
                    />
                    <input
                      type="text"
                      value={assignName}
                      onChange={(e) => setAssignName(e.target.value)}
                      placeholder="Candidate Name (Optional)"
                      className="px-2.5 py-1.5 rounded bg-surface-container-lowest border border-[#e2e8f0] font-label-xs text-on-surface focus:outline-none focus:border-primary-container"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    {assignMessage && (
                      <span className="font-label-xs text-primary-container truncate">{assignMessage}</span>
                    )}
                    <button
                      type="submit"
                      disabled={isAssigning}
                      className="ml-auto px-3 py-1.5 rounded bg-primary-container hover:bg-[#166534] text-on-primary font-label-xs font-medium transition-colors flex items-center gap-1"
                    >
                      {isAssigning && (
                        <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      )}
                      <span>Enroll Candidate</span>
                    </button>
                  </div>
                </form>
              </div>

              {/* Enrolled Participants List */}
              <div className="mt-space-md flex flex-col gap-space-xs">
                <span className="font-label-xs uppercase tracking-wider text-secondary font-semibold">
                  Enrolled Participants ({selectedContest.participants.length})
                </span>
                <div className="divide-y divide-[#f1f5f9] text-body-sm max-h-48 overflow-y-auto">
                  {selectedContest.participants.length > 0 ? (
                    selectedContest.participants.map((p) => (
                      <div key={p.id} className="py-2 flex items-center justify-between">
                        <div className="flex items-center gap-space-xs">
                          <div className="w-6 h-6 rounded-full bg-primary-fixed flex items-center justify-center font-label-xs font-bold text-on-primary-fixed">
                            {p.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="flex flex-col">
                            <span className="text-on-surface font-medium text-xs">{p.name}</span>
                            <span className="text-secondary text-[10px]">{p.email}</span>
                          </div>
                        </div>
                        <span className="font-label-xs px-2 py-0.5 rounded-full bg-surface-container font-medium text-secondary">
                          {p.status}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="py-2 text-secondary font-body-sm italic">
                      No candidates enrolled yet. Use the form above to assign.
                    </p>
                  )}
                </div>
              </div>

              {/* Evaluation Rubrics */}
              <div className="flex flex-col gap-space-sm mt-space-md">
                <span className="font-label-xs uppercase tracking-wider text-secondary font-semibold">
                  Evaluation Rubric Matrix
                </span>
                <div className="space-y-space-sm">
                  {selectedContest.rubrics.map((rubric) => (
                    <div key={rubric.name}>
                      <div className="flex justify-between font-label-xs mb-1">
                        <span className="text-on-surface font-medium">{rubric.name}</span>
                        <span className="text-secondary tabular-nums">
                          {rubric.weight}% weight
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
                Inspect Assessment View
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
