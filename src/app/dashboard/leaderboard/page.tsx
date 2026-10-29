"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  getParticipantLeaderboard,
  type ParticipantLeaderboardData,
  type ParticipantLeaderboardRow,
} from "@/app/actions/participant-nav-actions";

function ParticipantLeaderboardContent() {
  const searchParams = useSearchParams();
  const contestIdParam = searchParams.get("contestId") || "";

  const [data, setData] = useState<ParticipantLeaderboardData | null>(null);
  const [selectedContestId, setSelectedContestId] = useState<string>(contestIdParam);
  const [isLoading, setIsLoading] = useState(true);

  const loadLeaderboard = async (contestId?: string) => {
    try {
      setIsLoading(true);
      const res = await getParticipantLeaderboard(contestId);
      setData(res);
      if (!selectedContestId && res.contestsList.length > 0) {
        setSelectedContestId(res.contestsList[0].id);
      }
    } catch (err) {
      console.error("Failed to load participant leaderboard:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (contestIdParam && contestIdParam !== selectedContestId) {
      setSelectedContestId(contestIdParam);
    }
  }, [contestIdParam]);

  useEffect(() => {
    loadLeaderboard(selectedContestId || undefined);
  }, [selectedContestId]);

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-space-lg sm:py-space-xl flex flex-col gap-space-lg">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-space-sm border-b border-[#e2e8f0] gap-space-sm">
        <div>
          <div className="flex items-center gap-space-xs text-secondary font-label-xs mb-1">
            <Link href="/dashboard" className="hover:text-on-surface">Candidate</Link>
            <span>/</span>
            <span className="text-on-surface font-medium">Cohort Leaderboard</span>
          </div>
          <h1 className="font-headline-md font-semibold text-on-surface tracking-tight">
            Cohort Benchmark Rankings
          </h1>
          <p className="font-body-sm text-secondary mt-0.5">
            Anonymized comparative cohort standings. In accordance with enterprise privacy standards, competitor identities are shielded with official Candidate IDs.
          </p>
        </div>

        {/* Contest Switcher */}
        {data && data.contestsList.length > 0 && (
          <div className="flex items-center gap-space-sm">
            <label className="font-label-xs text-secondary font-medium whitespace-nowrap">
              Challenge:
            </label>
            <select
              value={selectedContestId}
              onChange={(e) => setSelectedContestId(e.target.value)}
              className="px-3 py-2 bg-surface-container-lowest border border-[#e2e8f0] rounded text-on-surface font-label-sm font-medium focus:outline-none focus:border-primary-container"
            >
              {data.contestsList.map((c: { id: string; title: string }) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Standings Banner & Current Candidate Standing Card */}
      {data && (
        <div className="p-space-md bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-space-md">
          <div className="flex items-center gap-space-md">
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
                data.isPublished && data.currentUserRank
                  ? "bg-[#dcfce7] text-primary-container"
                  : "bg-surface-container text-secondary"
              }`}
            >
              <span className="material-symbols-outlined text-[28px]">
                {data.isPublished && data.currentUserRank ? "military_tech" : "hourglass_top"}
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-label-xs uppercase font-semibold text-secondary">
                  Your Current Standing
                </span>
                <span
                  className={`px-2 py-0.2 rounded text-[10px] font-bold uppercase tracking-wider ${
                    data.isPublished
                      ? "bg-[#dcfce7] text-[#166534]"
                      : "bg-[#fef3c7] text-[#92400e]"
                  }`}
                >
                  {data.isPublished ? "Official Certified" : "Official Results Pending"}
                </span>
              </div>
              <h3 className="font-headline-md font-bold text-on-surface mt-0.5">
                {data.isPublished && data.currentUserRank
                  ? `Rank #${data.currentUserRank}`
                  : "Official Results Pending"}
              </h3>
              <p className="font-body-xs text-secondary mt-0.5">
                {data.isPublished
                  ? "This rank is officially certified by platform administrators."
                  : "Evaluators and administrators are currently verifying submissions. Official ranks, percentiles, and scores will appear once certified and published."}
              </p>
            </div>
          </div>

          <div className="px-4 py-2 bg-surface-container-low rounded border border-[#e2e8f0] text-xs text-secondary self-start sm:self-auto max-w-xs">
            <strong className="text-on-surface block mb-0.5">Integrity & Tie-Breaking:</strong>
            Equal scores are broken chronologically by final submission timestamp. Unpublished results remain strictly shielded.
          </div>
        </div>
      )}

      {/* Leaderboard Table / Pending State */}
      <div className="bg-surface-container-lowest border border-[#e2e8f0] rounded-lg shadow-2xs overflow-hidden">
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center text-secondary">
            <span className="w-8 h-8 border-3 border-primary-container border-t-transparent rounded-full animate-spin mb-3"></span>
            <p className="font-label-sm">Loading cohort leaderboard...</p>
          </div>
        ) : !data || !data.isPublished || data.rows.length === 0 ? (
          <div className="p-12 text-center text-secondary flex flex-col items-center justify-center">
            <div className="w-14 h-14 rounded-full bg-surface-container flex items-center justify-center mb-3 text-secondary">
              <span className="material-symbols-outlined text-[32px]">
                lock_clock
              </span>
            </div>
            <h4 className="font-headline-sm font-semibold text-on-surface">
              Official Results Pending
            </h4>
            <p className="font-body-sm text-secondary mt-1 max-w-md">
              Official results for <strong>{data?.contestTitle || "this contest"}</strong> have not been published yet. In accordance with platform privacy protocols, provisional standings and competitor scores are shielded until certified publication.
            </p>
            <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-surface-container-low border border-[#e2e8f0] text-xs text-secondary font-medium">
              <span className="material-symbols-outlined text-[16px] text-amber-600">verified_user</span>
              <span>Submissions safely recorded for accreditation review</span>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low border-b border-[#e2e8f0] font-label-xs uppercase font-semibold text-secondary">
                  <th className="py-3 px-space-md w-20 text-center">Rank</th>
                  <th className="py-3 px-space-md">Candidate Identifier</th>
                  <th className="py-3 px-space-md text-right">Score</th>
                  <th className="py-3 px-space-md text-center">Certification Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9] font-body-sm text-on-surface">
                {data.rows.map((row: ParticipantLeaderboardRow) => (
                  <tr
                    key={row.candidateId}
                    className={`transition-colors ${
                      row.isCurrentUser
                        ? "bg-primary-container/10 font-medium"
                        : "hover:bg-surface-container-low/50"
                    }`}
                  >
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
                    <td className="py-3.5 px-space-md font-mono text-xs">
                      <div className="flex items-center gap-2">
                        <span className={row.isCurrentUser ? "text-primary-container font-bold" : "text-on-surface"}>
                          {row.candidateId}
                        </span>
                        {row.isCurrentUser && (
                          <span className="px-2 py-0.2 rounded-full bg-primary-container text-on-primary text-[10px] font-sans font-bold uppercase">
                            You
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-space-md text-right font-mono font-bold">
                      {data.isPublished || row.isCurrentUser ? (
                        <span className="text-primary-container">{row.finalScore} pts</span>
                      ) : (
                        <span className="text-secondary text-xs italic">Shielded until publish</span>
                      )}
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

export default function ParticipantLeaderboardPage() {
  return (
    <Suspense
      fallback={
        <div className="py-24 flex flex-col items-center justify-center text-secondary">
          <span className="w-8 h-8 border-3 border-primary-container border-t-transparent rounded-full animate-spin mb-3"></span>
          <p className="font-label-sm">Loading leaderboard...</p>
        </div>
      }
    >
      <ParticipantLeaderboardContent />
    </Suspense>
  );
}

