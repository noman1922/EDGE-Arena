"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  getContestCandidateAllocationsAction,
  assignEvaluatorToContestAction,
  batchAssignEvaluatorsToContestAction,
  removeEvaluatorFromContestAction,
  allocateCandidatesToEvaluatorAction,
  unassignCandidateFromEvaluatorAction,
  autoDistributeCandidatesAction,
  type ContestAllocationOverview,
} from "@/app/actions/evaluator-allocation-actions";

interface EvaluatorAllocationPanelProps {
  contestId: string;
  contestTitle: string;
  onUpdate?: () => void;
}

export function EvaluatorAllocationPanel({
  contestId,
  contestTitle,
  onUpdate,
}: EvaluatorAllocationPanelProps) {
  const [data, setData] = useState<ContestAllocationOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"WORKLOAD" | "EVALUATORS">("WORKLOAD");

  // Selection & filter state (Candidates)
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [allocationFilter, setAllocationFilter] = useState<"ALL" | "UNASSIGNED" | "ASSIGNED">("ALL");
  const [rangeFrom, setRangeFrom] = useState<number>(1);
  const [rangeTo, setRangeTo] = useState<number>(10);

  // Selection & filter state (Evaluators)
  const [selectedEvaluatorIds, setSelectedEvaluatorIds] = useState<string[]>([]);
  const [evaluatorSearchQuery, setEvaluatorSearchQuery] = useState("");

  // Action forms
  const [selectedEvaluatorForBatch, setSelectedEvaluatorForBatch] = useState<string>("");
  const [selectedEvaluatorToAdd, setSelectedEvaluatorToAdd] = useState<string>("");

  // Loading & feedback states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const overview = await getContestCandidateAllocationsAction(contestId);
      setData(overview);
      if (overview?.evaluators && overview.evaluators.length > 0) {
        setSelectedEvaluatorForBatch(overview.evaluators[0].evaluatorId);
      }
      if (overview?.availableEvaluators && overview.availableEvaluators.length > 0) {
        setSelectedEvaluatorToAdd(overview.availableEvaluators[0].id);
      }
    } catch (err) {
      console.error("Failed to load allocation data:", err);
      setFeedback({ type: "error", message: "Failed to load evaluator allocation data." });
    } finally {
      setIsLoading(false);
    }
  }, [contestId]);

  useEffect(() => {
    loadData();
    setSelectedCandidateIds([]);
    setSelectedEvaluatorIds([]);
    setFeedback(null);
  }, [loadData]);

  // Filtered candidates
  const candidatesList = data?.candidates;
  const filteredCandidates = useMemo(() => {
    if (!candidatesList) return [];
    return candidatesList.filter((c) => {
      const matchesSearch =
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.candidateId.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (allocationFilter === "UNASSIGNED") {
        return c.assignedEvaluatorId === null;
      }
      if (allocationFilter === "ASSIGNED") {
        return c.assignedEvaluatorId !== null;
      }
      return true;
    });
  }, [candidatesList, searchQuery, allocationFilter]);

  // Filtered available evaluators
  const availableEvaluatorsList = data?.availableEvaluators;
  const filteredAvailableEvaluators = useMemo(() => {
    if (!availableEvaluatorsList) return [];
    if (!evaluatorSearchQuery.trim()) return availableEvaluatorsList;
    const q = evaluatorSearchQuery.toLowerCase();
    return availableEvaluatorsList.filter(
      (ev) =>
        ev.name.toLowerCase().includes(q) ||
        ev.email.toLowerCase().includes(q) ||
        (ev.institution && ev.institution.toLowerCase().includes(q))
    );
  }, [availableEvaluatorsList, evaluatorSearchQuery]);

  // Handlers for candidate selection
  const handleToggleCandidate = (participantId: string) => {
    setSelectedCandidateIds((prev) =>
      prev.includes(participantId) ? prev.filter((id) => id !== participantId) : [...prev, participantId]
    );
  };

  const handleSelectAllVisible = () => {
    setSelectedCandidateIds(filteredCandidates.map((c) => c.participantId));
  };

  const handleSelectUnassigned = () => {
    if (!data?.candidates) return;
    const unassigned = data.candidates
      .filter((c) => c.assignedEvaluatorId === null)
      .map((c) => c.participantId);
    setSelectedCandidateIds(unassigned);
  };

  const handleSelectFirstN = (n: number) => {
    if (!data?.candidates) return;
    const unassignedOrAll = data.candidates
      .filter((c) => allocationFilter === "UNASSIGNED" ? c.assignedEvaluatorId === null : true)
      .slice(0, n)
      .map((c) => c.participantId);
    setSelectedCandidateIds(unassignedOrAll);
  };

  const handleSelectCandidateRange = (from: number, to: number) => {
    if (!filteredCandidates || filteredCandidates.length === 0) return;
    const startIdx = Math.max(0, from - 1);
    const endIdx = Math.min(filteredCandidates.length, to);
    if (startIdx >= endIdx) return;
    const slice = filteredCandidates.slice(startIdx, endIdx).map((c) => c.participantId);
    setSelectedCandidateIds(slice);
  };

  const handleClearSelection = () => {
    setSelectedCandidateIds([]);
  };

  // Handlers for evaluator multi-selection & assignment
  const handleToggleEvaluator = (evaluatorId: string) => {
    setSelectedEvaluatorIds((prev) =>
      prev.includes(evaluatorId) ? prev.filter((id) => id !== evaluatorId) : [...prev, evaluatorId]
    );
  };

  const handleSelectAllAvailableEvaluators = () => {
    setSelectedEvaluatorIds(filteredAvailableEvaluators.map((ev) => ev.id));
  };

  const handleClearSelectedEvaluators = () => {
    setSelectedEvaluatorIds([]);
  };

  const handleBatchAssignEvaluators = async () => {
    if (selectedEvaluatorIds.length === 0) return;
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await batchAssignEvaluatorsToContestAction(contestId, selectedEvaluatorIds);
      if (res.success) {
        setFeedback({
          type: "success",
          message: `Successfully assigned ${res.count} evaluator(s) to this contest.`,
        });
        setSelectedEvaluatorIds([]);
        await loadData();
        onUpdate?.();
      } else {
        setFeedback({ type: "error", message: res.error || "Failed to assign evaluators." });
      }
    } catch {
      setFeedback({ type: "error", message: "Error assigning evaluators." });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Single evaluator assignment quick action
  const handleAddSingleEvaluator = async (evaluatorId: string) => {
    if (!evaluatorId) return;
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await assignEvaluatorToContestAction(contestId, evaluatorId);
      if (res.success) {
        setFeedback({ type: "success", message: `Evaluator assigned to contest.` });
        setSelectedEvaluatorIds((prev) => prev.filter((id) => id !== evaluatorId));
        await loadData();
        onUpdate?.();
      } else {
        setFeedback({ type: "error", message: res.error || "Failed to assign evaluator." });
      }
    } catch {
      setFeedback({ type: "error", message: "Error assigning evaluator." });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Remove evaluator from contest
  const handleRemoveEvaluator = async (evaluatorId: string, name: string) => {
    if (!confirm(`Are you sure you want to remove ${name} from this contest? All their candidate assignments will be released.`)) {
      return;
    }
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await removeEvaluatorFromContestAction(contestId, evaluatorId);
      if (res.success) {
        setFeedback({ type: "success", message: `Evaluator ${name} removed from contest.` });
        await loadData();
        onUpdate?.();
      } else {
        setFeedback({ type: "error", message: res.error || "Failed to remove evaluator." });
      }
    } catch {
      setFeedback({ type: "error", message: "Error removing evaluator." });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Allocate selected candidates to evaluator
  const handleBatchAllocate = async () => {
    if (!selectedEvaluatorForBatch || selectedCandidateIds.length === 0) return;
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await allocateCandidatesToEvaluatorAction({
        contestId,
        evaluatorId: selectedEvaluatorForBatch,
        participantIds: selectedCandidateIds,
        reassign: true,
      });

      if (res.success) {
        const evalName = data?.evaluators.find((e) => e.evaluatorId === selectedEvaluatorForBatch)?.name || "evaluator";
        setFeedback({
          type: "success",
          message: `Successfully allocated ${res.allocatedCount} candidates to ${evalName}.`,
        });
        setSelectedCandidateIds([]);
        await loadData();
        onUpdate?.();
      } else {
        setFeedback({ type: "error", message: res.error || "Failed to allocate candidates." });
      }
    } catch {
      setFeedback({ type: "error", message: "Error allocating candidates." });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reassign single candidate
  const handleSingleReassign = async (participantId: string, newEvaluatorId: string) => {
    if (!newEvaluatorId) return;
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await allocateCandidatesToEvaluatorAction({
        contestId,
        evaluatorId: newEvaluatorId,
        participantIds: [participantId],
        reassign: true,
      });
      if (res.success) {
        setFeedback({ type: "success", message: "Candidate reassigned." });
        await loadData();
        onUpdate?.();
      } else {
        setFeedback({ type: "error", message: res.error || "Failed to reassign candidate." });
      }
    } catch {
      setFeedback({ type: "error", message: "Error reassigning candidate." });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Unassign single candidate
  const handleSingleUnassign = async (participantId: string) => {
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await unassignCandidateFromEvaluatorAction(contestId, participantId);
      if (res.success) {
        setFeedback({ type: "success", message: "Candidate unassigned from evaluator." });
        await loadData();
        onUpdate?.();
      } else {
        setFeedback({ type: "error", message: res.error || "Failed to unassign candidate." });
      }
    } catch {
      setFeedback({ type: "error", message: "Error unassigning candidate." });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Auto-distribute unassigned candidates
  const handleAutoDistribute = async () => {
    if (!data?.evaluators || data.evaluators.length === 0) {
      alert("Please assign at least one evaluator to this contest before auto-distributing candidates.");
      return;
    }
    if (data.unallocatedCandidatesCount === 0) {
      alert("All candidates are already allocated to evaluators.");
      return;
    }

    if (!confirm(`Auto-distribute ${data.unallocatedCandidatesCount} unassigned candidates evenly across ${data.evaluators.length} evaluators?`)) {
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await autoDistributeCandidatesAction({ contestId });
      if (res.success) {
        setFeedback({
          type: "success",
          message: `Successfully auto-distributed ${res.allocatedCount} candidates across ${data.evaluators.length} evaluators.`,
        });
        await loadData();
        onUpdate?.();
      } else {
        setFeedback({ type: "error", message: res.error || "Failed to auto-distribute." });
      }
    } catch {
      setFeedback({ type: "error", message: "Error during auto-distribution." });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-surface-container-low p-4 rounded-lg border border-[#e2e8f0] my-3 flex flex-col gap-3">
      {/* Panel Header */}
      <div className="flex items-center justify-between pb-2 border-b border-[#e2e8f0]">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-primary-container">
            assignment_ind
          </span>
          <div className="flex flex-col">
            <span className="font-label-xs uppercase tracking-wider text-secondary font-bold">
              Evaluator Allocation & Candidate Workloads
            </span>
            <span className="text-[11px] text-secondary">
              Assign evaluators and control individual or batch participant allocations.
            </span>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center bg-surface-container p-0.5 rounded border border-[#e2e8f0]">
          <button
            type="button"
            onClick={() => setActiveTab("WORKLOAD")}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              activeTab === "WORKLOAD"
                ? "bg-surface-container-lowest text-on-surface font-semibold shadow-2xs"
                : "text-secondary hover:text-on-surface"
            }`}
          >
            Candidate Workload {data && `(${data.allocatedCandidatesCount}/${data.totalEnrolledCandidates})`}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("EVALUATORS")}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              activeTab === "EVALUATORS"
                ? "bg-surface-container-lowest text-on-surface font-semibold shadow-2xs"
                : "text-secondary hover:text-on-surface"
            }`}
          >
            Assigned Evaluators {data && `(${data.evaluators.length})`}
          </button>
        </div>
      </div>

      {/* Metrics Summary Strip */}
      {data && (
        <div className="grid grid-cols-4 gap-2 text-center text-xs">
          <div className="p-2 bg-surface-container-lowest rounded border border-[#e2e8f0]">
            <span className="text-[10px] text-secondary block font-medium">Enrolled Candidates</span>
            <span className="font-bold text-on-surface tabular-nums">{data.totalEnrolledCandidates}</span>
          </div>
          <div className="p-2 bg-emerald-50/60 rounded border border-emerald-200">
            <span className="text-[10px] text-emerald-800 block font-medium">Allocated</span>
            <span className="font-bold text-emerald-700 tabular-nums">{data.allocatedCandidatesCount}</span>
          </div>
          <div className="p-2 bg-amber-50/60 rounded border border-amber-200">
            <span className="text-[10px] text-amber-800 block font-medium">Unallocated</span>
            <span className="font-bold text-amber-700 tabular-nums">{data.unallocatedCandidatesCount}</span>
          </div>
          <div className="p-2 bg-primary-50/40 rounded border border-primary/20">
            <span className="text-[10px] text-primary block font-medium">Active Evaluators</span>
            <span className="font-bold text-primary tabular-nums">{data.evaluators.length}</span>
          </div>
        </div>
      )}

      {/* Feedback Alert */}
      {feedback && (
        <div
          className={`p-2.5 rounded text-xs flex items-center justify-between border ${
            feedback.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          <span className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px]">
              {feedback.type === "success" ? "check_circle" : "error"}
            </span>
            {feedback.message}
          </span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-secondary hover:text-on-surface"
          >
            <span className="material-symbols-outlined text-[14px]">close</span>
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="py-8 text-center text-secondary text-xs flex items-center justify-center gap-2">
          <span className="w-4 h-4 border-2 border-primary-container border-t-transparent rounded-full animate-spin"></span>
          <span>Loading allocations...</span>
        </div>
      ) : activeTab === "WORKLOAD" ? (
        /* TAB 1: CANDIDATE WORKLOAD ALLOCATION */
        <div className="flex flex-col gap-3">
          {/* Quick Guidance */}
          {data?.evaluators.length === 0 ? (
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded text-xs flex items-center justify-between">
              <span>
                No evaluators are assigned to this contest yet. Switch to the <strong>Assigned Evaluators</strong> tab to add evaluators before assigning candidates.
              </span>
              <button
                type="button"
                onClick={() => setActiveTab("EVALUATORS")}
                className="px-2.5 py-1 bg-amber-600 text-white rounded text-[11px] font-semibold hover:bg-amber-700 ml-2 shrink-0 cursor-pointer"
              >
                Assign Evaluators
              </button>
            </div>
          ) : (
            <>
              {/* Filter and Selection Toolbar */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[15px] text-secondary">
                      search
                    </span>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search candidates by name, email, or ID..."
                      className="w-full pl-8 pr-2.5 py-1.5 rounded bg-surface-container-lowest border border-[#e2e8f0] text-xs text-on-surface focus:outline-none focus:border-primary-container"
                    />
                  </div>

                  <select
                    value={allocationFilter}
                    onChange={(e) => setAllocationFilter(e.target.value as "ALL" | "UNASSIGNED" | "ASSIGNED")}
                    className="px-2 py-1.5 rounded bg-surface-container-lowest border border-[#e2e8f0] text-xs text-on-surface focus:outline-none"
                  >
                    <option value="ALL">All Candidates</option>
                    <option value="UNASSIGNED">Unallocated Only</option>
                    <option value="ASSIGNED">Allocated Only</option>
                  </select>

                  <button
                    type="button"
                    onClick={handleAutoDistribute}
                    disabled={isSubmitting || data?.evaluators.length === 0 || data?.unallocatedCandidatesCount === 0}
                    className="px-2.5 py-1.5 rounded bg-surface-container hover:bg-surface-container-high border border-[#e2e8f0] text-on-surface text-xs font-semibold flex items-center gap-1 disabled:opacity-50 cursor-pointer shrink-0"
                    title="Automatically balance unassigned candidates evenly across all assigned evaluators"
                  >
                    <span className="material-symbols-outlined text-[15px] text-primary-container">
                      balance
                    </span>
                    Auto Distribute
                  </button>
                </div>

                {/* Quick Selection Buttons */}
                <div className="flex items-center justify-between text-xs flex-wrap gap-1.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={handleSelectAllVisible}
                      className="px-2 py-1 rounded bg-surface-container hover:bg-surface-container-high border border-[#e2e8f0] text-[11px] font-medium text-secondary hover:text-on-surface cursor-pointer"
                    >
                      Select Filtered ({filteredCandidates.length})
                    </button>
                    <button
                      type="button"
                      onClick={handleSelectUnassigned}
                      className="px-2 py-1 rounded bg-surface-container hover:bg-surface-container-high border border-[#e2e8f0] text-[11px] font-medium text-secondary hover:text-on-surface cursor-pointer"
                    >
                      Select Unallocated
                    </button>
                    <div className="flex items-center gap-1 bg-surface-container px-1.5 py-0.5 rounded border border-[#e2e8f0]">
                      <span className="text-[10px] text-secondary">First:</span>
                      {[5, 10, 20].map((num) => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => handleSelectFirstN(num)}
                          className="px-1 text-[11px] font-bold text-primary-container hover:underline cursor-pointer"
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-1 bg-surface-container px-1.5 py-0.5 rounded border border-[#e2e8f0]">
                      <span className="text-[10px] text-secondary">Range:</span>
                      <input
                        type="number"
                        min={1}
                        max={filteredCandidates.length || 1}
                        value={rangeFrom}
                        onChange={(e) => setRangeFrom(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-10 px-1 py-0.5 text-[11px] text-center bg-surface-container-lowest border border-[#e2e8f0] rounded focus:outline-none"
                        title="Start candidate index (1-based)"
                      />
                      <span className="text-[10px] text-secondary">to</span>
                      <input
                        type="number"
                        min={rangeFrom}
                        max={filteredCandidates.length || 1}
                        value={rangeTo}
                        onChange={(e) => setRangeTo(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-10 px-1 py-0.5 text-[11px] text-center bg-surface-container-lowest border border-[#e2e8f0] rounded focus:outline-none"
                        title="End candidate index (1-based)"
                      />
                      <button
                        type="button"
                        onClick={() => handleSelectCandidateRange(rangeFrom, rangeTo)}
                        className="px-1.5 py-0.5 text-[10px] font-bold text-primary-container hover:underline cursor-pointer"
                        title="Select this candidate index range"
                      >
                        Select
                      </button>
                    </div>
                    {selectedCandidateIds.length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearSelection}
                        className="px-2 py-1 text-[11px] text-secondary hover:text-error cursor-pointer"
                      >
                        Clear Selection
                      </button>
                    )}
                  </div>

                  <span className="text-[11px] text-secondary font-medium">
                    {selectedCandidateIds.length} candidate(s) selected
                  </span>
                </div>
              </div>

              {/* Batch Allocation Action Bar (Appears when candidates are selected) */}
              {selectedCandidateIds.length > 0 && (
                <div className="p-2.5 rounded bg-primary-container/10 border border-primary-container/30 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-primary-container">
                      group_work
                    </span>
                    <span className="text-xs font-semibold text-on-surface">
                      Assign {selectedCandidateIds.length} candidate(s) to:
                    </span>
                    <select
                      value={selectedEvaluatorForBatch}
                      onChange={(e) => setSelectedEvaluatorForBatch(e.target.value)}
                      className="px-2.5 py-1 rounded bg-surface-container-lowest border border-[#e2e8f0] text-xs font-semibold text-on-surface focus:outline-none focus:border-primary-container"
                    >
                      {data?.evaluators.map((e) => (
                        <option key={e.evaluatorId} value={e.evaluatorId}>
                          {e.name} ({e.assignedCandidateCount} currently)
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="button"
                    disabled={isSubmitting || !selectedEvaluatorForBatch}
                    onClick={handleBatchAllocate}
                    className="px-3.5 py-1 rounded bg-primary-container hover:bg-[#166534] text-on-primary text-xs font-semibold shadow-2xs flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {isSubmitting && (
                      <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    )}
                    <span>Confirm Assignment</span>
                  </button>
                </div>
              )}

              {/* Candidates Allocation Checklist / Table */}
              <div className="max-h-64 overflow-y-auto rounded border border-[#e2e8f0] bg-surface-container-lowest divide-y divide-[#f1f5f9]">
                {filteredCandidates.length === 0 ? (
                  <div className="p-4 text-center text-secondary text-xs italic">
                    No candidates match the current query or filter.
                  </div>
                ) : (
                  filteredCandidates.map((c) => {
                    const isSelected = selectedCandidateIds.includes(c.participantId);
                    const isAssigned = c.assignedEvaluatorId !== null;

                    return (
                      <div
                        key={c.participantId}
                        className={`p-2 flex items-center justify-between text-xs transition-colors ${
                          isSelected ? "bg-primary-container/10" : "hover:bg-surface-container-low"
                        }`}
                      >
                        {/* Checkbox and Candidate Details */}
                        <label className="flex items-center gap-2.5 min-w-0 cursor-pointer flex-1">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleCandidate(c.participantId)}
                            className="w-4 h-4 rounded text-primary-container accent-primary-container cursor-pointer shrink-0"
                          />
                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-on-surface truncate">{c.name}</span>
                              <span className="px-1.5 py-0.2 rounded bg-surface-container text-secondary text-[10px] font-mono shrink-0">
                                {c.candidateId}
                              </span>
                            </div>
                            <span className="text-secondary text-[11px] truncate">{c.email}</span>
                          </div>
                        </label>

                        {/* Evaluator Assignment Status & Inline Controls */}
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          {isAssigned ? (
                            <div className="flex items-center gap-1">
                              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-semibold flex items-center gap-1">
                                <span className="material-symbols-outlined text-[12px]">how_to_reg</span>
                                {c.assignedEvaluatorName}
                              </span>
                              {/* Reassign dropdown */}
                              <select
                                value={c.assignedEvaluatorId || ""}
                                onChange={(e) => handleSingleReassign(c.participantId, e.target.value)}
                                disabled={isSubmitting}
                                className="text-[10px] bg-surface-container-low border border-[#e2e8f0] rounded px-1.5 py-0.5 text-secondary hover:text-on-surface focus:outline-none"
                                title="Reassign candidate to another evaluator"
                              >
                                {data?.evaluators.map((e) => (
                                  <option key={e.evaluatorId} value={e.evaluatorId}>
                                    {e.name}
                                  </option>
                                ))}
                              </select>
                              {/* Unassign button */}
                              <button
                                type="button"
                                disabled={isSubmitting}
                                onClick={() => handleSingleUnassign(c.participantId)}
                                className="p-0.5 text-secondary hover:text-error rounded hover:bg-error/10 transition-colors cursor-pointer"
                                title="Unassign candidate"
                              >
                                <span className="material-symbols-outlined text-[15px]">close</span>
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-semibold">
                                Unallocated
                              </span>
                              {data?.evaluators && data.evaluators.length > 0 && (
                                <select
                                  defaultValue=""
                                  onChange={(e) => {
                                    if (e.target.value) {
                                      handleSingleReassign(c.participantId, e.target.value);
                                    }
                                  }}
                                  disabled={isSubmitting}
                                  className="text-[10px] bg-surface-container-low border border-[#e2e8f0] rounded px-1.5 py-0.5 text-primary-container font-medium hover:bg-surface-container focus:outline-none"
                                >
                                  <option value="" disabled>
                                    Assign to...
                                  </option>
                                  {data.evaluators.map((e) => (
                                    <option key={e.evaluatorId} value={e.evaluatorId}>
                                      {e.name}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      ) : (
        /* TAB 2: ASSIGNED EVALUATORS MANAGEMENT */
        <div className="flex flex-col gap-3">
          {/* Multi-Select Evaluator Assignment Box */}
          <div className="p-3 bg-surface-container-lowest rounded border border-[#e2e8f0] flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-on-surface flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[17px] text-primary-container">
                  person_add
                </span>
                Assign Evaluators to this Contest
              </span>
              {selectedEvaluatorIds.length > 0 && (
                <span className="text-[11px] font-semibold text-primary-container bg-primary-container/10 px-2 py-0.5 rounded-full">
                  {selectedEvaluatorIds.length} selected
                </span>
              )}
            </div>
            <p className="text-[11px] text-secondary">
              Select one or more active evaluators to authorize them for this contest. Evaluators can only access contests and candidates explicitly assigned to them.
            </p>

            {data?.availableEvaluators && data.availableEvaluators.length > 0 ? (
              <div className="flex flex-col gap-2 mt-1">
                {/* Search & Bulk Selection Toolbar */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative flex-1 min-w-[200px]">
                    <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[15px] text-secondary">
                      search
                    </span>
                    <input
                      type="text"
                      value={evaluatorSearchQuery}
                      onChange={(e) => setEvaluatorSearchQuery(e.target.value)}
                      placeholder="Search available evaluators by name, email, or institution..."
                      className="w-full pl-8 pr-2.5 py-1.5 rounded bg-surface-container-low border border-[#e2e8f0] text-xs text-on-surface focus:outline-none focus:border-primary-container"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleSelectAllAvailableEvaluators}
                    className="px-2.5 py-1.5 rounded bg-surface-container hover:bg-surface-container-high border border-[#e2e8f0] text-secondary hover:text-on-surface text-[11px] font-medium whitespace-nowrap cursor-pointer"
                    title="Select all eligible evaluators shown in this list"
                  >
                    Select All ({filteredAvailableEvaluators.length})
                  </button>

                  {selectedEvaluatorIds.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearSelectedEvaluators}
                      className="px-2 py-1.5 rounded bg-surface-container hover:bg-surface-container-high border border-[#e2e8f0] text-secondary hover:text-error text-[11px] font-medium whitespace-nowrap cursor-pointer"
                    >
                      Clear
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={isSubmitting || selectedEvaluatorIds.length === 0}
                    onClick={handleBatchAssignEvaluators}
                    className="px-3.5 py-1.5 rounded bg-primary-container hover:bg-[#166534] text-on-primary text-xs font-semibold shadow-2xs flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer shrink-0"
                    title={selectedEvaluatorIds.length === 0 ? "Select at least one evaluator to assign" : "Assign all selected evaluators to this contest"}
                  >
                    {isSubmitting && (
                      <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    )}
                    <span className="material-symbols-outlined text-[15px]">group_add</span>
                    <span>
                      Assign Selected {selectedEvaluatorIds.length > 0 ? `(${selectedEvaluatorIds.length})` : ""}
                    </span>
                  </button>
                </div>

                {/* Available Evaluators Checklist */}
                <div className="max-h-56 overflow-y-auto rounded border border-[#e2e8f0] bg-surface-container-low divide-y divide-[#f1f5f9]">
                  {filteredAvailableEvaluators.length === 0 ? (
                    <div className="p-3 text-center text-secondary text-xs italic">
                      No available evaluators match your search.
                    </div>
                  ) : (
                    filteredAvailableEvaluators.map((ev) => {
                      const isSelected = selectedEvaluatorIds.includes(ev.id);
                      return (
                        <div
                          key={ev.id}
                          className={`p-2 flex items-center justify-between text-xs transition-colors ${
                            isSelected ? "bg-primary-container/10" : "hover:bg-surface-container"
                          }`}
                        >
                          <label className="flex items-center gap-2.5 min-w-0 cursor-pointer flex-1">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleEvaluator(ev.id)}
                              className="w-4 h-4 rounded text-primary-container accent-primary-container cursor-pointer shrink-0"
                            />
                            <div className="w-7 h-7 rounded-full bg-surface-container-high border border-[#e2e8f0] flex items-center justify-center font-bold text-secondary text-[11px] shrink-0">
                              {ev.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-on-surface truncate">{ev.name}</span>
                                {ev.institution && (
                                  <span className="text-[10px] text-secondary truncate">
                                    · {ev.institution}
                                  </span>
                                )}
                              </div>
                              <span className="text-secondary text-[11px] truncate">{ev.email}</span>
                            </div>
                          </label>

                          <button
                            type="button"
                            disabled={isSubmitting}
                            onClick={() => handleAddSingleEvaluator(ev.id)}
                            className="px-2 py-1 text-[11px] font-semibold text-primary-container hover:bg-primary-container/10 rounded border border-primary-container/20 transition-colors ml-2 shrink-0 cursor-pointer"
                            title="Assign this evaluator immediately"
                          >
                            + Assign
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-secondary italic">
                All registered evaluators are already assigned to this contest, or no active evaluator accounts exist.
              </p>
            )}
          </div>

          {/* List of currently assigned evaluators */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-on-surface">
              Authorized Contest Evaluators ({data?.evaluators.length || 0})
            </span>

            {data?.evaluators && data.evaluators.length > 0 ? (
              <div className="space-y-2">
                {data.evaluators.map((ev) => (
                  <div
                    key={ev.id}
                    className="p-3 bg-surface-container-lowest rounded border border-[#e2e8f0] flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-primary-container/10 border border-primary-container/20 flex items-center justify-center font-bold text-primary-container text-xs shrink-0">
                        {ev.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-on-surface truncate">{ev.name}</span>
                          {ev.institution && (
                            <span className="text-[10px] text-secondary truncate">· {ev.institution}</span>
                          )}
                        </div>
                        <span className="text-secondary text-[11px] truncate">{ev.email}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="px-2.5 py-1 rounded bg-surface-container border border-[#e2e8f0] text-secondary text-[11px] font-semibold">
                        {ev.assignedCandidateCount} Candidate(s)
                      </span>
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => handleRemoveEvaluator(ev.evaluatorId, ev.name)}
                        className="p-1.5 text-secondary hover:text-error hover:bg-error/10 rounded transition-colors cursor-pointer"
                        title="Remove evaluator from contest"
                      >
                        <span className="material-symbols-outlined text-[17px]">delete</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="p-3 text-center text-secondary text-xs italic bg-surface-container-lowest rounded border border-[#e2e8f0]">
                No evaluators currently assigned. Select evaluators from above and click Assign.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
