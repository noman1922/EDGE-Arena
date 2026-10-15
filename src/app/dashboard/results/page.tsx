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
            Verified assessment outcome, percentile benchmarks, and evaluator rubric feedback.
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
              In accordance with enterprise assessment governance, scores and rank percentiles are withheld until all submissions in the cohort are independently reviewed and certified by platform administrators.
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
                  <span className="px-2.5 py-0.5 rounded bg-[#dcfce7] text-[#166534] font-label-xs font-bold uppercase tracking-wider">
                    Official Certified Outcome
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
                  Cohort Percentile
                </span>
                <div className="text-3xl font-bold text-on-surface font-mono mt-1">
                  {scorecard.percentile !== null ? `${scorecard.percentile}%` : "—"}
                </div>
                <span className="font-label-xs text-secondary mt-1 block">
                  Outperformed Peer Group
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
        </div>
      )}
    </div>
  );
}
