"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  previewParticipantImportCsvAction,
  executeParticipantImportAction,
  type ParticipantImportPreviewResult,
  type ExecuteParticipantImportResult,
} from "@/app/actions/participant-actions";

export interface ImportParticipantsModalProps {
  isOpen: boolean;
  contests: Array<{ id: string; title: string; status: string }>;
  defaultContestId?: string;
  onClose: () => void;
  onImportComplete: () => Promise<void> | void;
}

type ModalStep = "INPUT" | "PREVIEW" | "RESULT";

export function ImportParticipantsModal({
  isOpen,
  contests,
  defaultContestId,
  onClose,
  onImportComplete,
}: ImportParticipantsModalProps) {
  const [step, setStep] = useState<ModalStep>("INPUT");
  const [csvText, setCsvText] = useState("");
  const [selectedContestId, setSelectedContestId] = useState("");
  const [enrollExistingAccounts, setEnrollExistingAccounts] = useState(true);
  const [fileName, setFileName] = useState<string | null>(null);

  const [isValidating, setIsValidating] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [previewResult, setPreviewResult] = useState<ParticipantImportPreviewResult | null>(null);
  const [executionResult, setExecutionResult] = useState<ExecuteParticipantImportResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Set default contest selection on open
  useEffect(() => {
    if (isOpen) {
      setStep("INPUT");
      setErrorMessage(null);
      setPreviewResult(null);
      setExecutionResult(null);

      if (defaultContestId) {
        setSelectedContestId(defaultContestId);
      } else if (contests.length > 0) {
        // Look for CL Sales Assessment or active contest
        const clContest = contests.find(
          (c) =>
            c.title.toLowerCase().includes("cl sales") ||
            c.status === "LIVE" ||
            c.status === "DRAFT"
        );
        setSelectedContestId(clContest ? clContest.id : contests[0].id);
      }
    }
  }, [isOpen, defaultContestId, contests]);

  if (!isOpen) return null;

  const handleDownloadTemplate = () => {
    const csvContent =
      "Name,Email,Password,Team Number\n" +
      "K. M. Shajin,kmshajin.bd@gmail.com,CL0103,Team 1\n" +
      "Sk Ishraaq Arefin,ishraaqarefin@gmail.com,CL0111,Team 1\n" +
      "Ahmad Fahim Shahriar,Fahim.eee.00724105131005@aust.edu,CL0101,Team 1\n" +
      "Khatune Jannat Bonna,khatunejannatb@gmail.com,CL0121,Team 1\n";

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "cl_participant_roster_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setErrorMessage(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvText(text || "");
    };
    reader.onerror = () => {
      setErrorMessage("Failed to read the selected CSV file.");
    };
    reader.readAsText(file);
  };

  const handleValidateAndPreview = async () => {
    if (!csvText.trim()) {
      setErrorMessage("Please select a CSV file or paste CSV content.");
      return;
    }

    try {
      setIsValidating(true);
      setErrorMessage(null);

      const res = await previewParticipantImportCsvAction(
        csvText,
        selectedContestId || undefined
      );

      if (!res.success) {
        setErrorMessage(res.error || "Failed to validate CSV structure.");
        return;
      }

      setPreviewResult(res);
      setStep("PREVIEW");
    } catch (err) {
      console.error("Preview validation error:", err);
      setErrorMessage(
        err instanceof Error ? err.message : "An unexpected error occurred during CSV validation."
      );
    } finally {
      setIsValidating(false);
    }
  };

  const handleExecuteImport = async () => {
    if (!csvText.trim()) {
      setErrorMessage("Missing CSV content.");
      return;
    }

    try {
      setIsExecuting(true);
      setErrorMessage(null);

      const res = await executeParticipantImportAction({
        csvText,
        contestId: selectedContestId || undefined,
        enrollExistingAccounts,
      });

      setExecutionResult(res);
      setStep("RESULT");

      if (res.createdCount > 0 || res.enrolledCount > 0) {
        await onImportComplete();
      }
    } catch (err) {
      console.error("Import execution error:", err);
      setErrorMessage(
        err instanceof Error ? err.message : "An unexpected server error occurred during import."
      );
    } finally {
      setIsExecuting(false);
    }
  };

  const handleCloseAndRefresh = async () => {
    if (executionResult && (executionResult.createdCount > 0 || executionResult.enrolledCount > 0)) {
      await onImportComplete();
    }
    onClose();
  };

  const selectedContest = contests.find((c) => c.id === selectedContestId);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-surface-container-lowest max-w-4xl w-full rounded-xl border border-[#e2e8f0] shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e2e8f0] bg-surface-container-low/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary-container/10 border border-primary-container/20 flex items-center justify-center text-primary-container">
              <span className="material-symbols-outlined text-[24px]">group_add</span>
            </div>
            <div>
              <h2 className="font-headline-sm text-on-surface font-semibold">
                Import Participants (CSV)
              </h2>
              <p className="font-label-xs text-secondary">
                {step === "INPUT" && "Upload candidate roster with teams and initial credentials"}
                {step === "PREVIEW" && "Review pre-flight validation before committing to database"}
                {step === "RESULT" && "Import summary and account provisioning report"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Step Indicators */}
            <div className="hidden sm:flex items-center gap-1.5 text-xs font-label-xs">
              <span
                className={`px-2 py-0.5 rounded font-medium ${
                  step === "INPUT"
                    ? "bg-primary-container text-on-primary font-semibold"
                    : "bg-surface-container text-secondary"
                }`}
              >
                1. Upload
              </span>
              <span className="text-secondary/50">›</span>
              <span
                className={`px-2 py-0.5 rounded font-medium ${
                  step === "PREVIEW"
                    ? "bg-primary-container text-on-primary font-semibold"
                    : "bg-surface-container text-secondary"
                }`}
              >
                2. Preview
              </span>
              <span className="text-secondary/50">›</span>
              <span
                className={`px-2 py-0.5 rounded font-medium ${
                  step === "RESULT"
                    ? "bg-primary-container text-on-primary font-semibold"
                    : "bg-surface-container text-secondary"
                }`}
              >
                3. Result
              </span>
            </div>

            <button
              onClick={handleCloseAndRefresh}
              className="text-secondary hover:text-on-surface p-1 rounded hover:bg-surface-container cursor-pointer transition-colors"
              title="Close"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </div>

        {/* Global Error Banner */}
        {errorMessage && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-2.5">
            <span className="material-symbols-outlined text-[18px] text-red-600 shrink-0 mt-0.5">
              error
            </span>
            <div className="flex-1 font-body-sm leading-relaxed">{errorMessage}</div>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* STEP 1: INPUT */}
          {step === "INPUT" && (
            <div className="space-y-5">
              {/* Context banner */}
              <div className="p-3.5 rounded-lg bg-blue-50/70 border border-blue-200/80 text-blue-900 text-xs flex items-start gap-3">
                <span className="material-symbols-outlined text-[20px] text-blue-600 shrink-0 mt-0.5">
                  info
                </span>
                <div className="space-y-1">
                  <div className="font-semibold text-blue-950">
                    Required CSV Header Format:
                  </div>
                  <code className="text-blue-800 font-mono text-[11px] block bg-white/70 px-2 py-1 rounded border border-blue-200">
                    Name,Email,Password,Team Number
                  </code>
                  <p className="text-[11px] text-blue-800">
                    • <strong>Password:</strong> Initial participant passcode (e.g. 6-character CL code like <code>CL0103</code>). Participants must change it on first login.
                    <br />
                    • <strong>Team Number:</strong> Cohort team grouping (e.g. <code>Team 1</code> through <code>Team 8</code>), stored with the participant profile.
                  </p>
                </div>
              </div>

              {/* Contest Selector */}
              <div>
                <label className="font-label-xs uppercase text-secondary font-semibold block mb-1.5">
                  Contest Enrollment (Optional)
                </label>
                <select
                  value={selectedContestId}
                  onChange={(e) => setSelectedContestId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-surface-container-low border border-[#e2e8f0] text-on-surface focus:outline-none focus:border-primary-container focus:ring-1 focus:ring-primary-container"
                >
                  <option value="">-- Do not enroll in contest (Account creation only) --</option>
                  {contests.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title} [{c.status}]
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-secondary mt-1">
                  {selectedContestId
                    ? `Participants will be created and automatically enrolled into "${selectedContest?.title}".`
                    : "Participants will be created without enrolling into any contest."}
                </p>
              </div>

              {/* File Upload Section */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-label-xs uppercase text-secondary font-semibold">
                    Upload Roster File (.CSV)
                  </label>
                  <button
                    type="button"
                    onClick={handleDownloadTemplate}
                    className="text-primary-container hover:underline text-xs font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[15px]">download</span>
                    <span>Download CSV Template</span>
                  </button>
                </div>

                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-[#cbd5e1] hover:border-primary-container rounded-lg p-5 text-center cursor-pointer bg-surface-container-lowest hover:bg-surface-container-low/30 transition-colors"
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".csv,text/csv"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <div className="flex flex-col items-center gap-2">
                    <span className="material-symbols-outlined text-[32px] text-primary-container">
                      upload_file
                    </span>
                    <div className="text-xs">
                      {fileName ? (
                        <span className="font-semibold text-primary-container">
                          Selected file: {fileName}
                        </span>
                      ) : (
                        <>
                          <span className="font-medium text-on-surface">
                            Click to select CSV file
                          </span>{" "}
                          <span className="text-secondary">or drag and drop</span>
                        </>
                      )}
                    </div>
                    <span className="text-[11px] text-secondary">
                      Accepts standard RFC-4180 comma-separated values (.csv)
                    </span>
                  </div>
                </div>
              </div>

              {/* Paste Textarea */}
              <div>
                <label className="font-label-xs uppercase text-secondary font-semibold block mb-1.5">
                  Or Paste CSV Text Directly
                </label>
                <textarea
                  rows={6}
                  value={csvText}
                  onChange={(e) => {
                    setCsvText(e.target.value);
                    setFileName(null);
                    setErrorMessage(null);
                  }}
                  placeholder={
                    "Name,Email,Password,Team Number\n" +
                    "K. M. Shajin,kmshajin.bd@gmail.com,CL0103,Team 1\n" +
                    "Sk Ishraaq Arefin,ishraaqarefin@gmail.com,CL0111,Team 1"
                  }
                  className="w-full px-3 py-2 font-mono text-xs rounded-lg bg-surface-container-low border border-[#e2e8f0] text-on-surface focus:outline-none focus:border-primary-container focus:ring-1 focus:ring-primary-container"
                />
              </div>
            </div>
          )}

          {/* STEP 2: PREVIEW */}
          {step === "PREVIEW" && previewResult && (
            <div className="space-y-4">
              {/* Summary Stats Badges */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                <div className="p-2.5 rounded-lg border bg-surface-container-low border-[#e2e8f0]">
                  <div className="text-secondary font-label-xs uppercase">Total Rows</div>
                  <div className="text-lg font-bold text-on-surface">
                    {previewResult.totalRows}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg border bg-emerald-50/60 border-emerald-200">
                  <div className="text-emerald-700 font-label-xs uppercase font-semibold">
                    Ready to Create
                  </div>
                  <div className="text-lg font-bold text-emerald-800">
                    {previewResult.readyCount}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg border bg-sky-50/60 border-sky-200">
                  <div className="text-sky-700 font-label-xs uppercase font-semibold">
                    Existing Accounts
                  </div>
                  <div className="text-lg font-bold text-sky-800">
                    {previewResult.alreadyExistsCount}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg border bg-indigo-50/60 border-indigo-200">
                  <div className="text-indigo-700 font-label-xs uppercase font-semibold">
                    Already Enrolled
                  </div>
                  <div className="text-lg font-bold text-indigo-800">
                    {previewResult.alreadyEnrolledCount}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg border bg-rose-50/60 border-rose-200 col-span-2 sm:col-span-1">
                  <div className="text-rose-700 font-label-xs uppercase font-semibold">
                    Issues / Invalid
                  </div>
                  <div className="text-lg font-bold text-rose-800">
                    {previewResult.invalidCount + previewResult.duplicateInFileCount}
                  </div>
                </div>
              </div>

              {/* Enroll Existing Accounts Option */}
              {selectedContestId && previewResult.alreadyExistsCount > 0 && (
                <div className="p-3 rounded-lg bg-sky-50 border border-sky-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="enrollExistingCheckbox"
                      checked={enrollExistingAccounts}
                      onChange={(e) => setEnrollExistingAccounts(e.target.checked)}
                      className="rounded border-[#cbd5e1] text-primary-container focus:ring-primary-container cursor-pointer w-4 h-4"
                    />
                    <label
                      htmlFor="enrollExistingCheckbox"
                      className="text-xs font-semibold text-sky-950 cursor-pointer"
                    >
                      Also enroll {previewResult.alreadyExistsCount} existing participant account(s) into &ldquo;{previewResult.contestTitle || selectedContest?.title}&rdquo;
                    </label>
                  </div>
                </div>
              )}

              {/* Security notice */}
              <div className="p-3 rounded-lg bg-amber-50/80 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-amber-700 shrink-0">
                  lock
                </span>
                <span>
                  Passwords are never displayed. Each candidate&apos;s initial passcode will be cryptographically hashed with Scrypt and salt, with mandatory password reset required on first login.
                </span>
              </div>

              {/* Preview Table */}
              <div className="border border-[#e2e8f0] rounded-lg overflow-hidden max-h-80 overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-surface-container-low text-secondary font-label-xs uppercase sticky top-0 z-10 border-b border-[#e2e8f0]">
                    <tr>
                      <th className="py-2 px-3 font-semibold w-12">#</th>
                      <th className="py-2 px-3 font-semibold">Name</th>
                      <th className="py-2 px-3 font-semibold">Email</th>
                      <th className="py-2 px-3 font-semibold">CL Code / ID</th>
                      <th className="py-2 px-3 font-semibold">Team</th>
                      <th className="py-2 px-3 font-semibold">Status</th>
                      <th className="py-2 px-3 font-semibold">Validation Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e2e8f0] font-body-sm text-on-surface">
                    {previewResult.previewRows.map((row) => {
                      let badgeClass = "bg-gray-100 text-gray-700";
                      let badgeText: string = row.status;

                      if (row.status === "READY") {
                        badgeClass = "bg-emerald-100 text-emerald-800 font-semibold";
                        badgeText = "Ready";
                      } else if (row.status === "ALREADY_EXISTS") {
                        badgeClass = "bg-sky-100 text-sky-800 font-semibold";
                        badgeText = "Exists";
                      } else if (row.status === "ALREADY_ENROLLED") {
                        badgeClass = "bg-indigo-100 text-indigo-800 font-semibold";
                        badgeText = "Enrolled";
                      } else if (row.status === "DUPLICATE_IN_FILE") {
                        badgeClass = "bg-amber-100 text-amber-800 font-semibold";
                        badgeText = "Duplicate";
                      } else if (row.status === "INVALID") {
                        badgeClass = "bg-rose-100 text-rose-800 font-semibold";
                        badgeText = "Invalid";
                      }

                      return (
                        <tr
                          key={row.rowNumber}
                          className={row.status === "INVALID" ? "bg-rose-50/30" : ""}
                        >
                          <td className="py-2 px-3 text-secondary">{row.rowNumber}</td>
                          <td className="py-2 px-3 font-medium">{row.name || "—"}</td>
                          <td className="py-2 px-3 font-mono text-[11px]">{row.email || "—"}</td>
                          <td className="py-2 px-3 font-mono text-[11px]">
                            {row.candidateId || "—"}
                          </td>
                          <td className="py-2 px-3">{row.teamNumber || "—"}</td>
                          <td className="py-2 px-3">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[10px] uppercase tracking-wide ${badgeClass}`}
                            >
                              {badgeText}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-secondary text-[11px]">
                            {row.reason || "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* STEP 3: RESULT */}
          {step === "RESULT" && executionResult && (
            <div className="space-y-4">
              {/* Outcome Banner */}
              <div
                className={`p-4 rounded-xl border flex items-start gap-3 ${
                  executionResult.failedCount === 0 && executionResult.partialErrorCount === 0
                    ? "bg-emerald-50 border-emerald-200 text-emerald-950"
                    : "bg-amber-50 border-amber-200 text-amber-950"
                }`}
              >
                <span
                  className={`material-symbols-outlined text-[24px] shrink-0 mt-0.5 ${
                    executionResult.failedCount === 0 && executionResult.partialErrorCount === 0
                      ? "text-emerald-600"
                      : "text-amber-600"
                  }`}
                >
                  {executionResult.failedCount === 0 && executionResult.partialErrorCount === 0
                    ? "check_circle"
                    : "warning"}
                </span>
                <div className="space-y-1">
                  <h3 className="font-headline-sm font-semibold text-sm">
                    {executionResult.failedCount === 0 && executionResult.partialErrorCount === 0
                      ? "Bulk Import Completed Successfully"
                      : "Bulk Import Finished with Warnings or Failures"}
                  </h3>
                  <p className="text-xs">
                    {executionResult.createdCount} new account(s) created,{" "}
                    {executionResult.enrolledCount} participant(s) enrolled into contest,{" "}
                    {executionResult.skippedCount} skipped, {executionResult.failedCount} failed.
                  </p>
                </div>
              </div>

              {/* Metric Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-3 rounded-lg border bg-emerald-50/50 border-emerald-200 text-emerald-900">
                  <div className="font-label-xs uppercase">Accounts Created</div>
                  <div className="text-xl font-bold">{executionResult.createdCount}</div>
                </div>
                <div className="p-3 rounded-lg border bg-sky-50/50 border-sky-200 text-sky-900">
                  <div className="font-label-xs uppercase">Contest Enrolled</div>
                  <div className="text-xl font-bold">{executionResult.enrolledCount}</div>
                </div>
                <div className="p-3 rounded-lg border bg-surface-container-low border-[#e2e8f0] text-secondary">
                  <div className="font-label-xs uppercase">Skipped</div>
                  <div className="text-xl font-bold text-on-surface">
                    {executionResult.skippedCount}
                  </div>
                </div>
                <div className="p-3 rounded-lg border bg-rose-50/50 border-rose-200 text-rose-900">
                  <div className="font-label-xs uppercase">Failed / Errors</div>
                  <div className="text-xl font-bold">
                    {executionResult.failedCount + executionResult.partialErrorCount}
                  </div>
                </div>
              </div>

              {/* Execution Details Log */}
              <div className="border border-[#e2e8f0] rounded-lg overflow-hidden max-h-80 overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-surface-container-low text-secondary font-label-xs uppercase sticky top-0 z-10 border-b border-[#e2e8f0]">
                    <tr>
                      <th className="py-2 px-3 font-semibold w-12">#</th>
                      <th className="py-2 px-3 font-semibold">Candidate</th>
                      <th className="py-2 px-3 font-semibold">Email</th>
                      <th className="py-2 px-3 font-semibold">Team</th>
                      <th className="py-2 px-3 font-semibold">Status</th>
                      <th className="py-2 px-3 font-semibold">Result Message</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e2e8f0] font-body-sm text-on-surface">
                    {executionResult.details.map((item) => (
                      <tr
                        key={item.rowNumber}
                        className={
                          item.status === "FAILED"
                            ? "bg-rose-50/30"
                            : item.status === "PARTIAL_ERROR"
                            ? "bg-amber-50/30"
                            : ""
                        }
                      >
                        <td className="py-2 px-3 text-secondary">{item.rowNumber}</td>
                        <td className="py-2 px-3 font-medium">{item.name || "—"}</td>
                        <td className="py-2 px-3 font-mono text-[11px]">{item.email}</td>
                        <td className="py-2 px-3">{item.teamNumber || "—"}</td>
                        <td className="py-2 px-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                              item.status === "CREATED_AND_ENROLLED"
                                ? "bg-emerald-100 text-emerald-800"
                                : item.status === "CREATED"
                                ? "bg-emerald-100 text-emerald-800"
                                : item.status === "ENROLLED_EXISTING"
                                ? "bg-sky-100 text-sky-800"
                                : item.status === "SKIPPED_EXISTING"
                                ? "bg-gray-100 text-gray-700"
                                : item.status === "PARTIAL_ERROR"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-rose-100 text-rose-800"
                            }`}
                          >
                            {item.status.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-secondary text-[11px]">
                          {item.message}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Modal Actions Footer */}
        <div className="px-6 py-4 border-t border-[#e2e8f0] bg-surface-container-low/40 flex items-center justify-between">
          <div>
            {step === "PREVIEW" && (
              <button
                type="button"
                onClick={() => setStep("INPUT")}
                disabled={isExecuting}
                className="px-3.5 py-1.5 rounded-lg border border-[#cbd5e1] hover:bg-surface-container text-on-surface text-xs font-semibold cursor-pointer transition-colors"
              >
                ← Back to Edit
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {step === "INPUT" && (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg border border-[#cbd5e1] hover:bg-surface-container text-on-surface text-xs font-semibold cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleValidateAndPreview}
                  disabled={isValidating || !csvText.trim()}
                  className="px-4 py-2 rounded-lg bg-primary-container hover:bg-[#166534] disabled:opacity-50 text-on-primary text-xs font-semibold shadow-2xs flex items-center gap-2 cursor-pointer transition-colors"
                >
                  {isValidating && (
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  )}
                  <span>Continue to Preview</span>
                  <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                </button>
              </>
            )}

            {step === "PREVIEW" && previewResult && (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isExecuting}
                  className="px-4 py-2 rounded-lg border border-[#cbd5e1] hover:bg-surface-container text-on-surface text-xs font-semibold cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExecuteImport}
                  disabled={
                    isExecuting ||
                    (previewResult.readyCount === 0 &&
                      (!enrollExistingAccounts || previewResult.alreadyExistsCount === 0))
                  }
                  className="px-4 py-2 rounded-lg bg-primary-container hover:bg-[#166534] disabled:opacity-50 text-on-primary text-xs font-semibold shadow-2xs flex items-center gap-2 cursor-pointer transition-colors"
                >
                  {isExecuting && (
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  )}
                  <span className="material-symbols-outlined text-[16px]">how_to_reg</span>
                  <span>
                    Confirm &amp; Import (
                    {previewResult.readyCount +
                      (enrollExistingAccounts ? previewResult.alreadyExistsCount : 0)}{" "}
                    Participants)
                  </span>
                </button>
              </>
            )}

            {step === "RESULT" && (
              <button
                type="button"
                onClick={handleCloseAndRefresh}
                className="px-5 py-2 rounded-lg bg-primary-container hover:bg-[#166534] text-on-primary text-xs font-semibold shadow-2xs flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">done_all</span>
                <span>Done &amp; Close</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
