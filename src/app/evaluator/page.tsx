"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/ui/brand-logo";
import {
  getSubmissionsForGrading,
  saveRubricScoreAction,
  type SubmissionToGrade,
} from "@/app/actions/evaluator-actions";
import { logoutAction, getCurrentUserSession } from "@/app/actions/auth-actions";
import { getFileDownloadUrlAction } from "@/app/actions/file-actions";
import { SessionPayload } from "@/lib/auth";

export default function EvaluatorConsolePage() {
  const [submissions, setSubmissions] = useState<SubmissionToGrade[]>([]);
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [filterTab, setFilterTab] = useState<"All" | "Pending" | "Graded">("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  // Grading Drawer State
  const [selectedSub, setSelectedSub] = useState<SubmissionToGrade | null>(null);
  const [rubricScores, setRubricScores] = useState<Record<string, number>>({});
  const [rubricComments, setRubricComments] = useState<Record<string, string>>({});
  const [isSavingGrade, setIsSavingGrade] = useState(false);
  const [gradeSuccessMsg, setGradeSuccessMsg] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [subs, userSession] = await Promise.all([
        getSubmissionsForGrading(),
        getCurrentUserSession(),
      ]);
      setSubmissions(subs);
      setSession(userSession);
    } catch (err) {
      console.error("Failed to load evaluator submissions:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openGradingDrawer = (sub: SubmissionToGrade) => {
    setSelectedSub(sub);
    setGradeSuccessMsg(null);
    const initialScores: Record<string, number> = {};
    const initialComments: Record<string, string> = {};

    sub.rubrics.forEach((r) => {
      initialScores[r.id] =
        r.currentScoreAwarded !== undefined
          ? r.currentScoreAwarded
          : Math.round(r.maxPoints * 0.85);
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
        evaluatorEmail: session?.email || "evaluator.demo@example.com",
        scores: scorePayload,
      });

      if (res.success) {
        setGradeSuccessMsg(
          `Rubrics scored! Manual: ${res.manualGradeScore} pts • Final Score: ${res.finalScore}/100`
        );
        await loadData();
      } else {
        alert(`Evaluation error: ${res.error}`);
      }
    } catch (err) {
      console.error("Save grade error:", err);
    } finally {
      setIsSavingGrade(false);
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

  return (
    <div className="min-h-screen bg-surface flex flex-col justify-between">
      {/* Top Header */}
      <header className="h-16 w-full border-b border-[#e2e8f0] bg-surface-container-lowest/90 backdrop-blur-xl px-4 sm:px-gutter flex items-center justify-between sticky top-0 z-30">
        <BrandLogo showSubtitle={true} />

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-surface-container-low border border-[#e2e8f0] font-label-xs text-secondary">
            <span className="w-2 h-2 rounded-full bg-primary-container"></span>
            <span className="font-semibold text-on-surface">Evaluator Console:</span>
            <span>{session?.email || "evaluator.demo@example.com"}</span>
          </div>

          <button
            onClick={async () => {
              await logoutAction();
              window.location.href = "/login";
            }}
            className="px-3 py-1.5 rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-label-xs border border-[#e2e8f0] flex items-center gap-1 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">logout</span>
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-space-lg flex flex-col gap-space-lg flex-1">
        {/* Welcome Section */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-space-md pb-space-sm border-b border-[#e2e8f0]">
          <div>
            <div className="flex items-center gap-2 font-label-xs uppercase tracking-wider text-secondary mb-1">
              <span>Academic Evaluation Panel</span>
              <span>•</span>
              <span className="text-primary-container font-semibold">Standardized Grading</span>
            </div>
            <h1 className="font-display-lg text-on-surface tracking-tight">
              Assigned Submissions
            </h1>
            <p className="font-body-md text-secondary mt-1">
              Score candidate executive summaries, diagnostic tasks, and slide decks against weighted rubrics.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={() => loadData()}
              className="px-3 py-1.5 rounded bg-surface-container-lowest hover:bg-surface-container text-on-surface font-label-sm border border-[#e2e8f0] shadow-2xs flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px] text-secondary">refresh</span>
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Stats Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-space-md">
          <div className="p-4 bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs flex justify-between items-center">
            <div>
              <span className="font-label-xs uppercase tracking-wider text-secondary block">
                Total Submissions
              </span>
              <span className="font-display-lg text-on-surface tabular-nums">
                {submissions.length}
              </span>
            </div>
            <div className="w-10 h-10 rounded bg-surface-container-low flex items-center justify-center text-secondary">
              <span className="material-symbols-outlined text-[20px]">assignment</span>
            </div>
          </div>

          <div className="p-4 bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs flex justify-between items-center">
            <div>
              <span className="font-label-xs uppercase tracking-wider text-secondary block">
                Pending Evaluation
              </span>
              <span className="font-display-lg text-amber-600 tabular-nums">
                {pendingCount}
              </span>
            </div>
            <div className="w-10 h-10 rounded bg-amber-50 flex items-center justify-center text-amber-600">
              <span className="material-symbols-outlined text-[20px]">pending_actions</span>
            </div>
          </div>

          <div className="p-4 bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs flex justify-between items-center">
            <div>
              <span className="font-label-xs uppercase tracking-wider text-secondary block">
                Evaluations Completed
              </span>
              <span className="font-display-lg text-primary-container tabular-nums">
                {gradedCount}
              </span>
            </div>
            <div className="w-10 h-10 rounded bg-on-tertiary-container flex items-center justify-center text-primary-container">
              <span className="material-symbols-outlined text-[20px]">verified</span>
            </div>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="bg-surface-container-lowest p-space-sm rounded-lg border border-[#e2e8f0] shadow-2xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-space-sm">
          <div className="flex-1 flex items-center gap-space-sm px-space-sm">
            <span className="material-symbols-outlined text-[20px] text-secondary">search</span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by candidate name, email, challenge..."
              className="w-full bg-transparent text-on-surface placeholder:text-secondary font-body-sm focus:outline-none"
            />
          </div>

          <div className="flex items-center bg-surface-container-low p-0.5 rounded border border-[#e2e8f0]">
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

        {/* Submissions List */}
        <div className="bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs divide-y divide-[#f1f5f9] overflow-hidden">
          {isLoading ? (
            <div className="p-12 text-center text-secondary">
              <div className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-primary-container border-t-transparent rounded-full animate-spin"></span>
                <span>Loading assigned candidate submissions...</span>
              </div>
            </div>
          ) : filteredSubmissions.length > 0 ? (
            filteredSubmissions.map((sub) => (
              <div
                key={sub.id}
                className="p-space-lg flex flex-col sm:flex-row sm:items-center justify-between gap-space-md hover:bg-surface-container-low/40 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-label-xs font-semibold ${
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
                      {sub.status === "GRADED" ? "Graded" : "Ready for Grading"}
                    </span>
                    <span className="font-label-xs text-secondary">• {sub.contestTitle}</span>
                  </div>

                  <h3 className="font-headline-sm text-on-surface truncate">
                    {sub.candidateName}
                  </h3>
                  <p className="font-body-sm text-secondary mt-0.5 truncate">
                    {sub.institution} • {sub.candidateEmail}
                  </p>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2.5 font-label-sm text-secondary">
                    <span>Submitted: {sub.submittedAt ? new Date(sub.submittedAt).toLocaleString() : "Recent"}</span>
                    {sub.finalScore !== null && (
                      <span className="font-semibold text-primary-container">
                        Score: {sub.finalScore}/100
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => openGradingDrawer(sub)}
                    className="inline-flex items-center gap-1.5 px-space-md py-2 bg-primary-container hover:bg-[#166534] text-on-primary font-label-md rounded shadow-2xs transition-colors"
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      {sub.status === "GRADED" ? "edit_note" : "rate_review"}
                    </span>
                    <span>{sub.status === "GRADED" ? "Review Score" : "Score Rubric"}</span>
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
              <p className="font-body-sm text-secondary mt-1">
                {filterTab === "Pending"
                  ? "All assigned submissions have been evaluated."
                  : "No submissions match your search query."}
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Evaluator Rubric Grading Drawer */}
      {selectedSub && (
        <div
          className="fixed inset-0 bg-inverse-surface/40 backdrop-blur-xs z-50 flex justify-end transition-opacity"
          onClick={() => setSelectedSub(null)}
        >
          <div
            className="w-full max-w-2xl bg-surface-container-lowest h-full shadow-2xl p-space-lg flex flex-col justify-between border-l border-[#e2e8f0]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col overflow-y-auto pr-1">
              {/* Header */}
              <div className="flex items-center justify-between pb-space-md border-b border-[#f1f5f9]">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-on-tertiary-container text-primary-container font-label-xs font-semibold">
                    {selectedSub.status}
                  </span>
                  <span className="font-label-xs text-secondary font-mono">
                    ID: #{selectedSub.id.slice(0, 8)}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedSub(null)}
                  className="p-1 rounded text-secondary hover:text-on-surface hover:bg-surface-container"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>

              {/* Candidate Info */}
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

                    {ans.fileKey && (
                      <div className="p-3 bg-surface-container-low rounded border border-[#e2e8f0] text-xs flex items-center justify-between mt-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="material-symbols-outlined text-error text-[24px] shrink-0">
                            picture_as_pdf
                          </span>
                          <div className="min-w-0">
                            <span className="font-semibold text-on-surface block truncate">
                              {ans.fileName || "Candidate_Deliverable.pdf"}
                            </span>
                            <span className="text-[11px] text-secondary font-mono">
                              Verified PDF Attachment
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const res = await getFileDownloadUrlAction(ans.fileKey!);
                              if (res.success && res.downloadUrl) {
                                window.open(res.downloadUrl, "_blank", "noopener,noreferrer");
                              } else {
                                window.open(`/api/files/${ans.fileKey}`, "_blank", "noopener,noreferrer");
                              }
                            } catch {
                              window.open(`/api/files/${ans.fileKey}`, "_blank", "noopener,noreferrer");
                            }
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-surface-container-lowest hover:bg-surface-container text-on-surface font-label-xs font-medium border border-[#e2e8f0] shadow-2xs transition-colors shrink-0"
                        >
                          <span className="material-symbols-outlined text-[15px]">visibility</span>
                          Open PDF
                        </button>
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

      {/* Footer */}
      <footer className="w-full bg-surface-container-low py-space-md border-t border-[#e2e8f0] text-center font-body-sm text-secondary">
        © 2025 ACI Career EDGE Assessment Platform. Standardized Evaluator Portal.
      </footer>
    </div>
  );
}
