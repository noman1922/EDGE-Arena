"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  getParticipantProfile,
  updateParticipantProfileAction,
  type ParticipantProfileData,
} from "@/app/actions/participant-nav-actions";
import { logoutAction } from "@/app/actions/auth-actions";

export default function ParticipantProfilePage() {
  const [profile, setProfile] = useState<ParticipantProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Edit Profile Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editInstitution, setEditInstitution] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileModalError, setProfileModalError] = useState<string | null>(null);
  const [profileSuccessMessage, setProfileSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadProfile() {
      try {
        setIsLoading(true);
        const data = await getParticipantProfile();
        setProfile(data);
        if (data) {
          setEditName(data.name);
          setEditInstitution(data.institution);
        }
      } catch (err) {
        console.error("Failed to load profile:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadProfile();
  }, []);

  const openEditModal = () => {
    if (profile) {
      setEditName(profile.name);
      setEditInstitution(profile.institution);
      setProfileModalError(null);
      setIsEditModalOpen(true);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) {
      setProfileModalError("Full name is required.");
      return;
    }
    if (editName.trim().length < 2) {
      setProfileModalError("Full name must be at least 2 characters.");
      return;
    }

    try {
      setIsSavingProfile(true);
      setProfileModalError(null);

      const res = await updateParticipantProfileAction({
        name: editName.trim(),
        institution: editInstitution.trim() || null,
      });

      if (res.success && res.name) {
        setProfile((prev) =>
          prev
            ? {
                ...prev,
                name: res.name!,
                institution: res.institution || "National Campus Cluster",
              }
            : null
        );
        setIsEditModalOpen(false);
        setProfileSuccessMessage("Profile information updated successfully.");
        setTimeout(() => setProfileSuccessMessage(null), 4000);
      } else {
        setProfileModalError(res.error || "Failed to update profile.");
      }
    } catch (err) {
      setProfileModalError(err instanceof Error ? err.message : "Network error updating profile");
    } finally {
      setIsSavingProfile(false);
    }
  };

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

        <div className="flex items-center gap-2">
          <button
            onClick={openEditModal}
            disabled={!profile}
            className="px-3.5 py-1.5 rounded bg-surface-container-high hover:bg-surface-container text-on-surface font-label-xs border border-[#e2e8f0] flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px] text-primary-container">edit</span>
            <span>Edit Profile</span>
          </button>
          <button
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="self-start sm:self-auto px-3.5 py-1.5 rounded bg-surface-container-low hover:bg-surface-container-high text-error font-label-xs border border-[#e2e8f0] flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">logout</span>
            <span>{isLoggingOut ? "Signing Out..." : "Sign Out"}</span>
          </button>
        </div>
      </div>

      {profileSuccessMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs flex items-center justify-between gap-2 animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-emerald-600">check_circle</span>
            <span className="font-medium">{profileSuccessMessage}</span>
          </div>
          <button
            onClick={() => setProfileSuccessMessage(null)}
            className="text-emerald-800 hover:text-emerald-950 font-bold"
          >
            ×
          </button>
        </div>
      )}

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

            <button
              onClick={openEditModal}
              className="w-full mt-4 py-2 px-3 rounded bg-surface-container-low hover:bg-surface-container text-on-surface font-label-xs font-semibold border border-[#e2e8f0] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[15px] text-primary-container">edit</span>
              <span>Edit Personal Details</span>
            </button>
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

      {/* Edit Profile Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div
            className="bg-surface-container-lowest max-w-md w-full rounded-xl border border-[#e2e8f0] shadow-2xl p-6 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#e2e8f0]">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px] text-primary-container">person_edit</span>
                <h3 className="font-headline-sm font-semibold text-on-surface">Edit Profile Information</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                disabled={isSavingProfile}
                className="text-secondary hover:text-on-surface font-bold text-lg p-1 rounded transition-colors cursor-pointer"
              >
                ×
              </button>
            </div>

            {profileModalError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-xs flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] shrink-0">error</span>
                <span>{profileModalError}</span>
              </div>
            )}

            <form onSubmit={handleSaveProfile} className="flex flex-col gap-3.5">
              {/* Protected Fields Summary */}
              <div className="p-3 rounded-lg bg-surface-container-low border border-[#e2e8f0] flex flex-col gap-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-secondary font-medium">Verified Email:</span>
                  <span className="text-on-surface font-mono font-medium">{profile?.email}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-secondary font-medium">Candidate ID:</span>
                  <span className="text-on-surface font-mono font-medium">{profile?.candidateId}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-secondary font-medium">Cohort:</span>
                  <span className="text-on-surface">{profile?.cohort}</span>
                </div>
                <p className="text-[10px] text-secondary mt-1 pt-1 border-t border-[#f1f5f9]">
                  Protected credentials (email, candidate ID, cohort) cannot be modified.
                </p>
              </div>

              {/* Full Name */}
              <div>
                <label className="font-label-xs text-secondary font-semibold uppercase block mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Your full legal or professional name"
                  className="w-full px-3 py-2 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface font-label-md"
                />
              </div>

              {/* Institution / Affiliation */}
              <div>
                <label className="font-label-xs text-secondary font-semibold uppercase block mb-1">
                  Affiliation / Institution
                </label>
                <input
                  type="text"
                  value={editInstitution}
                  onChange={(e) => setEditInstitution(e.target.value)}
                  placeholder="e.g., Dhaka University / Sales Division"
                  className="w-full px-3 py-2 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface font-label-md"
                />
                <p className="text-[11px] text-secondary mt-0.5">
                  Your university, college, enterprise branch, or regional cluster.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#e2e8f0] mt-1">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  disabled={isSavingProfile}
                  className="px-4 py-2 rounded bg-surface-container-high text-on-surface font-label-md font-medium hover:bg-surface-container transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingProfile}
                  className="px-4 py-2 rounded bg-primary-container text-on-primary font-label-md font-semibold hover:opacity-95 transition-opacity cursor-pointer flex items-center gap-1.5"
                >
                  {isSavingProfile ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[16px]">check</span>
                      <span>Save Changes</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
