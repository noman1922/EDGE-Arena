"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  getParticipantScorecard,
  type ParticipantScorecardData,
} from "@/app/actions/participant-nav-actions";

export default function ParticipantResultsPage() {
  const [scorecard, setScorecard] = useState<ParticipantScorecardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [filterType, setFilterType] = useState<"ALL" | "CORRECT" | "INCORRECT" | "UNANSWERED" | "WRITTEN">("ALL");

  const loadScorecard = async () => {
    try {
      setIsLoading(true);
      const data = await getParticipantScorecard();
      setScorecard(data);
    } catch (err) {
      console.error("Failed to load scorecard:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadScorecard();
  }, []);

  return (
    <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 py-space-lg sm:py-space-xl flex flex-col gap-space-lg">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-space-sm border-b border-[#e2e8f0] gap-space-sm">
        <div>
          <div className="flex items-center gap-space-xs text-secondary font-label-xs mb-1">
            <Link href="/dashboard" className="hover:text-on-surface">Candidate</Link>
            <span>/</span>
            <span className="text-on-surface font-medium">My Results & Scorecard</span>
          </div>
          <h1 className="font-headline-md font-semibold text-on-surface tracking-tight">
            Official Performance Diagnostic Scorecard
          </h1>
          <p className="font-body-sm text-secondary mt-0.5">
            Verified assessment outcome, standing benchmarks, and evaluator rubric feedback.
          </p>
        </div>

        <button
          onClick={loadScorecard}
          className="self-start sm:self-auto px-3 py-1.5 rounded bg-surface-container-low hover:bg-surface-container text-on-surface font-label-xs border border-[#e2e8f0] flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-[16px]">refresh</span>
          Refresh Scorecard
        </button>
      </div>

      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center text-secondary">
          <span className="w-8 h-8 border-3 border-primary-container border-t-transparent rounded-full animate-spin mb-3"></span>
          <p className="font-label-sm">Retrieving your verified score records...</p>
        </div>
      ) : !scorecard ? (
        <div className="p-12 text-center bg-surface-container-lowest border border-[#e2e8f0] rounded-lg">
          <span className="material-symbols-outlined text-[48px] text-secondary mb-2">assignment_late</span>
          <h3 className="font-headline-sm font-semibold text-on-surface">No Assessment Submissions Found</h3>
          <p className="font-body-sm text-secondary mt-1 max-w-md mx-auto">
            You have not submitted any completed assessments yet. Complete a diagnostic challenge from your dashboard to receive an evaluation.
          </p>
          <Link
            href="/assessment"
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded bg-primary-container text-on-primary font-label-sm font-medium"
          >
            <span>Go to Assessment Workspace</span>
            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
          </Link>
        </div>
      ) : !scorecard.isPublished ? (
        /* Results Not Published State - Strict Security Guard */
        <div className="p-space-xl bg-surface-container-lowest border border-[#e2e8f0] rounded-lg shadow-2xs text-center flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center mb-space-md">
            <span className="material-symbols-outlined text-[32px]">hourglass_top</span>
          </div>
          <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-bold uppercase tracking-wider mb-2">
            Grading In Progress
          </span>
          <h2 className="font-headline-md font-bold text-on-surface">
            Results Pending Official Certification
          </h2>
          <p className="font-body-md text-secondary mt-2 max-w-lg">
            Your assessment for <strong>{scorecard.contestTitle}</strong> has been received ({scorecard.submissionStatus}). Evaluators are currently assessing written responses against the standardized rubric matrix.
          </p>
          <div className="mt-space-lg p-space-md bg-surface-container-low rounded border border-[#e2e8f0] text-xs text-secondary max-w-md text-left">
            <div className="flex items-center gap-1.5 font-semibold text-on-surface mb-1">
              <span className="material-symbols-outlined text-[16px] text-primary-container">verified</span>
              Candidate Privacy Assurance
            </div>
            <p>
              In accordance with enterprise assessment governance, scores and standings are withheld until all submissions in the cohort are independently reviewed and certified by platform administrators.
            </p>
          </div>
        </div>
      ) : (
        /* Official Published Scorecard */
        <div className="flex flex-col gap-space-lg">
          {/* Hero Outcome Card */}
          <div className="p-space-lg sm:p-space-xl bg-surface-container-lowest border border-[#e2e8f0] rounded-lg shadow-2xs relative overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-md pb-space-md border-b border-[#e2e8f0]">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded bg-surface-container font-label-xs font-semibold text-secondary uppercase tracking-wider">
                    {scorecard.track}
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded font-label-xs font-bold uppercase tracking-wider ${
                      scorecard.selectionStatus === "SELECTED"
                        ? "bg-[#dcfce7] text-[#166534] border border-[#bbf7d0]"
                        : scorecard.selectionStatus === "PROVISIONAL"
                        ? "bg-amber-100 text-amber-900 border border-amber-300"
                        : "bg-[#dcfce7] text-[#166534]"
                    }`}
                  >
                    {scorecard.selectionStatus || "Official Certified Outcome"}
                  </span>
                </div>
                <h2 className="font-headline-lg font-bold text-on-surface tracking-tight mt-1.5">
                  {scorecard.contestTitle}
                </h2>
                <p className="text-secondary font-body-sm mt-0.5">
                  Submitted on{" "}
                  {scorecard.submittedAt
                    ? new Date(scorecard.submittedAt).toLocaleDateString("en-US", {
                        timeZone: "Asia/Dhaka",
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "—"}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary-container text-[28px]">
                  verified
                </span>
                <span className="font-label-sm font-semibold text-primary-container">
                  Institutional Credential Valid
                </span>
              </div>
            </div>

            {/* Score Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-space-md mt-space-lg text-center">
              <div className="p-space-md bg-surface-container-low rounded-lg border border-[#e2e8f0]">
                <span className="font-label-xs uppercase font-semibold text-secondary block">
                  Total Final Score
                </span>
                <div className="text-3xl font-bold text-primary-container font-mono mt-1">
                  {scorecard.totalScore}
                  <span className="text-sm font-normal text-secondary"> / 100</span>
                </div>
                <span className="font-label-xs text-secondary mt-1 block">
                  Weighted Combined Total
                </span>
              </div>

              <div className="p-space-md bg-surface-container-low rounded-lg border border-[#e2e8f0]">
                <span className="font-label-xs uppercase font-semibold text-secondary block">
                  Cohort Rank
                </span>
                <div className="text-3xl font-bold text-on-surface font-mono mt-1">
                  {scorecard.rank ? `#${scorecard.rank}` : "—"}
                </div>
                <span className="font-label-xs text-secondary mt-1 block">
                  Certified Standings
                </span>
              </div>

              <div className="p-space-md bg-surface-container-low rounded-lg border border-[#e2e8f0]">
                <span className="font-label-xs uppercase font-semibold text-secondary block">
                  {scorecard.isFreedomContest ? "Selection Status" : "Cohort Percentile"}
                </span>
                <div
                  className={`text-3xl font-bold font-mono mt-1 ${
                    scorecard.selectionStatus === "SELECTED"
                      ? "text-[#166534]"
                      : scorecard.selectionStatus === "PROVISIONAL"
                      ? "text-amber-800"
                      : "text-on-surface"
                  }`}
                >
                  {scorecard.isFreedomContest
                    ? scorecard.selectionStatus || "—"
                    : scorecard.percentile !== null
                    ? `${scorecard.percentile}%`
                    : "—"}
                </div>
                <span className="font-label-xs text-secondary mt-1 block">
                  {scorecard.isFreedomContest
                    ? scorecard.selectionStatus === "SELECTED"
                      ? "Qualified (16-20 Marks)"
                      : "Provisional (0-15 Marks)"
                    : "Outperformed Peer Group"}
                </span>
              </div>
            </div>
          </div>

          {/* Rubric Breakdown Section */}
          <div className="p-space-lg bg-surface-container-lowest border border-[#e2e8f0] rounded-lg shadow-2xs">
            <h3 className="font-headline-sm font-semibold text-on-surface mb-1">
              Rubric Competency Matrix & Qualitative Commentary
            </h3>
            <p className="font-body-sm text-secondary mb-space-md">
              Detailed breakdown of scores awarded by certified evaluators across each core assessment rubric dimension.
            </p>

            <div className="space-y-space-md">
              {scorecard.rubrics.map((r, i) => (
                <div
                  key={i}
                  className="p-space-md bg-surface-container-low rounded-lg border border-[#e2e8f0]"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-[#e2e8f0] gap-1">
                    <span className="font-body-md font-semibold text-on-surface">
                      {r.name}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-label-xs text-secondary font-mono">
                        Weight: {r.weight}%
                      </span>
                      <span className="font-label-sm font-bold font-mono text-primary-container bg-primary-container/10 px-2 py-0.5 rounded">
                        {r.scoreAwarded} / {r.maxPoints} pts
                      </span>
                    </div>
                  </div>

                  {r.comments && (
                    <div className="mt-2.5 p-3 bg-surface-container-lowest rounded border border-[#e2e8f0] text-xs text-secondary">
                      <strong className="text-on-surface block mb-0.5">Evaluator Commentary:</strong>
                      <p className="italic leading-relaxed">&quot;{r.comments}&quot;</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Detailed Question & Answer Performance Audit Section */}
          {scorecard.questionReviews && scorecard.questionReviews.length > 0 && (
            <div className="p-space-lg bg-surface-container-lowest border border-[#e2e8f0] rounded-lg shadow-2xs flex flex-col gap-space-md">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-space-sm border-b border-[#e2e8f0] gap-space-sm">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary-container text-[22px]">
                      fact_check
                    </span>
                    <h3 className="font-headline-sm font-semibold text-on-surface">
                      Detailed Question & Answer Performance Audit
                    </h3>
                  </div>
                  <p className="font-body-sm text-secondary mt-0.5">
                    Review your submitted answers, official answer keys, correct/incorrect status, and evaluator marks across all assessment questions.
                  </p>
                </div>

                {/* Summary Metric Counters */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-1 rounded bg-surface-container text-xs font-semibold text-on-surface">
                    Total: {scorecard.questionReviews.length} Qs
                  </span>
                  <span className="px-2.5 py-1 rounded bg-[#dcfce7] text-xs font-semibold text-[#166534] border border-[#bbf7d0]">
                    {scorecard.questionReviews.filter((q) => q.status === "CORRECT").length} Correct
                  </span>
                  <span className="px-2.5 py-1 rounded bg-[#fee2e2] text-xs font-semibold text-[#991b1b] border border-[#fecaca]">
                    {scorecard.questionReviews.filter((q) => q.status === "INCORRECT").length} Incorrect
                  </span>
                  {scorecard.questionReviews.filter((q) => q.status === "UNANSWERED").length > 0 && (
                    <span className="px-2.5 py-1 rounded bg-slate-100 text-xs font-semibold text-slate-700 border border-slate-200">
                      {scorecard.questionReviews.filter((q) => q.status === "UNANSWERED").length} Unanswered
                    </span>
                  )}
                </div>
              </div>

              {/* Filter Selector Tabs */}
              <div className="flex flex-wrap items-center gap-1.5 border-b border-[#e2e8f0] pb-2 text-xs">
                <button
                  onClick={() => setFilterType("ALL")}
                  className={`px-3 py-1.5 rounded-full font-medium transition-colors cursor-pointer ${
                    filterType === "ALL"
                      ? "bg-on-surface text-surface font-semibold"
                      : "bg-surface-container-low text-secondary hover:text-on-surface"
                  }`}
                >
                  All Questions ({scorecard.questionReviews.length})
                </button>
                <button
                  onClick={() => setFilterType("CORRECT")}
                  className={`px-3 py-1.5 rounded-full font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                    filterType === "CORRECT"
                      ? "bg-[#15803d] text-white font-semibold shadow-2xs"
                      : "bg-surface-container-low text-[#15803d] hover:bg-[#dcfce7]"
                  }`}
                >
                  <span className="material-symbols-outlined text-[13px]">check_circle</span>
                  <span>Correct ({scorecard.questionReviews.filter((q) => q.status === "CORRECT").length})</span>
                </button>
                <button
                  onClick={() => setFilterType("INCORRECT")}
                  className={`px-3 py-1.5 rounded-full font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                    filterType === "INCORRECT"
                      ? "bg-[#b91c1c] text-white font-semibold shadow-2xs"
                      : "bg-surface-container-low text-[#b91c1c] hover:bg-[#fee2e2]"
                  }`}
                >
                  <span className="material-symbols-outlined text-[13px]">cancel</span>
                  <span>Incorrect ({scorecard.questionReviews.filter((q) => q.status === "INCORRECT").length})</span>
                </button>
                {scorecard.questionReviews.some((q) => q.status === "UNANSWERED") && (
                  <button
                    onClick={() => setFilterType("UNANSWERED")}
                    className={`px-3 py-1.5 rounded-full font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                      filterType === "UNANSWERED"
                        ? "bg-slate-700 text-white font-semibold shadow-2xs"
                        : "bg-surface-container-low text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    <span className="material-symbols-outlined text-[13px]">help_outline</span>
                    <span>Unanswered ({scorecard.questionReviews.filter((q) => q.status === "UNANSWERED").length})</span>
                  </button>
                )}
                {scorecard.questionReviews.some((q) => q.type === "WRITTEN" || q.type === "FILE_UPLOAD") && (
                  <button
                    onClick={() => setFilterType("WRITTEN")}
                    className={`px-3 py-1.5 rounded-full font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                      filterType === "WRITTEN"
                        ? "bg-blue-700 text-white font-semibold shadow-2xs"
                        : "bg-surface-container-low text-blue-700 hover:bg-blue-100"
                    }`}
                  >
                    <span className="material-symbols-outlined text-[13px]">edit_note</span>
                    <span>Written / Essays ({scorecard.questionReviews.filter((q) => q.type === "WRITTEN" || q.type === "FILE_UPLOAD").length})</span>
                  </button>
                )}
              </div>

              {/* Questions List */}
              <div className="space-y-4">
                {scorecard.questionReviews
                  .filter((q) => {
                    if (filterType === "CORRECT") return q.status === "CORRECT";
                    if (filterType === "INCORRECT") return q.status === "INCORRECT";
                    if (filterType === "UNANSWERED") return q.status === "UNANSWERED";
                    if (filterType === "WRITTEN") return q.type === "WRITTEN" || q.type === "FILE_UPLOAD";
                    return true;
                  })
                  .map((q, idx) => {
                    const isCorrect = q.status === "CORRECT";
                    const isIncorrect = q.status === "INCORRECT";
                    const isUnanswered = q.status === "UNANSWERED";

                    return (
                      <div
                        key={q.id || idx}
                        className={`p-space-md rounded-lg border transition-all text-[#191c1e] ${
                          isCorrect
                            ? "bg-emerald-50/40 border-emerald-300"
                            : isIncorrect
                            ? "bg-rose-50/40 border-rose-300"
                            : isUnanswered
                            ? "bg-slate-50/60 border-slate-200"
                            : "bg-surface-container-lowest border-[#e2e8f0]"
                        }`}
                      >
                        {/* Item Header Meta */}
                        <div className="flex flex-wrap items-center justify-between pb-2 border-b border-[#e2e8f0] gap-2">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-surface-container text-on-surface">
                              Q{q.questionNumber}
                            </span>
                            <span className="text-xs text-secondary font-medium">
                              Module {q.phaseNumber} · Unit {q.taskNumber}: {q.taskTitle}
                            </span>
                            <span className="px-2 py-0.2 rounded text-[10px] font-semibold bg-surface-container-high text-secondary uppercase tracking-wider">
                              {q.type === "MCQ" ? "Multiple Choice" : q.type === "WRITTEN" ? "Written Essay" : "File Upload"}
                            </span>
                          </div>

                          {/* Status Indicator Badges */}
                          <div className="flex items-center gap-2">
                            {isCorrect && (
                              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-[#dcfce7] text-[#166534] border border-[#86efac] flex items-center gap-1 shadow-2xs">
                                <span className="material-symbols-outlined text-[14px]">check_circle</span>
                                <span>Correct (+{q.earnedScore ?? q.points} pts)</span>
                              </span>
                            )}
                            {isIncorrect && (
                              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-[#fee2e2] text-[#991b1b] border border-[#fca5a5] flex items-center gap-1 shadow-2xs">
                                <span className="material-symbols-outlined text-[14px]">cancel</span>
                                <span>Incorrect (0 / {q.points} pts)</span>
                              </span>
                            )}
                            {isUnanswered && (
                              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-200 text-slate-700 border border-slate-300 flex items-center gap-1">
                                <span className="material-symbols-outlined text-[14px]">remove_circle_outline</span>
                                <span>Unanswered (0 / {q.points} pts)</span>
                              </span>
                            )}
                            {!isCorrect && !isIncorrect && !isUnanswered && q.earnedScore !== null && (
                              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                                <span className="material-symbols-outlined text-[14px]">verified</span>
                                <span>Awarded: {q.earnedScore} / {q.points} pts</span>
                              </span>
                            )}
                            {!isCorrect && !isIncorrect && !isUnanswered && q.earnedScore === null && (
                              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                                <span className="material-symbols-outlined text-[14px]">hourglass_empty</span>
                                <span>Pending Evaluation</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Question Prompt */}
                        <div className="pt-2">
                          <h4 className="font-body-md font-semibold text-on-surface leading-relaxed">
                            {q.prompt}
                          </h4>
                          {q.instructions && (
                            <p className="text-xs text-secondary mt-0.5 italic">
                              {q.instructions}
                            </p>
                          )}
                        </div>

                        {/* MCQ Options Display */}
                        {q.type === "MCQ" && (
                          <div className="mt-3 space-y-2">
                            {q.options.map((opt) => {
                              const isSelected = q.selectedOption === opt.optionKey;
                              const isCorrectKey = q.correctOptionKey === opt.optionKey;
                              const isIncorrectSelected = isSelected && !isCorrectKey;

                              let optCardClass = "bg-white border-[#e2e8f0] text-secondary";
                              if (isCorrectKey) {
                                optCardClass = "bg-emerald-50 border-emerald-500 text-emerald-950 ring-1 ring-emerald-500/30";
                              } else if (isIncorrectSelected) {
                                optCardClass = "bg-rose-50 border-rose-400 text-rose-950 ring-1 ring-rose-400/30";
                              }

                              return (
                                <div
                                  key={opt.id}
                                  className={`p-3 rounded-lg border text-xs sm:text-sm flex items-start justify-between gap-3 ${optCardClass}`}
                                >
                                  <div className="flex items-start gap-2.5">
                                    <span
                                      className={`w-6 h-6 rounded flex items-center justify-center font-bold text-xs uppercase shrink-0 ${
                                        isCorrectKey
                                          ? "bg-emerald-600 text-white"
                                          : isIncorrectSelected
                                          ? "bg-rose-600 text-white"
                                          : "bg-surface-container text-on-surface"
                                      }`}
                                    >
                                      {opt.optionKey}
                                    </span>
                                    <span className="pt-0.5 font-medium leading-relaxed">
                                      {opt.text}
                                    </span>
                                  </div>

                                  {/* Badges */}
                                  <div className="shrink-0 flex items-center gap-1.5">
                                    {isCorrectKey && (
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-200 text-emerald-950 border border-emerald-300 flex items-center gap-0.5">
                                        <span className="material-symbols-outlined text-[12px]">check</span>
                                        {isSelected ? "Your Answer (Correct)" : "Correct Answer"}
                                      </span>
                                    )}
                                    {isIncorrectSelected && (
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-200 text-rose-950 border border-rose-300 flex items-center gap-0.5">
                                        <span className="material-symbols-outlined text-[12px]">close</span>
                                        Your Answer (Incorrect)
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}

                            {/* Explanation Box */}
                            {q.explanation && (
                              <div className="mt-2.5 p-3 rounded-lg bg-emerald-50/80 border border-emerald-200 text-xs text-emerald-950 flex items-start gap-2">
                                <span className="material-symbols-outlined text-[16px] text-emerald-700 shrink-0 mt-0.5">
                                  lightbulb
                                </span>
                                <div>
                                  <strong className="font-semibold block mb-0.5 text-emerald-900">Official Solution Explanation:</strong>
                                  <p className="leading-relaxed text-emerald-900">{q.explanation}</p>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Written Response Display */}
                        {q.type === "WRITTEN" && (
                          <div className="mt-3 space-y-2">
                            {q.writtenText ? (
                              <div className="p-3.5 rounded-lg bg-surface-container-lowest border border-[#e2e8f0] text-xs sm:text-sm">
                                <div className="flex items-center justify-between text-secondary text-[11px] pb-1.5 border-b border-[#e2e8f0] mb-2">
                                  <span className="font-semibold text-on-surface">Your Submitted Response:</span>
                                  <span>{q.wordCount ?? q.writtenText.split(/\s+/).filter(Boolean).length} words</span>
                                </div>
                                <p className="whitespace-pre-wrap leading-relaxed text-on-surface">
                                  {q.writtenText}
                                </p>
                              </div>
                            ) : (
                              <p className="text-secondary text-xs italic p-2 bg-surface-container-low rounded">
                                No response submitted for this essay prompt.
                              </p>
                            )}

                            {q.evaluatorFeedback && (
                              <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-950 flex items-start gap-2">
                                <span className="material-symbols-outlined text-[16px] text-blue-700 shrink-0 mt-0.5">
                                  rate_review
                                </span>
                                <div>
                                  <strong className="font-semibold block mb-0.5 text-blue-950">Evaluator Qualitative Assessment:</strong>
                                  <p className="leading-relaxed italic text-blue-900">&quot;{q.evaluatorFeedback}&quot;</p>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* File Upload Display */}
                        {(q.type === "FILE_UPLOAD" || q.type === "PDF" || q.type === "FILE") && (
                          <div className="mt-3 space-y-2">
                            {q.fileKey ? (
                              <div className="p-3 rounded-lg bg-surface-container-lowest border border-[#e2e8f0] flex items-center justify-between gap-3 text-xs">
                                <div className="flex items-center gap-2 truncate">
                                  <span className="material-symbols-outlined text-rose-600 text-[20px] shrink-0">
                                    picture_as_pdf
                                  </span>
                                  <span className="font-medium text-on-surface truncate">
                                    {q.fileName || "Uploaded Deliverable.pdf"}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <a
                                    href={`/api/files/${q.fileKey}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-2.5 py-1 rounded border border-[#e2e8f0] hover:bg-surface-container text-on-surface font-medium flex items-center gap-1"
                                  >
                                    <span className="material-symbols-outlined text-[13px]">visibility</span>
                                    <span>View</span>
                                  </a>
                                  <a
                                    href={`/api/files/${q.fileKey}?download=1`}
                                    download={q.fileName || "deliverable.pdf"}
                                    className="px-2.5 py-1 rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-medium flex items-center gap-1"
                                  >
                                    <span className="material-symbols-outlined text-[13px]">download</span>
                                    <span>Download</span>
                                  </a>
                                </div>
                              </div>
                            ) : (
                              <p className="text-secondary text-xs italic p-2 bg-surface-container-low rounded">
                                No file uploaded for this requirement.
                              </p>
                            )}

                            {q.evaluatorFeedback && (
                              <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-950 flex items-start gap-2">
                                <span className="material-symbols-outlined text-[16px] text-blue-700 shrink-0 mt-0.5">
                                  rate_review
                                </span>
                                <div>
                                  <strong className="font-semibold block mb-0.5 text-blue-950">Evaluator Qualitative Assessment:</strong>
                                  <p className="leading-relaxed italic text-blue-900">&quot;{q.evaluatorFeedback}&quot;</p>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
