"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  getAdminLeaderboardAndResults,
  type AdminResultsOverview,
  type AdminLeaderboardRow,
} from "@/app/actions/results-actions";
import { publishContestResultsAction } from "@/app/actions/evaluator-actions";
import { useAdminContest } from "@/context/admin-contest-context";

export default function AdminResultsPage() {
  const { selectedContestId: globalContestId, setSelectedContestId: setGlobalContestId } = useAdminContest();
  const [data, setData] = useState<{
    contests: Array<{ id: string; title: string }>;
    current: AdminResultsOverview | null;
  } | null>(null);
  const [selectedContestId, setSelectedContestId] = useState<string>(
    globalContestId && globalContestId !== "ALL" ? globalContestId : ""
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isPublishing, setIsPublishing] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Sync with global contest context when changed elsewhere
  useEffect(() => {
    if (globalContestId && globalContestId !== "ALL" && globalContestId !== selectedContestId) {
      setSelectedContestId(globalContestId);
    }
  }, [globalContestId, selectedContestId]);

  const loadResults = async (contestId?: string) => {
    try {
      setIsLoading(true);
      const res = await getAdminLeaderboardAndResults(contestId);
      setData(res);
      if (!selectedContestId && res.current?.contestId) {
        setSelectedContestId(res.current.contestId);
      }
    } catch (err) {
      console.error("Failed to load results:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadResults(selectedContestId || undefined);
  }, [selectedContestId]);

  const handlePublishResults = async (isFinalCertification = false) => {
    if (!selectedContestId) return;
    const confirmMsg = isFinalCertification
      ? "Are you sure you want to perform Final Certification and Lock this contest? This requires all enrolled participants to have completed assessments."
      : "Publish progressive leaderboard update? This will calculate official ranks and percentiles for all currently finalized candidates and make standings visible to enrolled participants without locking the contest.";
    if (!confirm(confirmMsg)) return;

    try {
      setIsPublishing(true);
      const res = await publishContestResultsAction(selectedContestId, { isFinalCertification });
      if (res.success) {
        setFeedback({
          type: "success",
          text: `Leaderboard successfully updated and published for ${res.publishedCount} finalized participant(s).`,
        });
        await loadResults(selectedContestId);
      } else {
        setFeedback({
          type: "error",
          text: res.error || "Failed to publish results",
        });
      }
    } catch (err) {
      setFeedback({ type: "error", text: "Network or server failure" });
    } finally {
      setIsPublishing(false);
    }
  };

  const handleExportCsv = () => {
    if (!data?.current?.rows || data.current.rows.length === 0) return;

    const headers = [
      "Rank",
      "Candidate ID",
      "Candidate Name",
      "Email",
      "Institution",
      "Raw Score",
      "Penalties Deducted",
      "Final Score",
      "Percentile",
      "Status",
      "Certified",
    ];

    const csvRows = data.current.rows.map((r) => [
      r.rank,
      `"${r.candidateId}"`,
      `"${r.candidateName}"`,
      `"${r.candidateEmail}"`,
      `"${r.institution}"`,
      r.rawScore,
      r.penalties,
      r.finalScore,
      `${r.percentile}%`,
      r.submissionStatus,
      r.isCertified ? "Yes" : "No",
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...csvRows.map((e) => e.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `results_${data.current.contestTitle.replace(/\s+/g, "_")}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredRows = (data?.current?.rows || []).filter(
    (r) =>
      r.candidateName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.candidateEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.candidateId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.institution.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex-1 p-space-md sm:p-space-lg max-w-7xl mx-auto w-full">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-space-md border-b border-[#e2e8f0] gap-space-sm mb-space-lg">
        <div>
          <div className="flex items-center gap-space-xs text-secondary font-label-xs mb-1">
            <Link href="/admin" className="hover:text-on-surface">Admin</Link>
            <span>/</span>
            <span className="text-on-surface font-medium">Leaderboards & Results Publication</span>
          </div>
          <h1 className="font-headline-md font-semibold text-on-surface tracking-tight">
            Official Cohort Standings & Certification
          </h1>
          <p className="font-body-sm text-secondary mt-0.5">
            Audit provisional leaderboards, tie-broken standings, compute certified percentiles, and publish official scorecards.
          </p>
        </div>

        {/* Contest Switcher */}
        {data && data.contests.length > 0 && (
          <div className="flex items-center gap-space-sm">
            <label className="font-label-xs text-secondary font-medium whitespace-nowrap">
              Contest:
            </label>
            <select
              value={selectedContestId}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedContestId(val);
                setGlobalContestId(val);
              }}
              className="px-3 py-2 bg-surface-container-lowest border border-[#e2e8f0] rounded text-on-surface font-label-sm font-medium focus:outline-none focus:border-primary-container"
            >
              {data.contests.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {feedback && (
        <div
          className={`mb-space-md p-space-sm rounded font-label-sm flex items-center justify-between ${
            feedback.type === "success"
              ? "bg-[#dcfce7] text-[#166534] border border-[#bbf7d0]"
              : "bg-[#fee2e2] text-[#991b1b] border border-[#fecaca]"
          }`}
        >
          <span>{feedback.text}</span>
          <button onClick={() => setFeedback(null)} className="text-sm font-bold">×</button>
        </div>
      )}

      {/* Publication Status Card */}
      {data?.current && (
        <div className="p-space-md bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs mb-space-lg flex flex-col md:flex-row md:items-center justify-between gap-space-md">
          <div className="flex items-start gap-space-sm">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                data.current.isPublished
                  ? "bg-[#dcfce7] text-primary-container"
                  : "bg-amber-100 text-amber-700"
              }`}
            >
              <span className="material-symbols-outlined text-[24px]">
                {data.current.isPublished ? "verified" : "pending_actions"}
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-headline-sm font-semibold text-on-surface">
                  {data.current.contestTitle}
                </h3>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                    data.current.isPublished
                      ? data.current.finalizedCount === data.current.totalEnrolled && data.current.totalEnrolled > 0
                        ? "bg-[#dcfce7] text-[#166534]"
                        : "bg-emerald-50 text-emerald-800 border border-emerald-200"
                      : "bg-[#fef3c7] text-[#92400e]"
                  }`}
                >
                  {data.current.isPublished
                    ? data.current.finalizedCount === data.current.totalEnrolled && data.current.totalEnrolled > 0
                      ? "Certified & Finalized"
                      : "Progressive Leaderboard Published"
                    : "Provisional (Unpublished)"}
                </span>
              </div>
              <p className="font-body-sm text-secondary mt-0.5">
                {data.current.isPublished
                  ? `Official standings are live for ${data.current.finalizedCount} candidate(s). Enrolled candidates can view their certified scorecards.`
                  : "Results are currently private to administrators and evaluators. Participants see provisional status without score exposure."}
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-secondary mt-2">
                <span>Enrolled: <strong className="text-on-surface">{data.current.totalEnrolled}</strong></span>
                <span>•</span>
                <span>Submitted: <strong className="text-on-surface">{data.current.totalSubmissions}</strong></span>
                <span>•</span>
                <span>Unsubmitted: <strong className="text-amber-800">{data.current.unsubmittedCount}</strong></span>
                <span>•</span>
                <span>Pending Evaluation: <strong className="text-blue-800">{data.current.pendingEvaluationCount}</strong></span>
                <span>•</span>
                <span>Finalized / Published: <strong className="text-emerald-800">{data.current.finalizedCount}</strong></span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-space-sm shrink-0">
            <button
              onClick={handleExportCsv}
              disabled={data.current.rows.length === 0}
              className="px-3.5 py-2 bg-surface-container-low hover:bg-surface-container text-on-surface font-label-sm font-medium rounded border border-[#e2e8f0] flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">download</span>
              Export CSV
            </button>

            <button
              onClick={() => handlePublishResults(false)}
              disabled={isPublishing || data.current.finalizedCount === 0}
              className="px-4 py-2 bg-primary-container hover:bg-[#166534] text-on-primary font-label-sm font-medium rounded shadow-2xs flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isPublishing ? (
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              ) : (
                <span className="material-symbols-outlined text-[16px]">publish</span>
              )}
              <span>
                {data.current.isPublished
                  ? `Update Leaderboard (${data.current.finalizedCount} Finalized)`
                  : `Publish Leaderboard (${data.current.finalizedCount} Finalized)`}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Leaderboard Table Container */}
      <div className="bg-surface-container-lowest border border-[#e2e8f0] rounded-lg shadow-2xs overflow-hidden">
        <div className="p-space-sm px-space-md border-b border-[#e2e8f0] flex flex-col sm:flex-row items-center justify-between gap-space-sm">
          <div className="flex items-center gap-2">
            <span className="font-label-sm font-semibold text-on-surface">
              Leaderboard Standings
            </span>
            <span className="text-secondary font-label-xs">
              (Sorted by Score DESC, submitted time ASC)
            </span>
          </div>

          <div className="w-full sm:w-64 relative">
            <span className="material-symbols-outlined text-[16px] text-secondary absolute left-2.5 top-2">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter candidates..."
              className="w-full pl-8 pr-2.5 py-1 text-xs rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface focus:outline-none"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center text-secondary">
            <span className="w-8 h-8 border-3 border-primary-container border-t-transparent rounded-full animate-spin mb-3"></span>
            <p className="font-label-sm">Loading database standings...</p>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="p-12 text-center text-secondary">
            <span className="material-symbols-outlined text-[40px] mb-2 text-secondary/60">
              leaderboard
            </span>
            <h4 className="font-headline-sm font-semibold text-on-surface">No Submissions Recorded</h4>
            <p className="font-body-sm text-secondary mt-1">
              There are no completed or graded submissions to display for this contest.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low border-b border-[#e2e8f0] font-label-xs uppercase font-semibold text-secondary">
                  <th className="py-3 px-space-md w-16 text-center">Rank</th>
                  <th className="py-3 px-space-md">Candidate</th>
                  <th className="py-3 px-space-md">Institution</th>
                  <th className="py-3 px-space-md text-right">Raw Score</th>
                  <th className="py-3 px-space-md text-right">Penalties</th>
                  <th className="py-3 px-space-md text-right">Final Score</th>
                  <th className="py-3 px-space-md text-right">Percentile</th>
                  <th className="py-3 px-space-md text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9] font-body-sm text-on-surface">
                {filteredRows.map((row) => (
                  <tr key={row.userId} className="hover:bg-surface-container-low/50">
                    <td className="py-3.5 px-space-md text-center">
                      <span
                        className={`inline-flex items-center justify-center w-7 h-7 rounded-full font-mono text-xs font-bold ${
                          row.rank === 1
                            ? "bg-amber-100 text-amber-800 border border-amber-300"
                            : row.rank === 2
                            ? "bg-slate-200 text-slate-800 border border-slate-300"
                            : row.rank === 3
                            ? "bg-amber-700/10 text-amber-900 border border-amber-700/20"
                            : "text-secondary"
                        }`}
                      >
                        #{row.rank}
                      </span>
                    </td>
                    <td className="py-3.5 px-space-md">
                      <div className="flex flex-col">
                        <span className="font-medium text-on-surface">{row.candidateName}</span>
                        <div className="flex items-center gap-1.5 text-secondary text-xs">
                          <span className="font-mono">{row.candidateId}</span>
                          <span>•</span>
                          <span>{row.candidateEmail}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-space-md text-secondary text-xs">
                      {row.institution}
                    </td>
                    <td className="py-3.5 px-space-md text-right font-mono text-xs font-medium">
                      {row.rawScore} pts
                    </td>
                    <td className="py-3.5 px-space-md text-right font-mono text-xs">
                      {row.penalties > 0 ? (
                        <span className="text-rose-600 font-semibold bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                          -{row.penalties} pts
                        </span>
                      ) : (
                        <span className="text-secondary">0 pts</span>
                      )}
                    </td>
                    <td className="py-3.5 px-space-md text-right font-mono font-bold text-primary-container">
                      {row.finalScore} pts
                    </td>
                    <td className="py-3.5 px-space-md text-right font-mono text-xs font-semibold text-secondary">
                      {row.percentile}%
                    </td>
                    <td className="py-3.5 px-space-md text-center">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          row.isCertified
                            ? "bg-[#dcfce7] text-[#166534]"
                            : "bg-[#fef3c7] text-[#92400e]"
                        }`}
                      >
                        {row.isCertified ? "Certified" : "Provisional"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
