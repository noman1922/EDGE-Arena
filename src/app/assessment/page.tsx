"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { ParticipantHeader } from "@/components/layout/participant-header";
import { ParticipantFooter } from "@/components/layout/participant-footer";
import {
  getTaskAssessmentData,
  saveAnswerDraftAction,
  submitAssessmentAction,
  type TaskAssessmentData,
} from "@/app/actions/assessment-actions";
import {
  uploadSubmissionAttachmentAction,
  deleteSubmissionAttachmentAction,
  getFileDownloadUrlAction,
} from "@/app/actions/file-actions";

export default function AssessmentInterfacePage() {
  const [data, setData] = useState<TaskAssessmentData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Timer state
  const [secondsLeft, setSecondsLeft] = useState(84 * 60 + 10);
  const [selectedOption, setSelectedOption] = useState<string>("B");
  const [writtenResponse, setWrittenResponse] = useState<string>("");
  const [lastSaved, setLastSaved] = useState<string>("Not saved yet");
  const [isSaving, setIsSaving] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<{
    name: string;
    size: string;
    time: string;
    hash: string;
    fileKey: string;
    downloadUrl?: string;
  } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [readerModalOpen, setReaderModalOpen] = useState(false);

  // Load real assessment task data from database
  useEffect(() => {
    async function loadData() {
      try {
        setIsLoading(true);
        const res = await getTaskAssessmentData();
        setData(res);
        setSecondsLeft(res.task.secondsLeft);

        // Pre-fill answers from database draft if they exist
        const mcqQ = res.questions.find((q) => q.type === "MCQ");
        const writtenQ = res.questions.find((q) => q.type === "WRITTEN");

        const mcqAns = res.submission.answers.find((a) => a.questionId === mcqQ?.id);
        if (mcqAns?.selectedOption) {
          setSelectedOption(mcqAns.selectedOption);
        }

        const writtenAns = res.submission.answers.find((a) => a.questionId === writtenQ?.id);
        if (writtenAns?.writtenText) {
          setWrittenResponse(writtenAns.writtenText);
        } else {
          setWrittenResponse(
            "Our transformation strategy initiates with an intensive baseline validation across all direct-fired campus thermal heating boilers and fleet service vehicles. We will deploy IoT sub-metering nodes connected to an open telemetry dashboard to isolate heat exchange leakage and optimize automated nocturnal setbacks to achieve a 40% reduction within 18 months."
          );
        }

        if (res.submission.status === "SUBMITTED") {
          setSubmitted(true);
        }

        // Check for attached PDF deliverable
        const fileAns = res.submission.answers.find((a) => a.fileKey);
        if (fileAns && fileAns.fileKey && fileAns.fileName) {
          const sizeFormatted = fileAns.fileSizeBytes
            ? (fileAns.fileSizeBytes / (1024 * 1024)).toFixed(1) + " MB"
            : "PDF Document";
          const shortHash = fileAns.fileSha256
            ? `SHA-256: ${fileAns.fileSha256.substring(0, 8)}...${fileAns.fileSha256.substring(fileAns.fileSha256.length - 8)}`
            : "Verified Document";

          setUploadedFile({
            name: fileAns.fileName,
            size: sizeFormatted,
            time: "Synced with Database",
            hash: shortHash,
            fileKey: fileAns.fileKey,
            downloadUrl: `/api/files/${fileAns.fileKey}`,
          });
        } else {
          setUploadedFile(null);
        }

        const savedTime = new Date(res.submission.autoSavedAt).toLocaleTimeString("en-US", {
          hour12: false,
        });
        setLastSaved(savedTime);
      } catch (err) {
        console.error("Failed to load task assessment data:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

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
    : writtenResponse.trim().split(/\s+/).filter(Boolean).length;
  const wordPercent = Math.min(100, Math.round((words / 300) * 100));

  const handleSelectOption = async (optKey: string) => {
    if (submitted) return;
    setSelectedOption(optKey);

    if (data) {
      const mcqQ = data.questions.find((q) => q.type === "MCQ");
      if (mcqQ) {
        setIsSaving(true);
        const res = await saveAnswerDraftAction(data.submission.id, mcqQ.id, {
          selectedOption: optKey,
        });
        setIsSaving(false);
        if (res.success && res.savedAt) {
          setLastSaved(res.savedAt);
        }
      }
    }
  };

  const handleManualSave = async () => {
    if (!data || submitted) return;
    setIsSaving(true);

    try {
      const mcqQ = data.questions.find((q) => q.type === "MCQ");
      const writtenQ = data.questions.find((q) => q.type === "WRITTEN");

      if (mcqQ) {
        await saveAnswerDraftAction(data.submission.id, mcqQ.id, {
          selectedOption,
        });
      }

      if (writtenQ) {
        const res = await saveAnswerDraftAction(data.submission.id, writtenQ.id, {
          writtenText: writtenResponse,
          fileName: uploadedFile?.name,
        });
        if (res.success && res.savedAt) {
          setLastSaved(res.savedAt);
        }
      }
    } catch (err) {
      console.error("Save draft error:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !data) return;

    setUploadError(null);
    setIsUploading(true);

    try {
      const fileQ =
        data.questions.find((q) => q.type === "FILE_UPLOAD") ||
        data.questions.find((q) => q.questionNumber === 4);

      if (!fileQ) {
        throw new Error("File upload question not found in current assessment.");
      }

      const formData = new FormData();
      formData.append("submissionId", data.submission.id);
      formData.append("questionId", fileQ.id);
      formData.append("file", file);

      const res = await uploadSubmissionAttachmentAction(formData);

      if (res.success && res.file) {
        setUploadedFile({
          name: res.file.name,
          size: res.file.size,
          time: res.file.time,
          hash: res.file.hash,
          fileKey: res.file.fileKey,
          downloadUrl: res.file.downloadUrl,
        });
        setLastSaved(new Date().toLocaleTimeString("en-US", { hour12: false }));
      } else {
        setUploadError(res.error || "File upload failed.");
      }
    } catch (err) {
      console.error("File upload error:", err);
      setUploadError(err instanceof Error ? err.message : "Failed to upload file.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleFileRemove = async () => {
    if (!data || !uploadedFile || submitted) return;
    if (!window.confirm("Are you sure you want to remove this uploaded PDF attachment?")) return;

    try {
      const fileQ =
        data.questions.find((q) => q.type === "FILE_UPLOAD") ||
        data.questions.find((q) => q.questionNumber === 4);

      if (fileQ) {
        await deleteSubmissionAttachmentAction(data.submission.id, fileQ.id);
      }
      setUploadedFile(null);
      setUploadError(null);
    } catch (err) {
      console.error("Remove file error:", err);
    }
  };

  const handleOpenFile = async (fileKey: string) => {
    try {
      const res = await getFileDownloadUrlAction(fileKey);
      if (res.success && res.downloadUrl) {
        window.open(res.downloadUrl, "_blank", "noopener,noreferrer");
      } else {
        window.open(`/api/files/${fileKey}`, "_blank", "noopener,noreferrer");
      }
    } catch {
      window.open(`/api/files/${fileKey}`, "_blank", "noopener,noreferrer");
    }
  };

  const handleFinalSubmit = async () => {
    if (!data) return;
    setIsSubmitModalOpen(false);
    setIsSaving(true);

    try {
      // First ensure latest text is saved
      const writtenQ = data.questions.find((q) => q.type === "WRITTEN");
      if (writtenQ) {
        await saveAnswerDraftAction(data.submission.id, writtenQ.id, {
          writtenText: writtenResponse,
          fileName: uploadedFile?.name,
        });
      }

      // Then submit and auto-grade
      const res = await submitAssessmentAction(data.submission.id);
      if (res.success) {
        setSubmitted(true);
        setLastSaved(new Date().toLocaleTimeString("en-US", { hour12: false }));
      } else {
        alert(`Submission error: ${res.error}`);
      }
    } catch (err) {
      console.error("Submit error:", err);
      alert("An unexpected error occurred during submission.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface flex flex-col justify-between">
        <ParticipantHeader />
        <main className="w-full pt-32 pb-32 flex flex-col items-center justify-center">
          <div className="flex items-center gap-3 text-secondary font-label-md">
            <span className="w-5 h-5 border-2 border-primary-container border-t-transparent rounded-full animate-spin"></span>
            <span>Loading assessment benchmark from Supabase database...</span>
          </div>
        </main>
        <ParticipantFooter />
      </div>
    );
  }

  const mcqQuestion = data?.questions.find((q) => q.type === "MCQ");
  const writtenQuestion = data?.questions.find((q) => q.type === "WRITTEN");

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
                {data?.task.contestTitle ?? "Campus ESG Transformation Strategy 2025"} · {data?.task.phaseTitle ?? "Stage 2"}
              </span>
              <h1 className="font-headline-sm text-on-surface mt-0.5 font-semibold">
                {data?.task.title ?? "Task 2.1: Campus ESG Transformation Strategy"}
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
                {submitted ? "Completed · 100%" : "Live Assessment · In Progress"}
              </div>
            </div>
          </div>

          {/* Linear Progress Bar */}
          <div className="w-full h-1 bg-surface-container-high overflow-hidden">
            <div
              className="h-full bg-primary-container transition-all duration-300 ease-out"
              style={{ width: submitted ? "100%" : "50%" }}
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
                  Task Assessment Submitted & Permanently Saved
                </h3>
                <p className="font-body-sm text-on-surface-variant mt-0.5">
                  Your diagnostic responses and deliverables were recorded in the Supabase PostgreSQL database at {lastSaved} and
                  locked. Answers are queued for panel evaluation. Answer keys remain strictly isolated.
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
                    Live Supabase Persistence
                  </span>
                  <span className="font-label-xs text-secondary">• Submission #{data?.submission.id.slice(0, 8)}</span>
                </div>
                <p className="font-headline-sm text-on-surface mt-1">
                  Institutional Energy Decarbonization Module
                </p>
                <p className="font-body-sm text-secondary mt-0.5">
                  Demonstration of diagnostic benchmark question flow conforming to standardized enterprise sustainability criteria.
                </p>
              </div>
            </div>
            <div className="hidden lg:flex flex-col items-end shrink-0 pl-4 border-l border-[#e2e8f0]">
              <span className="font-label-xs text-secondary uppercase font-medium">
                Task Points
              </span>
              <span className="font-headline-md text-primary-container font-semibold tabular-nums">
                {data?.task.totalPoints ?? 100}
              </span>
            </div>
          </div>

          {/* Question 1: Multiple Choice Question */}
          {mcqQuestion && (
            <div className="bg-surface-container-lowest p-6 sm:p-8 rounded-lg border border-[#e2e8f0] shadow-2xs flex flex-col gap-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded bg-surface-container-high font-label-xs text-on-surface font-semibold tracking-wide uppercase border border-[#e2e8f0]">
                    Question 0{mcqQuestion.questionNumber}
                  </span>
                  <span className="font-label-xs text-error font-medium flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-error"></span> Mandatory
                  </span>
                </div>
                <span className="font-label-sm text-secondary font-medium">{mcqQuestion.points} Points</span>
              </div>

              <div>
                <h2 className="font-headline-sm text-on-surface font-semibold">
                  {mcqQuestion.prompt}
                </h2>
                {mcqQuestion.instructions && (
                  <p className="font-body-sm text-secondary mt-1">
                    {mcqQuestion.instructions}
                  </p>
                )}
              </div>

              {/* Multiple Choice Options */}
              <div className="flex flex-col gap-3" role="radiogroup" aria-label="Question 1 choices">
                {mcqQuestion.options.map((opt) => {
                  const isSelected = selectedOption === opt.optionKey;

                  return (
                    <label
                      key={opt.id}
                      onClick={() => !submitted && handleSelectOption(opt.optionKey)}
                      className={`group relative flex items-start gap-4 p-4 rounded-lg cursor-pointer transition-all border ${
                        isSelected
                          ? "bg-[#f0fdf4] border-primary-container ring-1 ring-primary-container shadow-2xs"
                          : "bg-surface-container-lowest border-[#e2e8f0] hover:bg-surface-container-low"
                      } ${submitted ? "cursor-not-allowed opacity-90" : ""}`}
                    >
                      <input
                        type="radio"
                        name="q1_selection"
                        value={opt.optionKey}
                        disabled={submitted}
                        checked={isSelected}
                        onChange={() => handleSelectOption(opt.optionKey)}
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
                            {opt.optionKey}.
                          </strong>
                          {opt.text}
                        </span>
                        {opt.scopeTag && (
                          <span
                            className={`shrink-0 font-label-xs px-2 py-0.5 rounded font-medium ${
                              isSelected
                                ? "bg-primary-container/10 text-primary-container font-semibold"
                                : "text-secondary opacity-70"
                            }`}
                          >
                            {isSelected ? `Selected · ${opt.scopeTag}` : opt.scopeTag}
                          </span>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Question 2: Executive Written Response */}
          {writtenQuestion && (
            <div className="bg-surface-container-lowest p-6 sm:p-8 rounded-lg border border-[#e2e8f0] shadow-2xs flex flex-col gap-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded bg-surface-container-high font-label-xs text-on-surface font-semibold tracking-wide uppercase border border-[#e2e8f0]">
                    Question 0{writtenQuestion.questionNumber}
                  </span>
                  <span className="font-label-xs text-error font-medium flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-error"></span> Mandatory
                  </span>
                </div>
                <span className="font-label-sm text-secondary font-medium">{writtenQuestion.points} Points</span>
              </div>

              <div>
                <h2 className="font-headline-sm text-on-surface font-semibold">
                  {writtenQuestion.prompt}
                </h2>
                {writtenQuestion.instructions && (
                  <p className="font-body-md text-on-surface-variant mt-1.5 leading-relaxed">
                    {writtenQuestion.instructions}
                  </p>
                )}
              </div>

              {/* Editorial Textarea */}
              <div className="flex flex-col gap-2">
                <div className="relative rounded-lg bg-surface-container-low p-1 border border-[#e2e8f0] focus-within:ring-2 focus-within:ring-primary-container/20 focus-within:border-primary-container">
                  <textarea
                    value={writtenResponse}
                    disabled={submitted}
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
                    Target length: {writtenQuestion.minWords ?? 200} – {writtenQuestion.maxWords ?? 300} words
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
          )}

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
                Review the institutional energy audit baseline to substantiate your technical proposals and emission reduction models.
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
                  onClick={() => handleOpenFile("references/sample_case_brief_campus_esg.pdf")}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-surface-container-lowest hover:bg-surface-container text-on-surface font-label-sm border border-[#e2e8f0] shadow-2xs transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px]">download</span>
                  Download PDF
                </button>
                <button
                  type="button"
                  onClick={() => setReaderModalOpen(true)}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-surface-container-lowest hover:bg-surface-container text-on-surface font-label-sm border border-[#e2e8f0] shadow-2xs transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px]">visibility</span>
                  Open in Reader
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
                Max 25 MB · PDF Only
              </span>
            </div>

            <div>
              <h2 className="font-headline-sm text-on-surface font-semibold">
                Upload Strategic Pitch Deck
              </h2>
              <p className="font-body-sm text-secondary mt-1">
                Submit the finalized slide deck summarizing technical sequencing, ROI projections, and student stakeholder governance.
              </p>
            </div>

            {/* Hidden real file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={handleFileUpload}
              disabled={isUploading || submitted}
            />

            {/* Error Banner */}
            {uploadError && (
              <div className="p-3.5 rounded-lg bg-error-container/20 border border-error/30 text-error font-body-sm flex items-start gap-2.5">
                <span className="material-symbols-outlined text-[20px] shrink-0">error</span>
                <div className="flex-1">
                  <span className="font-semibold block font-label-sm">Upload Rejected</span>
                  <span>{uploadError}</span>
                </div>
              </div>
            )}

            {/* Uploaded Deliverable Item */}
            {uploadedFile ? (
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-lg bg-[#f0fdf4] border border-primary-container/30 shadow-2xs gap-3">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-10 h-10 rounded bg-primary-container/15 text-primary-container flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[24px]">picture_as_pdf</span>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-label-md text-on-surface font-semibold truncate">
                        {uploadedFile.name}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-primary-container text-on-primary font-label-xs font-medium shrink-0">
                        Verified
                      </span>
                    </div>
                    <span className="font-label-xs text-secondary mt-0.5 tabular-nums">
                      {uploadedFile.size} · {uploadedFile.time} · {uploadedFile.hash}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 justify-end">
                  <button
                    type="button"
                    onClick={() => handleOpenFile(uploadedFile.fileKey)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-surface-container-lowest hover:bg-surface-container text-on-surface font-label-sm border border-[#e2e8f0] shadow-2xs transition-colors"
                  >
                    <span className="material-symbols-outlined text-[16px]">visibility</span>
                    View PDF
                  </button>
                  {!submitted && (
                    <button
                      type="button"
                      onClick={handleFileRemove}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded hover:bg-error-container/30 text-error font-label-sm transition-colors"
                      title="Remove attachment"
                    >
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div
                onClick={() => !isUploading && !submitted && fileInputRef.current?.click()}
                className={`p-6 border-2 border-dashed rounded-lg flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${
                  isUploading
                    ? "border-primary-container/50 bg-primary-container/5 cursor-wait"
                    : "border-[#cbd5e1] hover:border-primary-container bg-surface-container-low hover:bg-surface-container"
                } ${submitted ? "opacity-60 pointer-events-none" : ""}`}
              >
                {isUploading ? (
                  <div className="flex flex-col items-center gap-2 py-2">
                    <span className="w-8 h-8 border-3 border-primary-container border-t-transparent rounded-full animate-spin"></span>
                    <span className="font-label-md text-on-surface font-semibold">
                      Verifying SHA-256 and uploading to secure storage...
                    </span>
                    <span className="font-body-xs text-secondary">
                      Enforcing 25 MB limit & magic byte validation
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 py-2">
                    <div className="w-12 h-12 rounded-full bg-surface-container-high flex items-center justify-center text-primary-container mb-1">
                      <span className="material-symbols-outlined text-[28px]">upload_file</span>
                    </div>
                    <div className="font-label-md text-on-surface font-semibold">
                      Click to browse and upload Strategic Pitch Deck
                    </div>
                    <p className="font-body-xs text-secondary max-w-sm">
                      Standard PDF documents only (.pdf) • Maximum file size 25 MB. Server verifies SHA-256 integrity and %PDF magic bytes.
                    </p>
                    <button
                      type="button"
                      disabled={submitted}
                      className="mt-2 px-4 py-2 rounded bg-primary-container hover:bg-[#166534] text-on-primary font-label-sm font-medium shadow-2xs transition-colors"
                    >
                      Select PDF File
                    </button>
                  </div>
                )}
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
              <span className={`w-2 h-2 rounded-full ${isSaving ? "bg-amber-500 animate-spin" : "bg-primary-container animate-pulse"}`}></span>
              <span className="tabular-nums">
                {isSaving ? "Syncing to database..." : `Saved to database (${lastSaved})`}
              </span>
            </div>

            {/* Right: Commitments */}
            <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
              {!submitted && (
                <>
                  <button
                    type="button"
                    onClick={handleManualSave}
                    disabled={isSaving}
                    className="flex-1 sm:flex-none px-4 py-2 rounded bg-surface-container-lowest hover:bg-surface-container text-on-surface font-label-md border border-[#e2e8f0] shadow-2xs transition-colors"
                  >
                    Save Draft
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsSubmitModalOpen(true)}
                    disabled={isSaving}
                    className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-6 py-2 rounded bg-primary-container hover:bg-[#166534] active:scale-[0.98] text-on-primary font-label-md font-medium shadow-2xs transition-all"
                  >
                    <span>Submit Task</span>
                    <span className="material-symbols-outlined text-[18px]">send</span>
                  </button>
                </>
              )}
              {submitted && (
                <span className="font-label-sm text-primary-container font-semibold flex items-center gap-1">
                  <span className="material-symbols-outlined text-[18px]">lock</span>
                  Locked & Submitted
                </span>
              )}
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
                  Once submitted, your answers will be permanently saved to the Supabase database, timestamped, locked, and queued for evaluation.
                </p>
              </div>

              <div className="p-3 bg-surface-container-low rounded border border-[#e2e8f0] font-label-xs text-secondary flex flex-col gap-1">
                <span className="font-semibold text-on-surface">Submission Checklist:</span>
                <span>• MCQ selected: Option {selectedOption}</span>
                <span>• Written Response: {words} words</span>
                <span>• Pitch Deck: {uploadedFile?.name || "Ready"}</span>
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
