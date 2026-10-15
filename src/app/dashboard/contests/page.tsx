"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  getParticipantContests,
  type ParticipantContestCard,
} from "@/app/actions/participant-nav-actions";

export default function ParticipantContestsPage() {
  const [contests, setContests] = useState<{
    live: ParticipantContestCard[];
    upcoming: ParticipantContestCard[];
    completed: ParticipantContestCard[];
  }>({
    live: [],
    upcoming: [],
    completed: [],
  });
  const [activeTab, setActiveTab] = useState<"LIVE" | "UPCOMING" | "COMPLETED">("LIVE");
  const [isLoading, setIsLoading] = useState(true);

  const loadContests = async () => {
    try {
      setIsLoading(true);
      const data = await getParticipantContests();
      setContests(data);
      if (data.live.length === 0 && data.upcoming.length > 0) {
        setActiveTab("UPCOMING");
      } else if (data.live.length === 0 && data.upcoming.length === 0 && data.completed.length > 0) {
        setActiveTab("COMPLETED");
      }
    } catch (err) {
      console.error("Failed to load participant contests:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadContests();
  }, []);

  const currentList =
    activeTab === "LIVE"
      ? contests.live
      : activeTab === "UPCOMING"
      ? contests.upcoming
      : contests.completed;

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-space-lg sm:py-space-xl flex flex-col gap-space-lg">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-space-sm border-b border-[#e2e8f0] gap-space-sm">
        <div>
          <div className="flex items-center gap-space-xs text-secondary font-label-xs mb-1">
            <Link href="/dashboard" className="hover:text-on-surface">Candidate</Link>
            <span>/</span>
            <span className="text-on-surface font-medium">My Contests</span>
          </div>
          <h1 className="font-headline-md font-semibold text-on-surface tracking-tight">
            Assigned Benchmark Contests
          </h1>
          <p className="font-body-sm text-secondary mt-0.5">
            View all diagnostic assessments assigned to your candidate profile across live, upcoming, and completed stages.
          </p>
        </div>

        <button
          onClick={loadContests}
          className="self-start sm:self-auto px-3 py-1.5 rounded bg-surface-container-low hover:bg-surface-container text-on-surface font-label-xs border border-[#e2e8f0] flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-[16px]">refresh</span>
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-[#e2e8f0] pb-2">
        <button
          onClick={() => setActiveTab("LIVE")}
          className={`px-4 py-2 rounded font-label-sm font-semibold flex items-center gap-2 transition-colors ${
            activeTab === "LIVE"
              ? "bg-primary-container text-on-primary shadow-xs"
              : "text-secondary hover:text-on-surface hover:bg-surface-container-high"
          }`}
        >
          <span>Live Now</span>
          <span className={`px-1.5 py-0.2 text-[11px] rounded-full font-mono ${
            activeTab === "LIVE" ? "bg-white/20 text-white" : "bg-surface-container text-secondary"
          }`}>
            {contests.live.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("UPCOMING")}
          className={`px-4 py-2 rounded font-label-sm font-semibold flex items-center gap-2 transition-colors ${
            activeTab === "UPCOMING"
              ? "bg-primary-container text-on-primary shadow-xs"
              : "text-secondary hover:text-on-surface hover:bg-surface-container-high"
          }`}
        >
          <span>Upcoming</span>
          <span className={`px-1.5 py-0.2 text-[11px] rounded-full font-mono ${
            activeTab === "UPCOMING" ? "bg-white/20 text-white" : "bg-surface-container text-secondary"
          }`}>
            {contests.upcoming.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("COMPLETED")}
          className={`px-4 py-2 rounded font-label-sm font-semibold flex items-center gap-2 transition-colors ${
            activeTab === "COMPLETED"
              ? "bg-primary-container text-on-primary shadow-xs"
              : "text-secondary hover:text-on-surface hover:bg-surface-container-high"
          }`}
        >
          <span>Completed</span>
          <span className={`px-1.5 py-0.2 text-[11px] rounded-full font-mono ${
            activeTab === "COMPLETED" ? "bg-white/20 text-white" : "bg-surface-container text-secondary"
          }`}>
            {contests.completed.length}
          </span>
        </button>
      </div>

      {/* Contest Cards List */}
      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center text-secondary">
          <span className="w-8 h-8 border-3 border-primary-container border-t-transparent rounded-full animate-spin mb-3"></span>
          <p className="font-label-sm">Retrieving your contest assignments...</p>
        </div>
      ) : currentList.length === 0 ? (
        <div className="p-12 text-center bg-surface-container-lowest border border-[#e2e8f0] rounded-lg">
          <span className="material-symbols-outlined text-[40px] text-secondary mb-2">
            folder_off
          </span>
          <h4 className="font-headline-sm font-semibold text-on-surface">
            No {activeTab.toLowerCase()} contests
          </h4>
          <p className="font-body-sm text-secondary mt-1 max-w-sm mx-auto">
            {activeTab === "LIVE"
              ? "You do not have any benchmark contests active right now. Check the Upcoming tab for scheduled assessments."
              : activeTab === "UPCOMING"
              ? "No scheduled upcoming contests found for your enrolled cohort."
              : "You have not completed any benchmark assessments yet."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-space-md">
          {currentList.map((contest) => (
            <div
              key={contest.id}
              className="p-space-lg bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs hover:border-primary-container/40 transition-all flex flex-col md:flex-row md:items-center justify-between gap-space-md"
            >
              <div className="flex flex-col gap-1.5 max-w-2xl">
                <div className="flex items-center gap-2">
                  <span className="font-label-xs font-semibold px-2 py-0.5 rounded bg-surface-container text-secondary uppercase tracking-wider">
                    {contest.track}
                  </span>
                  <span
                    className={`font-label-xs font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                      contest.status === "LIVE"
                        ? "bg-[#dcfce7] text-[#166534]"
                        : contest.status === "UPCOMING"
                        ? "bg-blue-100 text-blue-800"
                        : "bg-surface-container text-secondary"
                    }`}
                  >
                    {contest.status}
                  </span>
                </div>

                <h3 className="font-headline-md font-semibold text-on-surface mt-1">
                  {contest.title}
                </h3>

                <p className="font-body-sm text-secondary">
                  {contest.description || "Comprehensive diagnostic assessment measuring strategic decision making and leadership execution."}
                </p>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-secondary mt-2">
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-[15px]">schedule</span>
                    Deadline: <strong>{contest.deadlineFormatted}</strong>
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-[15px]">task</span>
                    Current Stage: <strong>{contest.stageTitle}</strong>
                  </span>
                  <span>•</span>
                  <span>
                    Your Status:{" "}
                    <strong
                      className={
                        contest.submissionStatus === "SUBMITTED" || contest.submissionStatus === "GRADED"
                          ? "text-primary-container"
                          : "text-amber-700"
                      }
                    >
                      {contest.submissionStatus}
                    </strong>
                  </span>
                </div>
              </div>

              {/* Action Column */}
              <div className="flex flex-col sm:flex-row md:flex-col items-start md:items-end gap-2 shrink-0">
                {contest.canStartOrContinue ? (
                  <Link
                    href="/assessment"
                    className="px-5 py-2.5 rounded bg-primary-container hover:bg-[#166534] text-on-primary font-label-md font-medium shadow-2xs flex items-center gap-1.5 transition-colors"
                  >
                    <span>
                      {contest.submissionStatus === "IN_PROGRESS"
                        ? "Continue Assessment"
                        : "Start Assessment"}
                    </span>
                    <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                  </Link>
                ) : contest.status === "UPCOMING" ? (
                  <button
                    disabled
                    className="px-4 py-2 rounded bg-surface-container text-secondary font-label-sm font-medium cursor-not-allowed border border-[#e2e8f0]"
                  >
                    Starts {contest.startDateFormatted}
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <Link
                      href="/dashboard/results"
                      className="px-4 py-2 rounded bg-surface-container-high hover:bg-surface-container text-on-surface font-label-sm font-medium border border-[#e2e8f0]"
                    >
                      View Results
                    </Link>
                    <Link
                      href="/dashboard/leaderboard"
                      className="px-4 py-2 rounded bg-surface-container-low hover:bg-surface-container text-on-surface font-label-sm font-medium border border-[#e2e8f0]"
                    >
                      Leaderboard
                    </Link>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
