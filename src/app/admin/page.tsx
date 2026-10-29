"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  getSubmissionsForGrading,
  saveRubricScoreAction,
  publishContestResultsAction,
  type SubmissionToGrade,
} from "@/app/actions/evaluator-actions";
import {
  getAdminOverviewSummaryAction,
  type AdminOverviewSummaryResult,
} from "@/app/actions/contest-actions";
import { getCurrentUserSession } from "@/app/actions/auth-actions";
import { useAdminContest } from "@/context/admin-contest-context";

export default function AdminOverviewPage() {
  const { contests, selectedContestId, selectedContest, setSelectedContestId } = useAdminContest();
  const [filterTab, setFilterTab] = useState<"All" | "Pending" | "Graded">("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [submissions, setSubmissions] = useState<SubmissionToGrade[]>([]);
  const [summary, setSummary] = useState<AdminOverviewSummaryResult | null>(null);
  const [currentAdminEmail, setCurrentAdminEmail] = useState<string>("admin@career-edge.internal");
  const [isLoading, setIsLoading] = useState(true);

  // Grading Drawer State
  const [selectedSub, setSelectedSub] = useState<SubmissionToGrade | null>(null);
  const [rubricScores, setRubricScores] = useState<Record<string, number>>({});
  const [rubricComments, setRubricComments] = useState<Record<string, string>>({});
  const [isSavingGrade, setIsSavingGrade] = useState(false);
  const [gradeSuccessMsg, setGradeSuccessMsg] = useState<string | null>(null);

  // Publish State
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishMessage, setPublishMessage] = useState<string | null>(null);

  const loadData = useCallback(async (scopeId?: string) => {
    try {
      setIsLoading(true);
      const targetScope = scopeId ?? selectedContestId;
      const targetContestId = targetScope && targetScope !== "ALL" ? targetScope : undefined;

      const [subs, summaryData, session] = await Promise.all([
        getSubmissionsForGrading(targetContestId),
        getAdminOverviewSummaryAction(targetContestId),
        getCurrentUserSession(),
      ]);

      setSubmissions(subs);
      setSummary(summaryData);
      if (session?.email) {
        setCurrentAdminEmail(session.email);
      }
    } catch (err) {
      console.error("Failed to load admin overview data:", err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedContestId]);

  useEffect(() => {
    loadData(selectedContestId);
  }, [selectedContestId, loadData]);

  const openGradingDrawer = (sub: SubmissionToGrade) => {
    setSelectedSub(sub);
    setGradeSuccessMsg(null);
    const initialScores: Record<string, number> = {};
    const initialComments: Record<string, string> = {};

    sub.rubrics.forEach((r) => {
      initialScores[r.id] = r.currentScoreAwarded !== undefined ? r.currentScoreAwarded : Math.round(r.maxPoints * 0.85);
      initialComments[r.id] = r.currentComments || "";
    });

    setRubricScores(initialScores);
    setRubricComments(initialComments);
  };

  const handleSaveGrades = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSub) return;

    try {
      setIsSavingGrade(true);
      setGradeSuccessMsg(null);

      const scorePayload = selectedSub.rubrics.map((r) => ({
        rubricId: r.id,
        scoreAwarded: Number(rubricScores[r.id] ?? 0),
        comments: rubricComments[r.id] || undefined,
      }));

      const res = await saveRubricScoreAction({
        submissionId: selectedSub.id,
        evaluatorEmail: currentAdminEmail,
        scores: scorePayload,
      });

      if (res.success) {
        setGradeSuccessMsg(
          `Rubrics scored! Manual: ${res.manualGradeScore} pts • Final Score: ${res.finalScore}/100`
        );
        // Instant state update without full-page reload
        setSubmissions((prev) =>
          prev.map((s) =>
            s.id === selectedSub.id
              ? {
                  ...s,
                  status: "GRADED",
                  manualGradeScore: res.manualGradeScore ?? s.manualGradeScore,
                  finalScore: res.finalScore ?? s.finalScore,
                }
              : s
          )
        );
      } else {
        alert(`Evaluation error: ${res.error}`);
      }
    } catch (err) {
      console.error("Save grade error:", err);
    } finally {
      setIsSavingGrade(false);
    }
  };

  const handlePublishResults = async (contestId: string) => {
    try {
      setIsPublishing(true);
      setPublishMessage(null);

      // Uses verified admin session from HTTP-only cookie
      const res = await publishContestResultsAction(contestId);
      if (res.success) {
        setPublishMessage(`Successfully published results for ${res.publishedCount} candidate(s).`);
        await loadData();
      } else {
        alert(`Publishing error: ${res.error}`);
      }
    } catch (err) {
      console.error("Publish error:", err);
    } finally {
      setIsPublishing(false);
    }
  };

  const filteredSubmissions = submissions.filter((s) => {
    const matchesFilter =
      filterTab === "All" ||
      (filterTab === "Pending" && s.status === "SUBMITTED") ||
      (filterTab === "Graded" && s.status === "GRADED");
    const matchesSearch =
      s.candidateName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.candidateEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.contestTitle.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const pendingCount = submissions.filter((s) => s.status === "SUBMITTED").length;
  const gradedCount = submissions.filter((s) => s.status === "GRADED").length;
  const totalEnrolled = summary?.totalEnrolled ?? 0;
  const isGlobalScope = !selectedContestId || selectedContestId === "ALL";

  return (
    <div className="flex flex-col w-full pb-space-xl">
      {/* Overview Status Banner */}
      <div className="mb-4 px-4 py-2.5 bg-surface-container-low rounded border border-[#e2e8f0] text-on-surface font-label-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px] text-primary-container">
            fact_check
          </span>
          <span>
            <strong className="text-on-surface">Evaluation Console:</strong> Candidate submissions, rubric scoring, and official results management.
          </span>
        </div>
        <span className="text-secondary font-label-xs shrink-0">Evaluation Panel</span>
      </div>

      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-md pt-2 pb-space-lg">
        <div>
          <div className="flex items-center gap-space-xs text-secondary font-label-xs uppercase tracking-wider mb-1">
            <span>Evaluation</span>
            <span>/</span>
            <span className="text-primary-container font-semibold">Submissions & Grading</span>
          </div>
          <h1 className="font-display-lg text-on-surface">Evaluation Console</h1>
          <p className="font-body-md text-secondary mt-1">
            Contest benchmark evaluations, candidate submissions, and official cohort ranking publication
          </p>
        </div>

        {/* Top Actions */}
        <div className="flex items-center gap-space-sm self-start md:self-auto flex-wrap">
          <button
            onClick={() => loadData()}
            className="inline-flex items-center gap-space-xs px-space-md py-2 bg-surface-container-lowest text-on-surface font-label-md rounded border border-[#e2e8f0] shadow-2xs hover:bg-surface-container transition-all"
          >
            <span className="material-symbols-outlined text-[18px] text-secondary">
              refresh
            </span>
            <span>Refresh Data</span>
          </button>
          <Link
            href="/admin/contests"
            className="inline-flex items-center gap-space-xs px-space-md py-2 bg-primary-container text-on-primary font-label-md rounded shadow-2xs hover:bg-[#166534] transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">tune</span>
            <span>Contest Management</span>
          </Link>
        </div>
      </div>

      {/* Metric Cards Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-md mb-space-xl">
        {/* Stat 1: Active Contests */}
        <div className="p-space-lg bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-secondary mb-3">
            <span className="font-label-sm uppercase tracking-wide">Active Contests</span>
            <span className="material-symbols-outlined text-[18px] text-primary-container">
              workspace_premium
            </span>
          </div>
          <div>
            <div className="font-display-lg text-on-surface tracking-tight leading-none mb-2 tabular-nums">
              {summary ? summary.activeContests : contests.filter((c) => c.status.toUpperCase() === "LIVE").length}{" "}
              <span className="font-headline-sm font-normal text-secondary">
                / {summary ? summary.totalContests : contests.length}
              </span>
            </div>
            <div className="font-body-sm text-secondary flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-primary-container"></span>
              <span>{summary ? summary.totalContests : contests.length} total contests configured</span>
            </div>
          </div>
        </div>

        {/* Stat 2: Enrolled Candidates (Interactive Dropdown & De-duplicated Count) */}
        <div className="p-space-lg bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-secondary mb-2">
            <div className="flex items-center gap-1.5">
              <span className="font-label-sm uppercase tracking-wide">Enrolled Candidates</span>
              {isGlobalScope ? (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-surface-container-high text-secondary">
                  Global
                </span>
              ) : (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-on-tertiary-container text-primary-container">
                  Contest
                </span>
              )}
            </div>
            <select
              id="enrolled-candidates-scope-filter"
              aria-label="Filter enrolled candidates by contest"
              value={selectedContestId}
              onChange={(e) => setSelectedContestId(e.target.value)}
              className="px-2 py-0.5 text-xs bg-surface-container-low border border-[#e2e8f0] rounded text-on-surface font-label-xs focus:outline-none focus:border-primary-container max-w-[130px] truncate"
            >
              <option value="ALL">All Contests</option>
              {contests.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="font-display-lg text-on-surface tracking-tight leading-none mb-1 tabular-nums">
              {totalEnrolled}
            </div>
            {isGlobalScope ? (
              <div className="font-body-sm text-secondary truncate">
                Unique candidates across all contests
              </div>
            ) : (
              <div className="font-body-sm text-secondary flex flex-col">
                <span className="font-medium text-on-surface truncate">
                  {selectedContest?.title || summary?.selectedContestTitle || "Selected Contest"}
                </span>
                <span className="text-[11px] text-secondary">
                  Global unique total: {summary?.globalUniqueEnrolled ?? 0}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Stat 3: Pending Evaluations */}
        <div className="p-space-lg bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-secondary mb-3">
            <span className="font-label-sm uppercase tracking-wide">Pending Evaluations</span>
            <span className="material-symbols-outlined text-[18px] text-tertiary">
              pending_actions
            </span>
          </div>
          <div>
            <div className="font-display-lg text-on-surface tracking-tight leading-none mb-2 tabular-nums">
              {pendingCount}
            </div>
            <div className="font-body-sm text-secondary">
              Awaiting panel rubric review
            </div>
          </div>
        </div>

        {/* Stat 4: Graded & Verified */}
        <div className="p-space-lg bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-secondary mb-3">
            <span className="font-label-sm uppercase tracking-wide">Graded & Verified</span>
            <span className="material-symbols-outlined text-[18px] text-primary-container">
              verified
            </span>
          </div>
          <div>
            <div className="font-display-lg text-on-surface tracking-tight leading-none mb-2 tabular-nums">
              {gradedCount}
            </div>
            <div className="font-body-sm text-secondary">
              Ready for cohort publication
            </div>
          </div>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
        {/* Left Column: Submissions to Grade */}
        <div className="lg:col-span-8 flex flex-col gap-space-md">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm pb-space-xs">
            <div>
              <h2 className="font-headline-lg text-on-surface tracking-tight">
                Candidate Submissions for Evaluation
              </h2>
              <p className="font-body-sm text-secondary mt-0.5">
                Review candidate diagnostic responses, score weighted rubrics, and lock evaluations
              </p>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center bg-surface-container-low p-0.5 rounded border border-[#e2e8f0] self-start sm:self-auto">
              {(["All", "Pending", "Graded"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setFilterTab(tab)}
                  className={`px-3 py-1 rounded font-label-xs transition-colors ${
                    filterTab === tab
                      ? "bg-surface-container-lowest text-on-surface font-semibold shadow-2xs"
                      : "text-secondary hover:text-on-surface"
                  }`}
                >
                  {tab}{" "}
                  {tab === "Pending" && `(${pendingCount})`}
                  {tab === "Graded" && `(${gradedCount})`}
                </button>
              ))}
            </div>
          </div>

          {/* Contest Scope Notification Banner */}
          {selectedContest && (
            <div className="flex items-center justify-between px-3 py-2 bg-on-tertiary-container/30 border border-primary-container/20 rounded font-label-xs text-on-surface">
              <div className="flex items-center gap-2 truncate">
                <span className="material-symbols-outlined text-[16px] text-primary-container">filter_alt</span>
                <span>Active Scope: <strong className="text-on-surface">{selectedContest.title}</strong></span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedContestId("ALL")}
                className="text-primary-container hover:underline font-semibold shrink-0 ml-2"
              >
                Clear Filter (Show All)
              </button>
            </div>
          )}

          {/* Submissions List */}
          <div className="bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs divide-y divide-[#f1f5f9] overflow-hidden">
            {isLoading ? (
              <div className="p-12 text-center text-secondary">
                <div className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-primary-container border-t-transparent rounded-full animate-spin"></span>
                  <span>Fetching submissions from database...</span>
                </div>
              </div>
            ) : filteredSubmissions.length > 0 ? (
              filteredSubmissions.map((sub) => (
                <div
                  key={sub.id}
                  className="p-space-lg flex flex-col sm:flex-row sm:items-center justify-between gap-space-md hover:bg-surface-container-low/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-space-xs mb-1">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-label-xs font-semibold tracking-wide ${
                          sub.status === "GRADED"
                            ? "bg-on-tertiary-container text-primary-container"
                            : "bg-surface-container-high text-secondary"
                        }`}
                      >
                        {sub.status === "GRADED" ? (
                          <span className="material-symbols-outlined text-[13px]">verified</span>
                        ) : (
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                        )}
                        {sub.status === "GRADED" ? "Graded & Certified" : "Pending Evaluation"}
                      </span>
                      <span className="font-label-xs text-secondary">• {sub.contestTitle}</span>
                    </div>

                    <h3 className="font-headline-sm text-on-surface truncate">
                      {sub.candidateName}
                    </h3>
                    <p className="font-body-sm text-secondary mt-0.5 truncate">
                      {sub.institution} • {sub.candidateEmail}
                    </p>

                    <div className="flex flex-wrap items-center gap-x-space-md gap-y-1 mt-3 font-label-sm text-secondary">
                      <span className="inline-flex items-center gap-1">
                        <span className="material-symbols-outlined text-[15px]">schedule</span>
                        Submitted: {sub.submittedAt ? new Date(sub.submittedAt).toLocaleString() : "Recent"}
                      </span>
                      {sub.finalScore !== null && (
                        <span className="inline-flex items-center gap-1 font-semibold text-primary-container">
                          <span className="material-symbols-outlined text-[15px]">grade</span>
                          Final Score: {sub.finalScore}/100
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => openGradingDrawer(sub)}
                      className="inline-flex items-center gap-1 px-space-md py-2 bg-primary-container hover:bg-[#166534] text-on-primary font-label-md rounded shadow-2xs transition-colors"
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        {sub.status === "GRADED" ? "edit_note" : "rate_review"}
                      </span>
                      <span>{sub.status === "GRADED" ? "Review / Re-score" : "Score Rubric"}</span>
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-12 text-center flex flex-col items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center text-secondary mb-3">
                  <span className="material-symbols-outlined text-[24px]">assignment_turned_in</span>
                </div>
                <h4 className="font-headline-sm font-semibold text-on-surface">No Submissions Found</h4>
                <p className="font-body-sm text-secondary mt-1 max-w-sm">
                  {filterTab === "Pending"
                    ? "All submitted assessments have been graded."
                    : "No candidate submissions match your current filter."}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Publication & Audit Controls */}
        <div className="lg:col-span-4 flex flex-col gap-space-md">
          {/* Contest Result Publication Card */}
          <div className="bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs p-space-lg">
            <div className="flex items-center justify-between pb-space-sm mb-space-sm border-b border-[#f1f5f9]">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary-container text-[20px]">
                  publish
                </span>
                <h2 className="font-headline-sm text-on-surface">Publish Results</h2>
              </div>
              <span className="font-label-xs text-primary-container font-semibold uppercase tracking-wide">
                Admin Action
              </span>
            </div>

            <p className="font-body-sm text-secondary mb-4">
              Publishing locks final evaluations, computes cohort percentiles, and certifies candidate achievement records.
            </p>

            {publishMessage && (
              <div className="p-2.5 mb-3 rounded bg-on-tertiary-container/80 text-primary-container font-label-xs">
                {publishMessage}
              </div>
            )}

            <div className="space-y-3">
              {contests.map((c) => (
                <div
                  key={c.id}
                  className="p-3 rounded bg-surface-container-low border border-[#e2e8f0] flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-label-sm font-semibold text-on-surface truncate">
                      {c.title}
                    </span>
                    <span
                      className={`font-label-xs px-2 py-0.5 rounded-full ${
                        c.status === "Completed"
                          ? "bg-on-tertiary-container text-primary-container font-semibold"
                          : "bg-surface-container-high text-secondary"
                      }`}
                    >
                      {c.status === "Completed" ? "Published" : c.status}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="font-label-xs text-secondary truncate max-w-[180px]">
                      {c.track}
                    </span>
                    <button
                      onClick={() => handlePublishResults(c.id)}
                      disabled={isPublishing || c.status === "Completed"}
                      className="px-3 py-1 rounded bg-surface-container-lowest hover:bg-surface-container text-primary-container font-label-xs font-semibold border border-[#e2e8f0] disabled:opacity-50"
                    >
                      {c.status === "Completed" ? "Already Published" : "Publish Cohort"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Evaluator Rubric Grading Drawer */}
      {selectedSub && (
        <div
          className="fixed inset-0 bg-inverse-surface/40 backdrop-blur-xs z-50 flex justify-end transition-opacity"
          onClick={() => setSelectedSub(null)}
        >
          <div
            className="w-full sm:w-[94vw] md:w-[75vw] lg:w-[48vw] lg:min-w-[680px] lg:max-w-[920px] xl:max-w-[1020px] 2xl:max-w-[1150px] bg-surface-container-lowest h-full shadow-2xl p-space-lg flex flex-col justify-between border-l border-[#e2e8f0]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col overflow-y-auto pr-1">
              {/* Drawer Header */}
              <div className="flex items-center justify-between pb-space-md border-b border-[#f1f5f9]">
                <div className="flex items-center gap-space-xs">
                  <span className="px-2 py-0.5 rounded bg-on-tertiary-container text-on-primary-fixed-variant font-label-xs font-semibold">
                    {selectedSub.status}
                  </span>
                  <span className="font-label-xs text-secondary font-mono truncate max-w-[200px]">
                    Sub #{selectedSub.id.slice(0, 8)}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedSub(null)}
                  className="p-1 rounded text-secondary hover:text-on-surface hover:bg-surface-container"
                  aria-label="Close inspector"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>

              {/* Candidate Info Lockup */}
              <h2 className="font-headline-lg text-on-surface tracking-tight mt-3">
                {selectedSub.candidateName}
              </h2>
              <p className="font-body-md text-secondary mt-0.5">
                {selectedSub.institution} • {selectedSub.contestTitle} ({selectedSub.phaseTitle})
              </p>

              {gradeSuccessMsg && (
                <div className="my-3 p-3 rounded bg-on-tertiary-container border border-primary-container/40 text-primary-container font-label-sm font-semibold flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">verified</span>
                  <span>{gradeSuccessMsg}</span>
                </div>
              )}

              {/* Candidate Answers Preview */}
              <div className="my-space-md p-4 bg-surface-container-low rounded-lg border border-[#e2e8f0] flex flex-col gap-3">
                <span className="font-label-xs uppercase tracking-wider text-secondary font-semibold">
                  Candidate Responses
                </span>

                {selectedSub.answers.map((ans, i) => (
                  <div key={ans.id} className="p-3 bg-surface-container-lowest rounded border border-[#e2e8f0] text-body-sm">
                    <div className="flex items-center justify-between text-secondary font-label-xs mb-1">
                      <span className="font-semibold text-on-surface">Question 0{i + 1} ({ans.questionType})</span>
                      <span>{ans.questionPoints} pts max</span>
                    </div>
                    <p className="font-body-sm text-on-surface mb-2">{ans.questionPrompt}</p>

                    {ans.selectedOption && (
                      <div className="font-label-sm text-primary-container font-semibold">
                        Selected Option: Option {ans.selectedOption}
                      </div>
                    )}

                    {ans.writtenText && (
                      <div className="p-2.5 rounded bg-surface-container-low font-body-sm text-on-surface text-xs leading-relaxed italic border border-[#e2e8f0]">
                        &quot;{ans.writtenText}&quot;
                        <div className="text-secondary font-label-xs mt-1 not-italic">
                          Word Count: {ans.wordCount ?? 0} words
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Rubric Evaluation Form */}
              <form onSubmit={handleSaveGrades} className="flex flex-col gap-space-md">
                <div className="flex items-center justify-between">
                  <span className="font-label-xs uppercase tracking-wider text-secondary font-semibold">
                    Standardized Rubric Scoring Matrix
                  </span>
                  <span className="font-label-xs text-primary-container font-semibold">
                    Weight Sum: 100%
                  </span>
                </div>

                <div className="space-y-3">
                  {selectedSub.rubrics.map((r) => {
                    const currentVal = rubricScores[r.id] ?? Math.round(r.maxPoints * 0.85);

                    return (
                      <div key={r.id} className="p-3 bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <span className="font-label-md font-semibold text-on-surface">
                            {r.name}
                          </span>
                          <span className="font-label-xs text-secondary">
                            Max {r.maxPoints} pts ({r.weightPercentage}% weight)
                          </span>
                        </div>

                        {r.description && (
                          <p className="font-body-xs text-secondary text-xs">{r.description}</p>
                        )}

                        <div className="flex items-center gap-3 pt-1">
                          <input
                            type="range"
                            min="0"
                            max={r.maxPoints}
                            step="1"
                            value={currentVal}
                            onChange={(e) =>
                              setRubricScores({
                                ...rubricScores,
                                [r.id]: Number(e.target.value),
                              })
                            }
                            className="flex-1 accent-primary-container cursor-pointer"
                          />
                          <span className="font-mono text-on-surface font-bold text-sm w-12 text-right">
                            {currentVal} / {r.maxPoints}
                          </span>
                        </div>

                        <input
                          type="text"
                          placeholder="Optional evaluator feedback notes..."
                          value={rubricComments[r.id] || ""}
                          onChange={(e) =>
                            setRubricComments({
                              ...rubricComments,
                              [r.id]: e.target.value,
                            })
                          }
                          className="px-2.5 py-1 text-xs rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface focus:outline-none focus:border-primary-container"
                        />
                      </div>
                    );
                  })}
                </div>

                <div className="pt-space-md flex items-center justify-end gap-space-sm border-t border-[#f1f5f9]">
                  <button
                    type="button"
                    onClick={() => setSelectedSub(null)}
                    className="px-space-md py-2 rounded bg-surface-container-high hover:bg-surface-container text-on-surface font-label-md border border-[#e2e8f0]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingGrade}
                    className="px-space-md py-2 rounded bg-primary-container hover:bg-[#166534] text-on-primary font-label-md font-medium shadow-2xs flex items-center gap-1.5"
                  >
                    {isSavingGrade && (
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    )}
                    <span>Save Evaluation & Lock Score</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
