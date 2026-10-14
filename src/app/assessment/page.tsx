"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { ParticipantHeader } from "@/components/layout/participant-header";
import { ParticipantFooter } from "@/components/layout/participant-footer";

export default function AssessmentInterfacePage() {
  // Timer state
  const [secondsLeft, setSecondsLeft] = useState(84 * 60 + 10); // 01:24:10
  const [selectedOption, setSelectedOption] = useState<string>("B");
  const [writtenResponse, setWrittenResponse] = useState<string>(
    "Our transformation strategy initiates with an intensive Q1 baseline validation across all 42 direct-fired campus thermal heating boilers and 38 service utility trucks. We will deploy IoT sub-metering nodes connected to an open campus telemetry dashboard to isolate heat exchange leakage and optimize automated nocturnal setbacks..."
  );
  const [lastSaved, setLastSaved] = useState<string>("14:32:04");
  const [uploadedFile, setUploadedFile] = useState<{
    name: string;
    size: string;
    time: string;
    hash: string;
  } | null>({
    name: "Sample_Campus_ESG_PitchDeck_vFinal.pdf",
    size: "4.8 MB",
    time: "14:18:22",
    hash: "SHA-256 Verified (Mock)",
  });
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [readerModalOpen, setReaderModalOpen] = useState(false);

  // Live timer tick
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Format timer
  const formatTimer = (totalSecs: number) => {
    const hrs = String(Math.floor(totalSecs / 3600)).padStart(2, "0");
    const mins = String(Math.floor((totalSecs % 3600) / 60)).padStart(2, "0");
    const secs = String(totalSecs % 60).padStart(2, "0");
    return `${hrs}:${mins}:${secs}`;
  };

  // Word count calculation
  const words = writtenResponse.trim().length === 0
    ? 0
    : writtenResponse.trim().split(/\s+/).length;
  const wordPercent = Math.min(100, Math.round((words / 300) * 100));

  const handleManualSave = () => {
    const now = new Date();
    const timeStr = now.toTimeString().split(" ")[0];
    setLastSaved(timeStr);
    alert(`[Demo Mode] Draft saved locally at ${timeStr}. (Database persistence will connect in Stage 2).`);
  };

  const handleFinalSubmit = () => {
    setIsSubmitModalOpen(false);
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col justify-between">
      <ParticipantHeader />

      <main className="w-full pt-16 bg-surface min-h-[calc(100vh-80px)] pb-32">
        {/* Sticky Sub-Header with Diagnostic Progress */}
        <div className="sticky top-16 z-40 w-full bg-surface-container-lowest/95 backdrop-blur-md border-b border-[#e2e8f0] shadow-2xs">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-col">
              <span className="font-label-xs uppercase tracking-wider text-secondary flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary-container"></span>
                [Sample Benchmark] Campus Innovation Challenge 2025 · Stage 2
              </span>
              <h1 className="font-headline-sm text-on-surface mt-0.5 font-semibold">
                Task 2.1: Campus ESG Transformation Strategy
              </h1>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container text-on-surface font-label-sm border border-[#e2e8f0] shadow-2xs">
                <span className="material-symbols-outlined text-[16px] text-secondary">
                  schedule
                </span>
                <span className="font-mono text-on-surface font-medium tabular-nums">
                  {formatTimer(secondsLeft)}
                </span>
              </div>
              <div className="px-3 py-1.5 rounded-full bg-on-tertiary-container text-primary-container font-label-sm font-semibold">
                Question 2 of 4 · 50%
              </div>
            </div>
          </div>

          {/* Linear Progress Bar */}
          <div className="w-full h-1 bg-surface-container-high overflow-hidden">
            <div
              className="h-full bg-primary-container transition-all duration-300 ease-out"
              style={{ width: "50%" }}
            ></div>
          </div>
        </div>

        {/* Primary Reading Container */}
        <div className="w-full max-w-[820px] mx-auto px-4 sm:px-6 pt-8 flex flex-col gap-6">
          {/* Submission Banner (if submitted) */}
          {submitted && (
            <div className="p-space-lg rounded-lg bg-on-tertiary-container border border-primary-container text-primary-container flex items-start gap-space-md">
              <span className="material-symbols-outlined text-[24px]">verified</span>
              <div>
                <h3 className="font-headline-sm font-semibold">
                  Task 2.1 Mock Submission Completed
                </h3>
                <p className="font-body-sm text-on-surface-variant mt-0.5">
                  Your simulated diagnostic responses and pitch deck were timestamped at {lastSaved} and
                  locked. Server-side verification and database storage will be connected in Stage 2.
                </p>
                <Link
                  href="/dashboard"
                  className="mt-3 inline-block font-label-sm underline font-semibold"
                >
                  Return to Candidate Dashboard →
                </Link>
              </div>
            </div>
          )}

          {/* Diagnostic Context Overview Banner */}
          <div className="bg-surface-container-lowest p-6 rounded-lg border border-[#e2e8f0] shadow-2xs relative overflow-hidden flex flex-col sm:flex-row gap-5 items-start sm:items-center justify-between">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-lg bg-on-tertiary-container border border-[#e2e8f0] flex items-center justify-center shrink-0 text-primary-container">
                <span className="material-symbols-outlined text-2xl">verified_user</span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-label-xs px-2 py-0.5 rounded-full bg-on-tertiary-container text-primary-container uppercase font-semibold tracking-wider">
                    Secure Assessment Protocol (Mock)
                  </span>
                  <span className="font-label-xs text-secondary">• Session #DEMO-9942</span>
                </div>
                <p className="font-headline-sm text-on-surface mt-1">
                  Institutional Energy Decarbonization Module (Sample Task)
                </p>
                <p className="font-body-sm text-secondary mt-0.5">
                  Demonstration of diagnostic benchmark question flow conforming to standardized enterprise sustainability criteria.
                </p>
              </div>
            </div>
            <div className="hidden lg:flex flex-col items-end shrink-0 pl-4 border-l border-[#e2e8f0]">
              <span className="font-label-xs text-secondary uppercase font-medium">
                Stage Weight
              </span>
              <span className="font-headline-md text-primary-container font-semibold tabular-nums">
                35%
              </span>
            </div>
          </div>

          {/* Question 1: Multiple Choice Question */}
          <div className="bg-surface-container-lowest p-6 sm:p-8 rounded-lg border border-[#e2e8f0] shadow-2xs flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded bg-surface-container-high font-label-xs text-on-surface font-semibold tracking-wide uppercase border border-[#e2e8f0]">
                  Question 01
                </span>
                <span className="font-label-xs text-error font-medium flex items-center gap-1">
                  <span className="w-1 h-1 rounded-full bg-error"></span> Mandatory
                </span>
              </div>
              <span className="font-label-sm text-secondary font-medium">10 Points</span>
            </div>

            <div>
              <h2 className="font-headline-sm text-on-surface font-semibold">
                Which metric represents Scope 1 emissions in university sustainability reporting?
              </h2>
              <p className="font-body-sm text-secondary mt-1">
                Select the single emission boundary definition conforming strictly to GHG Protocol standards.
              </p>
            </div>

            {/* Multiple Choice Options */}
            <div className="flex flex-col gap-3" role="radiogroup" aria-label="Question 1 choices">
              {[
                {
                  id: "A",
                  label: "A.",
                  text: "Purchased campus electricity & high-voltage grid transmission",
                  scope: "Scope 2",
                },
                {
                  id: "B",
                  label: "B.",
                  text: "Direct fuel combustion in campus physical plant boilers and fleet vehicles",
                  scope: "Scope 1 (Direct)",
                },
                {
                  id: "C",
                  label: "C.",
                  text: "Student and faculty daily commuting cycles and travel",
                  scope: "Scope 3",
                },
                {
                  id: "D",
                  label: "D.",
                  text: "Contracted third-party dining waste disposal and landfill diversion",
                  scope: "Scope 3",
                },
              ].map((opt) => {
                const isSelected = selectedOption === opt.id;

                return (
                  <label
                    key={opt.id}
                    onClick={() => setSelectedOption(opt.id)}
                    className={`group relative flex items-start gap-4 p-4 rounded-lg cursor-pointer transition-all border ${
                      isSelected
                        ? "bg-[#f0fdf4] border-primary-container ring-1 ring-primary-container shadow-2xs"
                        : "bg-surface-container-lowest border-[#e2e8f0] hover:bg-surface-container-low"
                    }`}
                  >
                    <input
                      type="radio"
                      name="q1_selection"
                      value={opt.id}
                      checked={isSelected}
                      onChange={() => setSelectedOption(opt.id)}
                      className="mt-0.5 w-4 h-4 text-primary-container focus:ring-primary-container accent-primary-container cursor-pointer"
                    />
                    <div className="flex-1 flex items-baseline justify-between gap-3">
                      <span
                        className={`font-body-md leading-snug ${
                          isSelected
                            ? "text-on-surface font-medium"
                            : "text-on-surface font-normal"
                        }`}
                      >
                        <strong
                          className={`mr-2 font-semibold ${
                            isSelected ? "text-primary-container" : "text-secondary"
                          }`}
                        >
                          {opt.label}
                        </strong>
                        {opt.text}
                      </span>
                      <span
                        className={`shrink-0 font-label-xs px-2 py-0.5 rounded font-medium ${
                          isSelected
                            ? "bg-primary-container/10 text-primary-container font-semibold"
                            : "text-secondary opacity-70"
                        }`}
                      >
                        {isSelected ? `Selected · ${opt.scope}` : opt.scope}
                      </span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Question 2: Executive Written Response */}
          <div className="bg-surface-container-lowest p-6 sm:p-8 rounded-lg border border-[#e2e8f0] shadow-2xs flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded bg-surface-container-high font-label-xs text-on-surface font-semibold tracking-wide uppercase border border-[#e2e8f0]">
                  Question 02
                </span>
                <span className="font-label-xs text-error font-medium flex items-center gap-1">
                  <span className="w-1 h-1 rounded-full bg-error"></span> Mandatory
                </span>
              </div>
              <span className="font-label-sm text-secondary font-medium">25 Points</span>
            </div>

            <div>
              <h2 className="font-headline-sm text-on-surface font-semibold">
                Executive Written Response
              </h2>
              <p className="font-body-md text-on-surface-variant mt-1.5 leading-relaxed">
                Provide an executive summary detailing how the campus physical plant can achieve a 40% reduction in thermal energy consumption over 18 months.
              </p>
            </div>

            {/* Editorial Textarea */}
            <div className="flex flex-col gap-2">
              <div className="relative rounded-lg bg-surface-container-low p-1 border border-[#e2e8f0] focus-within:ring-2 focus-within:ring-primary-container/20 focus-within:border-primary-container">
                <textarea
                  value={writtenResponse}
                  onChange={(e) => setWrittenResponse(e.target.value)}
                  rows={6}
                  placeholder="Type your structured executive summary here..."
                  className="w-full bg-surface-container-lowest text-on-surface font-body-md text-[14px] sm:text-[15px] leading-relaxed p-4 rounded outline-none resize-y placeholder:text-secondary/50 border border-[#e2e8f0]"
                ></textarea>
              </div>

              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 px-1 pt-1 font-label-xs text-secondary">
                <span className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[14px] text-primary-container">
                    info
                  </span>
                  Target length: 200 – 300 words
                </span>
                <div className="flex items-center gap-2">
                  <span className="inline-block w-24 h-1.5 bg-surface-container rounded-full overflow-hidden">
                    <span
                      className="block h-full bg-primary-container rounded-full transition-all duration-300"
                      style={{ width: `${wordPercent}%` }}
                    ></span>
                  </span>
                  <span className="font-mono text-on-surface font-semibold tabular-nums">
                    Current: {words} / 300 words
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Question 3: Reference Materials */}
          <div className="bg-surface-container-lowest p-6 sm:p-8 rounded-lg border border-[#e2e8f0] shadow-2xs flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded bg-surface-container-high font-label-xs text-on-surface font-semibold tracking-wide uppercase border border-[#e2e8f0]">
                  Question 03
                </span>
                <span className="font-label-xs text-secondary font-medium">Context Material</span>
              </div>
              <span className="font-label-sm text-secondary font-medium">Reference Only</span>
            </div>

            <div>
              <h2 className="font-headline-sm text-on-surface font-semibold">
                Supporting Reference Document
              </h2>
              <p className="font-body-sm text-secondary mt-1">
                Review the sample institutional energy audit baseline to substantiate your technical proposals and emission reduction models.
              </p>
            </div>

            {/* Attachment Card */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-lg bg-surface-container-low border border-[#e2e8f0] gap-4">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-10 h-10 rounded bg-error-container/60 text-error flex items-center justify-center shrink-0 border border-error/20">
                  <span className="material-symbols-outlined text-[24px]">picture_as_pdf</span>
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="font-label-md text-on-surface font-semibold truncate">
                    Sample_Case_Brief_Campus_ESG.pdf
                  </span>
                  <span className="font-label-xs text-secondary mt-0.5">
                    2.4 MB · Sample Academic Archive · Rev 3
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                <button
                  type="button"
                  onClick={() => setReaderModalOpen(true)}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-surface-container-lowest hover:bg-surface-container text-on-surface font-label-sm border border-[#e2e8f0] shadow-2xs transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px]">visibility</span>
                  Open in Reader
                </button>
                <button
                  type="button"
                  onClick={() => alert("[Demo Action] Sample reference PDF download initiated.")}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-surface-container-lowest hover:bg-surface-container text-on-surface font-label-sm border border-[#e2e8f0] shadow-2xs transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px]">download</span>
                  Download Reference
                </button>
              </div>
            </div>
          </div>

          {/* Question 4: Strategic Pitch Deck Upload */}
          <div className="bg-surface-container-lowest p-6 sm:p-8 rounded-lg border border-[#e2e8f0] shadow-2xs flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded bg-surface-container-high font-label-xs text-on-surface font-semibold tracking-wide uppercase border border-[#e2e8f0]">
                  Question 04
                </span>
                <span className="font-label-xs text-error font-medium flex items-center gap-1">
                  <span className="w-1 h-1 rounded-full bg-error"></span> Mandatory
                </span>
              </div>
              <span className="font-label-sm text-secondary font-medium">
                Max 25 MB · PDF / PPTX
              </span>
            </div>

            <div>
              <h2 className="font-headline-sm text-on-surface font-semibold">
                Upload Strategic Pitch Deck
              </h2>
              <p className="font-body-sm text-secondary mt-1">
                Submit the finalized team slide deck summarizing technical sequencing, ROI projections, and student stakeholder governance.
              </p>
            </div>

            {/* Drag & Drop Zone */}
            <div
              onClick={() => {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = ".pdf,.pptx";
                input.onchange = (e) => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  if (file) {
                    setUploadedFile({
                      name: file.name,
                      size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
                      time: new Date().toTimeString().split(" ")[0],
                      hash: "SHA-256 Verified (Mock)",
                    });
                  }
                };
                input.click();
              }}
              className="p-8 rounded-lg bg-surface-container-low/70 border-2 border-dashed border-[#cbd5e1] hover:border-primary-container flex flex-col items-center justify-center text-center cursor-pointer transition-colors"
            >
              <div className="w-12 h-12 rounded-full bg-surface-container-lowest border border-[#e2e8f0] shadow-2xs flex items-center justify-center text-primary-container mb-3">
                <span className="material-symbols-outlined text-[26px]">cloud_upload</span>
              </div>
              <p className="font-label-md text-on-surface font-medium">
                Drag and drop deck file here, or{" "}
                <span className="text-primary-container font-semibold underline underline-offset-2">
                  browse filesystem
                </span>
              </p>
              <p className="font-body-sm text-secondary mt-1">
                Supports .PDF, .PPTX (Standard 16:9 ratio recommended)
              </p>
            </div>

            {/* Uploaded Deliverable Item */}
            {uploadedFile && (
              <div className="flex items-center justify-between p-4 rounded-lg bg-[#f0fdf4] border border-primary-container/30 shadow-2xs">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-10 h-10 rounded bg-primary-container/15 text-primary-container flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[24px]">task</span>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-label-md text-on-surface font-semibold truncate">
                        {uploadedFile.name}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-primary-container text-on-primary font-label-xs font-medium shrink-0">
                        Ready
                      </span>
                    </div>
                    <span className="font-label-xs text-secondary mt-0.5 tabular-nums">
                      {uploadedFile.size} · Uploaded at {uploadedFile.time} · {uploadedFile.hash}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setUploadedFile(null)}
                  title="Delete uploaded file"
                  aria-label="Delete file"
                  className="p-2 text-secondary hover:text-error hover:bg-error-container/50 rounded transition-colors"
                >
                  <span className="material-symbols-outlined text-[20px]">delete</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Sticky Bottom Global Action Bar */}
        <div className="fixed bottom-0 left-0 w-full z-40 bg-surface-container-lowest/95 backdrop-blur-md border-t border-[#e2e8f0] shadow-md">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-3">
            {/* Left: Previous Button */}
            <Link
              href="/dashboard"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded bg-surface-container-lowest hover:bg-surface-container text-on-surface font-label-md border border-[#e2e8f0] shadow-2xs transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
              <span>Back to Dashboard</span>
            </Link>

            {/* Center: Auto-save status */}
            <div className="flex items-center gap-2 font-label-sm text-secondary">
              <span className="w-2 h-2 rounded-full bg-primary-container animate-pulse"></span>
              <span className="tabular-nums">Draft saved locally ({lastSaved})</span>
            </div>

            {/* Right: Commitments */}
            <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={handleManualSave}
                className="flex-1 sm:flex-none px-4 py-2 rounded bg-surface-container-lowest hover:bg-surface-container text-on-surface font-label-md border border-[#e2e8f0] shadow-2xs transition-colors"
              >
                Save Draft
              </button>
              <button
                type="button"
                onClick={() => setIsSubmitModalOpen(true)}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-6 py-2 rounded bg-primary-container hover:bg-[#166534] active:scale-[0.98] text-on-primary font-label-md font-medium shadow-2xs transition-all"
              >
                <span>Submit Task</span>
                <span className="material-symbols-outlined text-[18px]">send</span>
              </button>
            </div>
          </div>
        </div>

        {/* Submit Confirmation Modal */}
        {isSubmitModalOpen && (
          <div className="fixed inset-0 bg-inverse-surface/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <div className="bg-surface-container-lowest rounded-lg border border-[#e2e8f0] max-w-md w-full p-6 shadow-2xl flex flex-col gap-4">
              <div className="w-12 h-12 rounded-full bg-on-tertiary-container text-primary-container flex items-center justify-center">
                <span className="material-symbols-outlined text-[28px]">verified</span>
              </div>
              <div>
                <h3 className="font-headline-sm font-semibold text-on-surface">
                  Finalize and Submit Assessment?
                </h3>
                <p className="font-body-md text-secondary mt-1">
                  Once submitted, your answers will be permanently locked and queued for formal panel evaluation. (Mock submission in Stage 1).
                </p>
              </div>

              <div className="p-3 bg-surface-container-low rounded border border-[#e2e8f0] font-label-xs text-secondary flex flex-col gap-1">
                <span className="font-semibold text-on-surface">Submission Checklist:</span>
                <span>• Scope 1 MCQ selected (Option B)</span>
                <span>• Written Response: {words} words</span>
                <span>• Strategic Pitch Deck: {uploadedFile?.name || "Missing"}</span>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => setIsSubmitModalOpen(false)}
                  className="px-4 py-2 rounded bg-surface-container-high hover:bg-surface-container text-on-surface font-label-md border border-[#e2e8f0]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleFinalSubmit}
                  className="px-5 py-2 rounded bg-primary-container hover:bg-[#166534] text-on-primary font-label-md font-medium shadow-2xs"
                >
                  Confirm & Submit
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Reference PDF Reader Modal */}
        {readerModalOpen && (
          <div className="fixed inset-0 bg-inverse-surface/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <div className="bg-surface-container-lowest rounded-lg border border-[#e2e8f0] max-w-3xl w-full h-[80vh] shadow-2xl flex flex-col">
              <div className="p-4 border-b border-[#e2e8f0] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-error">picture_as_pdf</span>
                  <span className="font-headline-sm font-semibold text-on-surface">
                    Sample_Case_Brief_Campus_ESG.pdf
                  </span>
                </div>
                <button
                  onClick={() => setReaderModalOpen(false)}
                  className="p-1.5 rounded hover:bg-surface-container text-secondary"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>

              <div className="flex-1 p-6 overflow-y-auto bg-surface-container-low/40 flex flex-col gap-4 font-body-md text-on-surface leading-relaxed">
                <div className="p-4 bg-surface-container-lowest rounded border border-[#e2e8f0] shadow-2xs">
                  <span className="font-label-xs text-secondary uppercase tracking-wider font-semibold">
                    Sample Case Brief · Section 1.2
                  </span>
                  <h4 className="font-headline-sm font-semibold mt-1 mb-2">
                    Institutional Carbon Footprint & Thermal Utility Baseline (Sample Data)
                  </h4>
                  <p className="text-secondary text-sm">
                    The participating university cluster comprises 142 primary academic and administrative facilities across 220 hectares. Central thermal heating is currently driven by 42 direct-fired natural gas boilers installed between 2008 and 2016. Annual Scope 1 emissions generated directly from heating and fleet fuels total 34,200 metric tonnes CO2e.
                  </p>
                  <p className="text-secondary text-sm mt-3">
                    Submissions should address capital-efficient retrofit pathways, automated setback scheduling, peak load leveling, and telemetry verification frameworks to satisfy the 40% target within the stipulated 18-month execution envelope.
                  </p>
                </div>
              </div>

              <div className="p-4 border-t border-[#e2e8f0] flex items-center justify-between bg-surface-container-low">
                <span className="font-label-xs text-secondary">Sample Document Verified · 2.4 MB</span>
                <button
                  onClick={() => setReaderModalOpen(false)}
                  className="px-4 py-1.5 rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-label-sm border border-[#e2e8f0]"
                >
                  Close Reader
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <ParticipantFooter />
    </div>
  );
}
