"use client";

import React, { useState, useEffect } from "react";
import { updatePhaseAction, type UpdatePhaseInput } from "@/app/actions/task-builder-actions";

export interface EditPhaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  phase: {
    id: string;
    contestId: string;
    phaseNumber: number;
    title: string;
    description?: string | null;
    weightPercentage?: number;
    deadline?: string | Date;
    durationMinutes?: number | null;
    status?: "UPCOMING" | "OPEN" | "EVALUATING" | "CLOSED" | string;
  } | null;
}

export function EditPhaseModal({ isOpen, onClose, onSuccess, phase }: EditPhaseModalProps) {
  const [title, setTitle] = useState("");
  const [phaseNumber, setPhaseNumber] = useState<number>(1);
  const [description, setDescription] = useState("");
  const [weightPercentage, setWeightPercentage] = useState<number>(100);
  const [deadline, setDeadline] = useState("");
  const [durationMinutes, setDurationMinutes] = useState<number | null>(null);
  const [status, setStatus] = useState<"UPCOMING" | "OPEN" | "EVALUATING" | "CLOSED">("OPEN");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (phase) {
      setTitle(phase.title || "");
      setPhaseNumber(phase.phaseNumber || 1);
      setDescription(phase.description || "");
      setWeightPercentage(phase.weightPercentage !== undefined ? Number(phase.weightPercentage) : 100);
      setDurationMinutes(phase.durationMinutes ?? null);
      setStatus((phase.status as "UPCOMING" | "OPEN" | "EVALUATING" | "CLOSED") || "OPEN");

      if (phase.deadline) {
        try {
          const d = new Date(phase.deadline);
          const isoDhaka = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Dhaka",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }).formatToParts(d);
          const getP = (t: string) => isoDhaka.find((p) => p.type === t)?.value || "";
          setDeadline(`${getP("year")}-${getP("month")}-${getP("day")}T${getP("hour")}:${getP("minute")}`);
        } catch {
          setDeadline("");
        }
      } else {
        setDeadline("");
      }
      setErrorMsg(null);
    }
  }, [phase]);

  if (!isOpen || !phase) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg("Phase title is required.");
      return;
    }
    if (title.trim().length < 2) {
      setErrorMsg("Phase title must be at least 2 characters.");
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);

      const payload: UpdatePhaseInput = {
        phaseId: phase.id,
        title: title.trim(),
        description: description.trim() || null,
        phaseNumber: Number(phaseNumber),
        weightPercentage: Number(weightPercentage),
        durationMinutes: durationMinutes !== null && durationMinutes > 0 ? Number(durationMinutes) : null,
        status,
      };

      if (deadline) {
        payload.deadline = deadline;
      }

      const res = await updatePhaseAction(payload);
      if (res.success) {
        onSuccess?.();
        onClose();
      } else {
        setErrorMsg(res.error || "Failed to update phase.");
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Network error updating phase");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        className="bg-surface-container-lowest max-w-lg w-full rounded-xl border border-[#e2e8f0] shadow-2xl p-6 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-[#e2e8f0]">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-primary-container">edit_note</span>
            <h3 className="font-headline-sm font-semibold text-on-surface">Edit Assessment Phase</h3>
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
          {/* Phase Number & Title */}
          <div className="grid grid-cols-4 gap-3">
            <div className="col-span-1">
              <label className="font-label-xs text-secondary font-semibold uppercase block mb-1">
                Stage # *
              </label>
              <input
                type="number"
                min="1"
                max="99"
                required
                value={phaseNumber}
                onChange={(e) => setPhaseNumber(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface font-label-md"
              />
            </div>
            <div className="col-span-3">
              <label className="font-label-xs text-secondary font-semibold uppercase block mb-1">
                Phase Title *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Executive Strategy & Synthesis"
                className="w-full px-3 py-2 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface font-label-md"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="font-label-xs text-secondary font-semibold uppercase block mb-1">
              Phase Description
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief instructions or summary of this curriculum phase..."
              className="w-full px-3 py-2 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface font-label-md resize-none"
            />
          </div>

          {/* Weight & Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-label-xs text-secondary font-semibold uppercase block mb-1">
                Weight Percentage (%) *
              </label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                required
                value={weightPercentage}
                onChange={(e) => setWeightPercentage(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface font-label-md"
              />
            </div>
            <div>
              <label className="font-label-xs text-secondary font-semibold uppercase block mb-1">
                Stage Status *
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full px-3 py-2 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface font-label-md"
              >
                <option value="UPCOMING">UPCOMING</option>
                <option value="OPEN">OPEN (Active)</option>
                <option value="EVALUATING">EVALUATING</option>
                <option value="CLOSED">CLOSED</option>
              </select>
            </div>
          </div>

          {/* Phase Attempt Duration */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-label-xs text-secondary font-semibold uppercase">
                Phase Attempt Duration (Minutes)
              </label>
              {durationMinutes !== null && durationMinutes > 0 ? (
                <button
                  type="button"
                  onClick={() => setDurationMinutes(null)}
                  className="text-[11px] text-error hover:underline cursor-pointer"
                >
                  Disable limit (unlimited)
                </button>
              ) : (
                <span className="text-[11px] text-secondary">Unlimited (Phase calendar deadline only)</span>
              )}
            </div>
            <input
              type="number"
              min="1"
              max="1440"
              value={durationMinutes ?? ""}
              onChange={(e) => setDurationMinutes(e.target.value ? Number(e.target.value) : null)}
              placeholder="e.g. 40, 60, 90 (blank for no phase attempt limit)"
              className="w-full px-3 py-2 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface font-label-md"
            />
            <p className="text-[11px] text-secondary mt-1">
              When set, countdown starts individually when participant starts this phase. Bounded by phase calendar deadline and contest end date.
            </p>
          </div>

          {/* Deadline */}
          <div>
            <label className="font-label-xs text-secondary font-semibold uppercase block mb-1">
              Phase Deadline (Asia/Dhaka UTC+06:00)
            </label>
            <input
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full px-3 py-2 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface font-label-md"
            />
            <p className="text-[11px] text-secondary mt-1">
              Preserves all tasks, questions, participant submissions, and verified grades.
            </p>
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
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
