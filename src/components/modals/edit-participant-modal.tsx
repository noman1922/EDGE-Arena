"use client";

import React, { useState, useEffect } from "react";
import {
  updateParticipantByAdminAction,
  type AdminParticipantItem,
} from "@/app/actions/participant-actions";

export interface EditParticipantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (updated: AdminParticipantItem) => void;
  participant: AdminParticipantItem | null;
}

export function EditParticipantModal({
  isOpen,
  onClose,
  onSuccess,
  participant,
}: EditParticipantModalProps) {
  const [name, setName] = useState("");
  const [candidateId, setCandidateId] = useState("");
  const [institution, setInstitution] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (participant) {
      setName(participant.name || "");
      setCandidateId(participant.candidateId || "");
      setInstitution(participant.institution || "");
      setErrorMsg(null);
    }
  }, [participant]);

  if (!isOpen || !participant) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg("Participant full name is required.");
      return;
    }
    if (name.trim().length < 2) {
      setErrorMsg("Full name must be at least 2 characters.");
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);

      const res = await updateParticipantByAdminAction({
        userId: participant.id,
        name: name.trim(),
        candidateId: candidateId.trim() || null,
        institution: institution.trim() || null,
      });

      if (res.success && res.user) {
        onSuccess?.(res.user);
        onClose();
      } else {
        setErrorMsg(res.error || "Failed to update participant profile.");
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Network error updating participant");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        className="bg-surface-container-lowest max-w-md w-full rounded-xl border border-[#e2e8f0] shadow-2xl p-6 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-[#e2e8f0]">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-primary-container">manage_accounts</span>
            <h3 className="font-headline-sm font-semibold text-on-surface">Manage Participant Profile</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="text-secondary hover:text-on-surface font-bold text-lg p-1 rounded transition-colors cursor-pointer"
          >
            ×
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-xs flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px] shrink-0">error</span>
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          {/* Read-Only Identity Strip */}
          <div className="p-3 rounded-lg bg-surface-container-low border border-[#e2e8f0] flex flex-col gap-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-secondary font-medium">Account Email:</span>
              <span className="text-on-surface font-mono font-medium">{participant.email}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-secondary font-medium">Security Role:</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                {participant.role}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-secondary font-medium">Cohort:</span>
              <span className="text-on-surface">{participant.cohortName || "Standard Cohort"}</span>
            </div>
            <p className="text-[10px] text-secondary mt-1 pt-1 border-t border-[#f1f5f9]">
              Email, credentials, and role permissions are protected and cannot be altered through profile management.
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
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Candidate full name"
              className="w-full px-3 py-2 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface font-label-md"
            />
          </div>

          {/* Candidate ID */}
          <div>
            <label className="font-label-xs text-secondary font-semibold uppercase block mb-1">
              Candidate Code / ID
            </label>
            <input
              type="text"
              value={candidateId}
              onChange={(e) => setCandidateId(e.target.value)}
              placeholder="e.g., CL0101"
              className="w-full px-3 py-2 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface font-label-md font-mono text-sm"
            />
            <p className="text-[11px] text-secondary mt-0.5">
              Unique institutional assessment identification code.
            </p>
          </div>

          {/* Institution / Affiliation */}
          <div>
            <label className="font-label-xs text-secondary font-semibold uppercase block mb-1">
              Affiliation / Institution
            </label>
            <input
              type="text"
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
              placeholder="e.g., Dhaka University / Sales Cluster"
              className="w-full px-3 py-2 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface font-label-md"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#e2e8f0] mt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded bg-surface-container-high text-on-surface font-label-md font-medium hover:bg-surface-container transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded bg-primary-container text-on-primary font-label-md font-semibold hover:opacity-95 transition-opacity cursor-pointer flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[16px]">check</span>
                  <span>Save Profile</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

