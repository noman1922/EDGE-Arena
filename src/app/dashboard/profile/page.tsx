"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  getParticipantProfile,
  type ParticipantProfileData,
} from "@/app/actions/participant-nav-actions";
import { logoutAction } from "@/app/actions/auth-actions";

export default function ParticipantProfilePage() {
  const [profile, setProfile] = useState<ParticipantProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      try {
        setIsLoading(true);
        const data = await getParticipantProfile();
        setProfile(data);
      } catch (err) {
        console.error("Failed to load profile:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadProfile();
  }, []);

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      await logoutAction();
      window.location.href = "/login";
    } catch (err) {
      console.error("Logout failed:", err);
      window.location.href = "/login";
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 py-space-lg sm:py-space-xl flex flex-col gap-space-lg">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-space-sm border-b border-[#e2e8f0] gap-space-sm">
        <div>
          <div className="flex items-center gap-space-xs text-secondary font-label-xs mb-1">
            <Link href="/dashboard" className="hover:text-on-surface">Candidate</Link>
            <span>/</span>
            <span className="text-on-surface font-medium">Account Profile</span>
          </div>
          <h1 className="font-headline-md font-semibold text-on-surface tracking-tight">
            Candidate Profile & Credentials
          </h1>
          <p className="font-body-sm text-secondary mt-0.5">
            Verified institutional affiliation, assessment credentials, and cohort assignment details.
          </p>
        </div>

        <button
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="self-start sm:self-auto px-3.5 py-1.5 rounded bg-surface-container-low hover:bg-surface-container-high text-error font-label-xs border border-[#e2e8f0] flex items-center gap-1.5 transition-colors"
        >
          <span className="material-symbols-outlined text-[16px]">logout</span>
          <span>{isLoggingOut ? "Signing Out..." : "Sign Out"}</span>
        </button>
      </div>

      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center text-secondary">
          <span className="w-8 h-8 border-3 border-primary-container border-t-transparent rounded-full animate-spin mb-3"></span>
          <p className="font-label-sm">Loading account details...</p>
        </div>
      ) : !profile ? (
        <div className="p-12 text-center bg-surface-container-lowest border border-[#e2e8f0] rounded-lg">
          <p className="text-secondary font-body-sm">Unable to load profile data.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md">
          {/* Left Hero Card */}
          <div className="p-space-lg bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs flex flex-col items-center text-center">
            <div className="w-20 h-20 rounded-full bg-primary-fixed text-on-primary-fixed flex items-center justify-center text-2xl font-bold font-mono mb-space-sm">
              {profile.name.slice(0, 2).toUpperCase()}
            </div>
            <h2 className="font-headline-md font-bold text-on-surface">{profile.name}</h2>
            <span className="text-secondary font-mono text-xs mt-0.5">{profile.candidateId}</span>
            <div className="mt-2 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
              Verified Active Candidate
            </div>

            <div className="w-full pt-space-md mt-space-md border-t border-[#e2e8f0] space-y-2 text-left text-xs">
              <div>
                <span className="text-secondary uppercase font-semibold text-[10px] block">Verified Email</span>
                <span className="text-on-surface font-mono">{profile.email}</span>
              </div>
              <div>
                <span className="text-secondary uppercase font-semibold text-[10px] block">Enrolled Cohort</span>
                <span className="text-on-surface">{profile.cohort}</span>
              </div>
              <div>
                <span className="text-secondary uppercase font-semibold text-[10px] block">Affiliation</span>
                <span className="text-on-surface">{profile.institution}</span>
              </div>
            </div>
          </div>

          {/* Right Metrics & Security Info */}
          <div className="md:col-span-2 flex flex-col gap-space-md">
            {/* Stat Counters */}
            <div className="grid grid-cols-2 gap-space-sm">
              <div className="p-space-md bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs">
                <span className="font-label-xs uppercase font-semibold text-secondary">
                  Enrolled Contests
                </span>
                <div className="text-3xl font-bold text-primary-container font-mono mt-1">
                  {profile.enrolledContestsCount}
                </div>
                <span className="text-xs text-secondary mt-1 block">Active curriculum assignments</span>
              </div>
              <div className="p-space-md bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs">
                <span className="font-label-xs uppercase font-semibold text-secondary">
                  Completed Submissions
                </span>
                <div className="text-3xl font-bold text-on-surface font-mono mt-1">
                  {profile.completedSubmissionsCount}
                </div>
                <span className="text-xs text-secondary mt-1 block">Verified diagnostic assessments</span>
              </div>
            </div>

            {/* Assessment Integrity Notice */}
            <div className="p-space-md bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-primary-container text-[20px]">
                  security
                </span>
                <h4 className="font-headline-sm font-semibold text-on-surface">
                  Identity & Session Security
                </h4>
              </div>
              <p className="font-body-sm text-secondary leading-relaxed">
                Your candidate profile is protected by HMAC-SHA256 authenticated cryptographic session tokens. Direct URL manipulation and tampering with contest or submission IDs are prevented server-side.
              </p>
              <div className="mt-3 pt-3 border-t border-[#e2e8f0] flex items-center justify-between text-xs text-secondary">
                <span>Account Created: <strong>{profile.joinedDate}</strong></span>
                <span className="font-mono text-[11px]">System Timezone: Asia/Dhaka (BST)</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
