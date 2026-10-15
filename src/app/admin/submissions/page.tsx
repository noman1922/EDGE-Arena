"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  getAdminSubmissionsList,
  type AdminSubmissionsOverview,
  type AdminSubmissionDetail,
} from "@/app/actions/results-actions";

export default function AdminSubmissionsPage() {
  const [data, setData] = useState<AdminSubmissionsOverview | null>(null);
  const [selectedContestId, setSelectedContestId] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "SUBMITTED" | "GRADED">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSubmission, setSelectedSubmission] = useState<AdminSubmissionDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadSubmissions = async (contestId?: string) => {
    try {
      setIsLoading(true);
      const res = await getAdminSubmissionsList(contestId);
      setData(res);
      if (!selectedContestId && res.selectedContestId) {
        setSelectedContestId(res.selectedContestId);
      }
      if (selectedSubmission) {
        const updated = res.submissions.find((s) => s.id === selectedSubmission.id);
        if (updated) setSelectedSubmission(updated);
      }
    } catch (err) {
      console.error("Failed to load submissions:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSubmissions(selectedContestId || undefined);
  }, [selectedContestId]);

  const filteredSubmissions = (data?.submissions || []).filter((sub) => {
    const matchesFilter =
      statusFilter === "ALL" ||
      (statusFilter === "SUBMITTED" && (sub.status === "SUBMITTED" || sub.status === "IN_REVIEW")) ||
      (statusFilter === "GRADED" && (sub.status === "GRADED" || sub.status === "PUBLISHED"));

    const matchesSearch =
      sub.candidateName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sub.candidateEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sub.candidateId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sub.institution.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  return (
    <div className="flex-1 p-space-md sm:p-space-lg max-w-7xl mx-auto w-full">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-space-md border-b border-[#e2e8f0] gap-space-sm mb-space-lg">
        <div>
          <div className="flex items-center gap-space-xs text-secondary font-label-xs mb-1">
            <Link href="/admin" className="hover:text-on-surface">Admin</Link>
            <span>/</span>
            <span className="text-on-surface font-medium">Submissions & Evaluation Status</span>
          </div>
          <h1 className="font-headline-md font-semibold text-on-surface tracking-tight">
            Submission Auditing & Grading Velocity
          </h1>
          <p className="font-body-sm text-secondary mt-0.5">
            Inspect live candidate assessment submissions, auto-graded MCQ accuracy, and evaluator rubric scoring.
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
              onChange={(e) => setSelectedContestId(e.target.value)}
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

      {/* Metrics Row */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-space-sm mb-space-lg">
          <div className="p-space-sm bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs">
            <span className="font-label-xs text-secondary uppercase font-semibold">Total Submissions</span>
            <div className="text-2xl font-bold text-on-surface mt-1">{data.metrics.totalSubmissions}</div>
          </div>
          <div className="p-space-sm bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs">
            <span className="font-label-xs text-secondary uppercase font-semibold">Pending Review</span>
            <div className="text-2xl font-bold text-amber-600 mt-1">{data.metrics.inReview}</div>
          </div>
          <div className="p-space-sm bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs">
            <span className="font-label-xs text-secondary uppercase font-semibold">Fully Graded</span>
            <div className="text-2xl font-bold text-primary-container mt-1">{data.metrics.graded}</div>
          </div>
          <div className="p-space-sm bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs">
            <span className="font-label-xs text-secondary uppercase font-semibold">Cohort Mean Score</span>
            <div className="text-2xl font-bold text-on-surface mt-1">{data.metrics.averageScore} <span className="text-xs text-secondary font-normal">/ 100</span></div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-space-sm mb-space-md">
        <div className="flex items-center gap-1.5 w-full sm:w-auto">
          {(["ALL", "SUBMITTED", "GRADED"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded font-label-xs font-semibold border transition-colors ${
                statusFilter === s
                  ? "bg-primary-container text-on-primary border-primary-container"
                  : "bg-surface-container-lowest text-secondary border-[#e2e8f0] hover:bg-surface-container"
              }`}
            >
              {s === "ALL" ? "All Submissions" : s === "SUBMITTED" ? "In Review" : "Graded"}
            </button>
          ))}
        </div>

        <div className="w-full sm:w-72 relative">
          <span className="material-symbols-outlined text-[18px] text-secondary absolute left-3 top-2.5">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search candidate, ID, or school..."
            className="w-full pl-9 pr-3 py-1.5 rounded bg-surface-container-lowest border border-[#e2e8f0] text-on-surface font-body-sm focus:outline-none focus:border-primary-container"
          />
        </div>
      </div>

      {/* Submissions Table */}
      <div className="bg-surface-container-lowest border border-[#e2e8f0] rounded-lg shadow-2xs overflow-hidden">
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center text-secondary">
            <span className="w-8 h-8 border-3 border-primary-container border-t-transparent rounded-full animate-spin mb-3"></span>
            <p className="font-label-sm">Loading submission records from database...</p>
          </div>
        ) : filteredSubmissions.length === 0 ? (
          <div className="p-12 text-center text-secondary">
            <span className="material-symbols-outlined text-[40px] mb-2 text-secondary/60">inbox</span>
            <h4 className="font-headline-sm font-semibold text-on-surface">No Submissions Found</h4>
            <p className="font-body-sm text-secondary mt-1">
              No candidate submissions match your current filter in this contest.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low border-b border-[#e2e8f0] font-label-xs uppercase font-semibold text-secondary">
                  <th className="py-3 px-space-md">Candidate</th>
                  <th className="py-3 px-space-md">Institution</th>
                  <th className="py-3 px-space-md">Submitted (BST)</th>
                  <th className="py-3 px-space-md">Status</th>
                  <th className="py-3 px-space-md text-right">Auto MCQ</th>
                  <th className="py-3 px-space-md text-right">Rubric Manual</th>
                  <th className="py-3 px-space-md text-right">Final Score</th>
                  <th className="py-3 px-space-md text-center">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9] font-body-sm text-on-surface">
                {filteredSubmissions.map((sub) => (
                  <tr
                    key={sub.id}
                    onClick={() => setSelectedSubmission(sub)}
                    className="hover:bg-surface-container-lowest/80 transition-colors cursor-pointer"
                  >
                    <td className="py-3.5 px-space-md">
                      <div className="flex flex-col">
                        <span className="font-medium text-on-surface">{sub.candidateName}</span>
                        <div className="flex items-center gap-1.5 text-secondary text-xs">
                          <span className="font-mono">{sub.candidateId}</span>
                          <span>•</span>
                          <span>{sub.candidateEmail}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-space-md text-secondary text-xs">
                      {sub.institution}
                    </td>
                    <td className="py-3.5 px-space-md text-secondary text-xs whitespace-nowrap">
                      {sub.submittedAt
                        ? new Date(sub.submittedAt).toLocaleString("en-US", {
                            timeZone: "Asia/Dhaka",
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "Draft"}
                    </td>
                    <td className="py-3.5 px-space-md">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          sub.status === "GRADED" || sub.status === "PUBLISHED"
                            ? "bg-[#dcfce7] text-[#166534]"
                            : sub.status === "IN_REVIEW"
                            ? "bg-[#fef3c7] text-[#92400e]"
                            : "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {sub.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-space-md text-right font-mono text-xs">
                      {sub.autoGradeScore !== null ? `${sub.autoGradeScore} pts` : "—"}
                    </td>
                    <td className="py-3.5 px-space-md text-right font-mono text-xs">
                      {sub.manualGradeScore !== null ? `${sub.manualGradeScore} pts` : "Pending"}
                    </td>
                    <td className="py-3.5 px-space-md text-right font-mono font-semibold text-primary-container">
                      {sub.finalScore !== null ? `${sub.finalScore}` : "—"}
                    </td>
                    <td className="py-3.5 px-space-md text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setSelectedSubmission(sub)}
                        className="px-2.5 py-1 text-xs bg-surface-container-high hover:bg-surface-container text-on-surface font-medium rounded border border-[#e2e8f0]"
                      >
                        View Answers
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Slide-Over Drawer for Submission Deep-Dive */}
      {selectedSubmission && (
        <div
          className="fixed inset-0 bg-inverse-surface/40 backdrop-blur-xs z-50 flex justify-end transition-opacity"
          onClick={() => setSelectedSubmission(null)}
        >
          <div
            className="w-full max-w-2xl bg-surface-container-lowest h-full shadow-2xl p-space-lg flex flex-col justify-between border-l border-[#e2e8f0] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              {/* Drawer Header */}
              <div className="flex items-center justify-between pb-space-sm border-b border-[#e2e8f0] mb-space-md">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-surface-container font-label-xs font-semibold text-secondary">
                      {selectedSubmission.status}
                    </span>
                    <span className="font-mono text-xs text-secondary font-semibold">
                      {selectedSubmission.candidateId}
                    </span>
                  </div>
                  <h3 className="font-headline-sm font-semibold text-on-surface mt-1">
                    {selectedSubmission.candidateName}
                  </h3>
                  <p className="text-secondary text-xs">
                    {selectedSubmission.institution} • {selectedSubmission.candidateEmail}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedSubmission(null)}
                  className="text-secondary hover:text-on-surface p-1"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>

              {/* Score Summary Box */}
              <div className="p-space-sm bg-surface-container-low rounded-lg border border-[#e2e8f0] grid grid-cols-3 gap-space-xs text-center mb-space-md">
                <div>
                  <span className="font-label-xs uppercase text-secondary font-semibold block">MCQ Auto Score</span>
                  <span className="font-headline-sm font-bold text-on-surface">
                    {selectedSubmission.autoGradeScore !== null ? selectedSubmission.autoGradeScore : "—"}
                  </span>
                </div>
                <div>
                  <span className="font-label-xs uppercase text-secondary font-semibold block">Rubric Manual</span>
                  <span className="font-headline-sm font-bold text-on-surface">
                    {selectedSubmission.manualGradeScore !== null ? selectedSubmission.manualGradeScore : "Pending"}
                  </span>
                </div>
                <div>
                  <span className="font-label-xs uppercase text-secondary font-semibold block">Final Score</span>
                  <span className="font-headline-sm font-bold text-primary-container">
                    {selectedSubmission.finalScore !== null ? selectedSubmission.finalScore : "—"}
                  </span>
                </div>
              </div>

              {/* Submitted Answers Section */}
              <div className="space-y-space-md">
                <span className="font-label-xs uppercase font-semibold text-secondary tracking-wider block">
                  Candidate Responses ({selectedSubmission.answers.length} Questions)
                </span>

                {selectedSubmission.answers.map((ans, idx) => (
                  <div
                    key={ans.id}
                    className="p-space-sm bg-surface-container-low rounded-lg border border-[#e2e8f0]"
                  >
                    <div className="flex items-center justify-between text-xs text-secondary mb-1">
                      <span className="font-bold text-on-surface">Question #{idx + 1} ({ans.questionType})</span>
                      {ans.score !== null && (
                        <span className="font-mono font-semibold text-primary-container">
                          Score: {ans.score} pts
                        </span>
                      )}
                    </div>
                    <p className="font-body-sm font-medium text-on-surface mb-2">
                      {ans.questionPrompt}
                    </p>

                    {ans.questionType === "MCQ" && (
                      <div className="p-2 bg-surface-container-lowest rounded border border-[#e2e8f0] text-xs">
                        <span className="text-secondary">Selected Option: </span>
                        <strong className="text-on-surface font-mono">{ans.selectedOption || "None"}</strong>
                      </div>
                    )}

                    {ans.questionType === "WRITTEN" && (
                      <div className="p-3 bg-surface-container-lowest rounded border border-[#e2e8f0] text-xs leading-relaxed">
                        <div className="flex justify-between text-[11px] text-secondary pb-1 border-b border-[#f1f5f9] mb-1.5">
                          <span>Written Response</span>
                          <span className="font-mono">{ans.wordCount || 0} words</span>
                        </div>
                        <p className="text-on-surface whitespace-pre-wrap">{ans.writtenText || "No response submitted."}</p>
                      </div>
                    )}

                    {ans.questionType === "FILE_UPLOAD" && (
                      <div className="p-3 bg-surface-container-lowest rounded border border-[#e2e8f0] text-xs flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-primary-container text-[20px]">
                            picture_as_pdf
                          </span>
                          <div>
                            <span className="font-medium text-on-surface block">{ans.fileName || "Submitted PDF Document"}</span>
                            <span className="text-[11px] text-secondary font-mono">{ans.fileKey || "PDF Archive"}</span>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded bg-surface-container text-secondary text-[10px] font-semibold">
                          Verified PDF
                        </span>
                      </div>
                    )}
                  </div>
                ))}

                {/* Rubrics Breakdown */}
                {selectedSubmission.evaluations.length > 0 && (
                  <div className="pt-space-md border-t border-[#e2e8f0]">
                    <span className="font-label-xs uppercase font-semibold text-secondary tracking-wider block mb-space-xs">
                      Evaluator Rubric Scoring Matrix
                    </span>
                    <div className="space-y-space-xs">
                      {selectedSubmission.evaluations.map((ev, i) => (
                        <div key={i} className="p-2.5 bg-surface-container-low rounded border border-[#e2e8f0] text-xs">
                          <div className="flex justify-between font-medium">
                            <span className="text-on-surface">{ev.rubricName}</span>
                            <span className="text-primary-container font-mono font-bold">
                              {ev.scoreAwarded} / {ev.maxPoints} pts
                            </span>
                          </div>
                          {ev.comments && (
                            <p className="text-secondary italic text-[11px] mt-1 bg-surface-container-lowest p-1.5 rounded border border-[#e2e8f0]">
                              &quot;{ev.comments}&quot;
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-space-md border-t border-[#e2e8f0] flex justify-end">
              <button
                onClick={() => setSelectedSubmission(null)}
                className="px-4 py-2 bg-surface-container-high hover:bg-surface-container text-on-surface font-label-md rounded border border-[#e2e8f0]"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
