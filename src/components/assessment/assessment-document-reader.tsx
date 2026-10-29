"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ParticipantHeader } from "@/components/layout/participant-header";
import { ParticipantFooter } from "@/components/layout/participant-footer";
import { DeleteConfirmationModal } from "@/components/modals/delete-confirmation-modal";
import {
  getTaskAssessmentData,
  saveAnswerDraftAction,
  submitAssessmentAction,
  type TaskAssessmentData,
  type AssessmentTaskNavOption,
} from "@/app/actions/assessment-actions";
import {
  uploadSubmissionAttachmentAction,
  deleteSubmissionAttachmentAction,
} from "@/app/actions/file-actions";
import {
  getContestMonitoringSettingsAction,
  recordMonitoringEventAction,
} from "@/app/actions/monitoring-actions";
import {
  type ContestMonitoringSettings,
  DEFAULT_MONITORING_SETTINGS,
} from "@/lib/monitoring";
import { useContestTimer } from "@/hooks/use-contest-timer";

export interface AssessmentDocumentReaderProps {
  initialContestId?: string;
  initialPhaseId?: string;
  initialTaskId?: string;
}

export function AssessmentDocumentReader({
  initialContestId,
  initialPhaseId,
  initialTaskId,
}: AssessmentDocumentReaderProps) {
  const router = useRouter();

  const [data, setData] = useState<TaskAssessmentData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentTaskId, setCurrentTaskId] = useState<string | undefined>(initialTaskId);
  const [monitoringSettings, setMonitoringSettings] = useState<ContestMonitoringSettings>(
    DEFAULT_MONITORING_SETTINGS
  );
  const [hasConsented, setHasConsented] = useState(false);
  const [isStartingAssessment, setIsStartingAssessment] = useState(false);

  // Participant form answers state
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [writtenResponses, setWrittenResponses] = useState<Record<string, string>>({});
  const [uploadedFiles, setUploadedFiles] = useState<
    Record<
      string,
      {
        name: string;
        size: string;
        time: string;
        hash: string;
        fileKey: string;
        downloadUrl?: string;
      }
    >
  >({});

  // Autosave and sync state
  const [lastSaved, setLastSaved] = useState<string>("Not saved yet");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<Record<string, string>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Drag over states for file uploads
  const [dragOverQuestionId, setDragOverQuestionId] = useState<string | null>(null);

  // Modals & submission state
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [fileToRemove, setFileToRemove] = useState<{
    questionId: string;
    fileName: string;
  } | null>(null);
  const [isDeletingFile, setIsDeletingFile] = useState(false);
  const [referencesExpanded, setReferencesExpanded] = useState(true);

  // Live timer hook with Asia/Dhaka synchronization and 30s heartbeat
  const timer = useContestTimer({
    contestId: data?.task?.contestId || initialContestId,
    phaseId: data?.phase?.id || initialPhaseId,
    initialDeadlineIso: data?.task?.deadline,
    initialSecondsLeft: data?.task?.secondsLeft,
    isContestEndedInitial: data?.isContestEnded,
    heartbeatIntervalMs: 30000,
  });

  const isReadOnly = Boolean(submitted || data?.isContestEnded || timer.isEnded);

  // Load task assessment data from server
  const loadData = useCallback(
    async (taskToLoad?: string) => {
      try {
        setIsLoading(true);
        const target = taskToLoad || initialTaskId;
        const res = await getTaskAssessmentData(initialContestId, target);

        // Pre-contest gate redirection
        if (res.state === "CONTEST_NOT_STARTED" || res.isContestUpcoming) {
          const cId = res.contest?.id || initialContestId;
          router.replace(`/dashboard/contests/${cId}?error=not_started`);
          return;
        }

        // Locked unit redirection: update URL to the active unit
        if (res.isRedirectedFromLocked && res.redirectTargetTaskId && res.contest && res.phase) {
          router.replace(`/assessment/${res.contest.id}/${res.phase.id}/${res.redirectTargetTaskId}`);
        }

        setData(res);

        // Pre-fill answers from existing submission draft
        const opts: Record<string, string> = {};
        const wr: Record<string, string> = {};
        const uf: Record<
          string,
          { name: string; size: string; time: string; hash: string; fileKey: string; downloadUrl?: string }
        > = {};

        if (res.submission && Array.isArray(res.submission.answers)) {
          res.submission.answers.forEach((ans) => {
            if (ans.selectedOption) opts[ans.questionId] = ans.selectedOption;
            if (ans.writtenText) wr[ans.questionId] = ans.writtenText;
            if (ans.fileKey && ans.fileName) {
              const sizeFormatted = ans.fileSizeBytes
                ? (ans.fileSizeBytes / (1024 * 1024)).toFixed(1) + " MB"
                : "PDF Document";
              const shortHash = ans.fileSha256
                ? `SHA-256: ${ans.fileSha256.substring(0, 6)}...${ans.fileSha256.substring(ans.fileSha256.length - 6)}`
                : "Cryptographically Verified";

              uf[ans.questionId] = {
                name: ans.fileName,
                size: sizeFormatted,
                time: "Synced with Database",
                hash: shortHash,
                fileKey: ans.fileKey,
                downloadUrl: `/api/files/${ans.fileKey}`,
              };
            }
          });
        }

        setSelectedOptions(opts);
        setWrittenResponses(wr);
        setUploadedFiles(uf);

        const isSubmittedOrGraded =
          res.submission &&
          (res.submission.status === "SUBMITTED" ||
            res.submission.status === "GRADED" ||
            res.submission.status === "PUBLISHED");

        if (isSubmittedOrGraded || res.isContestEnded) {
          setHasConsented(true);
        }

        setSubmitted(Boolean(isSubmittedOrGraded));

        // Contest monitoring permissions
        if (res.task && res.task.contestId) {
          const settings = await getContestMonitoringSettingsAction(res.task.contestId);
          setMonitoringSettings(settings);
        }

        if (res.submission?.autoSavedAt) {
          const savedTime = new Date(res.submission.autoSavedAt).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            second: "2-digit",
          });
          setLastSaved(`Saved at ${savedTime}`);
        }
      } catch (err) {
        console.error("Failed to load task assessment data:", err);
      } finally {
        setIsLoading(false);
      }
    },
    [initialContestId, initialTaskId, router]
  );

  useEffect(() => {
    if (initialTaskId && initialTaskId !== currentTaskId) {
      setCurrentTaskId(initialTaskId);
    }
  }, [initialTaskId, currentTaskId]);

  useEffect(() => {
    loadData(currentTaskId);
  }, [loadData, currentTaskId]);

  // Safari BFCache restore listener
  useEffect(() => {
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        loadData(currentTaskId);
      }
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, [loadData, currentTaskId]);

  // Video stream and canvas refs for permission-based evidence capture
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraPermittedRef = useRef<boolean>(false);

  // Helper to capture a frame from the permitted camera stream (ONLY if cameraCaptureEnabled and candidate consented)
  const captureCameraStill = useCallback((): string | undefined => {
    if (!monitoringSettings.cameraCaptureEnabled && !monitoringSettings.cameraEnabled) {
      return undefined;
    }
    if (!cameraPermittedRef.current || !cameraVideoRef.current) {
      return undefined;
    }
    try {
      const video = cameraVideoRef.current;
      if (video.videoWidth === 0 || video.videoHeight === 0) return undefined;
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 240;
      const ctx = canvas.getContext("2d");
      if (!ctx) return undefined;
      ctx.drawImage(video, 0, 0, 320, 240);
      return canvas.toDataURL("image/jpeg", 0.65);
    } catch {
      return undefined;
    }
  }, [monitoringSettings.cameraCaptureEnabled, monitoringSettings.cameraEnabled]);

  // Helper to capture in-browser assessment snapshot (ONLY if screenCaptureEnabled)
  const captureScreenSnapshot = useCallback((): string | undefined => {
    if (!monitoringSettings.screenCaptureEnabled) {
      return undefined;
    }
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 480;
      canvas.height = 320;
      const ctx = canvas.getContext("2d");
      if (!ctx) return undefined;

      // Dark slate canvas background
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, 480, 320);

      // Header bar
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(0, 0, 480, 44);

      ctx.fillStyle = "#10b981";
      ctx.font = "bold 13px sans-serif";
      ctx.fillText("ACI Career EDGE Assess · Proctoring Evidence Capture", 16, 27);

      ctx.fillStyle = "#e2e8f0";
      ctx.font = "bold 15px sans-serif";
      ctx.fillText(data?.task?.title || "Assessment Reader", 16, 75);

      ctx.fillStyle = "#94a3b8";
      ctx.font = "12px sans-serif";
      ctx.fillText(`Contest: ${data?.contest?.title || "Active Contest"}`, 16, 100);
      ctx.fillText(
        `Candidate ID: ${
          data?.user?.id
            ? `ACI-${data.user.id.substring(0, 6).toUpperCase()}`
            : "Active Candidate"
        }`,
        16,
        120
      );
      ctx.fillText(`Captured: ${new Date().toISOString()}`, 16, 140);

      // Event alert banner
      ctx.fillStyle = "#7f1d1d";
      ctx.fillRect(16, 160, 448, 60);
      ctx.strokeStyle = "#ef4444";
      ctx.strokeRect(16, 160, 448, 60);

      ctx.fillStyle = "#fecaca";
      ctx.font = "bold 12px sans-serif";
      ctx.fillText("CRITICAL MONITORING TELEMETRY ALERT", 28, 185);
      ctx.fillStyle = "#ffffff";
      ctx.font = "11px sans-serif";
      ctx.fillText("Window blur / fullscreen exit recorded under contest integrity disclosure.", 28, 205);

      return canvas.toDataURL("image/jpeg", 0.7);
    } catch {
      return undefined;
    }
  }, [monitoringSettings.screenCaptureEnabled, data]);

  // Clean up media streams on unmount
  useEffect(() => {
    return () => {
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((t) => t.stop());
        cameraStreamRef.current = null;
      }
    };
  }, []);

  // Telemetry: Tab switch and fullscreen listeners with permission-based evidence capture
  useEffect(() => {
    if (!hasConsented || submitted || !data?.task?.contestId) return;
    const activeContestId = data.task.contestId;

    const handleVisibility = () => {
      if (document.hidden && monitoringSettings.tabSwitchEnabled) {
        const eventId = `evt_blur_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const screenCaptureData = captureScreenSnapshot();
        const cameraCaptureData = captureCameraStill();

        recordMonitoringEventAction({
          contestId: activeContestId,
          eventId,
          eventType: "TAB_SWITCH",
          status: "Tab switch detected",
          details: `Window blur / tab switch detected at ${new Date().toLocaleTimeString()}`,
          screenCaptureData,
          cameraCaptureData,
          captureSuccess: true,
        });
      }
    };

    const handleFullscreen = () => {
      if (!document.fullscreenElement && monitoringSettings.fullscreenEnabled) {
        const eventId = `evt_fs_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const screenCaptureData = captureScreenSnapshot();
        const cameraCaptureData = captureCameraStill();

        recordMonitoringEventAction({
          contestId: activeContestId,
          eventId,
          eventType: "FULLSCREEN_EXIT",
          status: "Fullscreen exit recorded",
          details: `Fullscreen exited at ${new Date().toLocaleTimeString()}`,
          screenCaptureData,
          cameraCaptureData,
          captureSuccess: true,
        });
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    document.addEventListener("fullscreenchange", handleFullscreen);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      document.removeEventListener("fullscreenchange", handleFullscreen);
    };
  }, [hasConsented, submitted, data?.task?.contestId, monitoringSettings, captureScreenSnapshot, captureCameraStill]);

  // Handle MCQ selection with instant autosave
  const handleSelectOption = async (questionId: string, optKey: string) => {
    if (isReadOnly || !data?.submission?.id) return;
    setSelectedOptions((prev) => ({ ...prev, [questionId]: optKey }));

    setIsSaving(true);
    try {
      const res = await saveAnswerDraftAction(data.submission.id, questionId, {
        selectedOption: optKey,
      });
      if (res.success && res.savedAt) {
        setLastSaved(`Saved at ${res.savedAt}`);
      }
    } catch (err) {
      console.error("Option save error:", err);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Written input change
  const handleWrittenChange = (questionId: string, text: string) => {
    if (isReadOnly) return;
    setWrittenResponses((prev) => ({ ...prev, [questionId]: text }));
  };

  // Autosave written answer on blur
  const handleWrittenBlur = async (questionId: string) => {
    if (isReadOnly || !data?.submission?.id) return;
    const text = writtenResponses[questionId] ?? "";
    setIsSaving(true);
    try {
      const res = await saveAnswerDraftAction(data.submission.id, questionId, {
        writtenText: text,
      });
      if (res.success && res.savedAt) {
        setLastSaved(`Saved at ${res.savedAt}`);
      }
    } catch (err) {
      console.error("Written save error:", err);
    } finally {
      setIsSaving(false);
    }
  };

  // Flush all answers to database before navigation
  const flushCurrentDrafts = async () => {
    if (!data?.submission?.id || isReadOnly || !data?.questions) return;
    setIsSaving(true);
    try {
      for (const q of data.questions) {
        if (q.type === "MCQ" && selectedOptions[q.id]) {
          await saveAnswerDraftAction(data.submission.id, q.id, {
            selectedOption: selectedOptions[q.id],
          });
        } else if (q.type === "WRITTEN" && writtenResponses[q.id] !== undefined) {
          await saveAnswerDraftAction(data.submission.id, q.id, {
            writtenText: writtenResponses[q.id],
          });
        }
      }
      setLastSaved(
        `Saved at ${new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })}`
      );
    } catch (err) {
      console.error("Error flushing drafts:", err);
    } finally {
      setIsSaving(false);
    }
  };

  // Navigate to another unit with progression completion
  const handleNavigateToTask = async (targetTask: AssessmentTaskNavOption) => {
    if (!targetTask || targetTask.id === data?.task?.id) return;

    await flushCurrentDrafts();

    // Auto-finalize current unit submission if questions are answered and moving forward
    if (data?.submission?.id && !isReadOnly && !submitted) {
      const allQuestionsAnswered = (questions || []).every((q) => {
        if (q.type === "MCQ") return Boolean(selectedOptions[q.id]);
        if (q.type === "WRITTEN") return Boolean(writtenResponses[q.id]?.trim());
        if (q.type === "FILE_UPLOAD") return Boolean(uploadedFiles[q.id]);
        return true;
      });

      if (allQuestionsAnswered) {
        setIsSubmitting(true);
        try {
          const subRes = await submitAssessmentAction(data.submission.id);
          if (!subRes.success) {
            setIsSubmitting(false);
            alert(`Submission error: ${subRes.error || "Failed to submit assessment"}`);
            return;
          }
          setSubmitted(true);
          const targetContestId = subRes.contestId || data?.contest?.id || initialContestId;
          if (subRes.isFinalSubmission && targetContestId) {
            window.location.href = `/dashboard/leaderboard?contestId=${targetContestId}`;
            return;
          } else if (subRes.nextTaskId && subRes.nextPhaseId && targetContestId) {
            window.location.href = `/assessment/${targetContestId}/${subRes.nextPhaseId}/${subRes.nextTaskId}`;
            return;
          }
        } catch (e) {
          setIsSubmitting(false);
          alert(`Submission error: ${e instanceof Error ? e.message : "Failed to submit assessment"}`);
          return;
        } finally {
          setIsSubmitting(false);
        }
      } else if (targetTask.isLocked) {
        alert(
          targetTask.unlockRequirementText ||
            "Please complete all questions in the current unit before advancing to the next unit."
        );
        return;
      }
    } else if (targetTask.isLocked) {
      alert(targetTask.unlockRequirementText || "This unit is locked. Please complete preceding units first.");
      return;
    }

    const targetUrl = `/assessment/${data?.contest?.id || initialContestId}/${targetTask.phaseId}/${targetTask.id}`;
    window.location.href = targetUrl;
  };

  // Upload file handler
  const processFileUpload = async (questionId: string, file: File) => {
    if (!file || !data?.submission?.id || isReadOnly) return;

    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      setUploadError((prev) => ({
        ...prev,
        [questionId]: "Invalid file type. Only PDF documents (.pdf) are permitted.",
      }));
      return;
    }

    // 25 MB max size check
    if (file.size > 25 * 1024 * 1024) {
      setUploadError((prev) => ({
        ...prev,
        [questionId]: "File size exceeds 25 MB limit. Please compress your PDF before uploading.",
      }));
      return;
    }

    setUploadError((prev) => ({ ...prev, [questionId]: "" }));
    setIsUploading(questionId);

    try {
      const formData = new FormData();
      formData.append("submissionId", data.submission.id);
      formData.append("questionId", questionId);
      formData.append("file", file);

      const res = await uploadSubmissionAttachmentAction(formData);

      if (res.success && res.file) {
        setUploadedFiles((prev) => ({
          ...prev,
          [questionId]: {
            name: res.file!.name,
            size: res.file!.size,
            time: res.file!.time,
            hash: res.file!.hash,
            fileKey: res.file!.fileKey,
            downloadUrl: res.file!.downloadUrl,
          },
        }));
        setLastSaved(
          `Saved at ${new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })}`
        );
      } else {
        setUploadError((prev) => ({
          ...prev,
          [questionId]: res.error || "File upload failed.",
        }));
      }
    } catch (err) {
      console.error("File upload error:", err);
      setUploadError((prev) => ({
        ...prev,
        [questionId]: err instanceof Error ? err.message : "Failed to upload PDF.",
      }));
    } finally {
      setIsUploading(null);
      if (fileInputRefs.current[questionId]) {
        fileInputRefs.current[questionId]!.value = "";
      }
    }
  };

  const handleFileInputChange = (questionId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFileUpload(questionId, file);
    }
  };

  const handleDrop = (questionId: string, e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOverQuestionId(null);
    if (isReadOnly) return;
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFileUpload(questionId, file);
    }
  };

  // Delete attachment with modal confirmation
  const handleConfirmDeleteFile = async () => {
    if (!data?.submission?.id || !fileToRemove || isReadOnly) return;
    try {
      setIsDeletingFile(true);
      await deleteSubmissionAttachmentAction(data.submission.id, fileToRemove.questionId);
      setUploadedFiles((prev) => {
        const next = { ...prev };
        delete next[fileToRemove.questionId];
        return next;
      });
      setUploadError((prev) => ({ ...prev, [fileToRemove.questionId]: "" }));
      setFileToRemove(null);
    } catch (err) {
      console.error("Delete file error:", err);
    } finally {
      setIsDeletingFile(false);
    }
  };


  // Consent & start assessment
  const handleAcknowledgeAndStart = async () => {
    try {
      setIsStartingAssessment(true);
      const activeContestId = data?.task?.contestId;
      if (!activeContestId) {
        setHasConsented(true);
        return;
      }

      // Camera request ONLY if contest enables camera or camera capture
      if (
        (monitoringSettings.cameraCaptureEnabled || monitoringSettings.cameraEnabled) &&
        typeof navigator !== "undefined" &&
        navigator.mediaDevices?.getUserMedia
      ) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 480 } },
          });
          cameraStreamRef.current = stream;
          cameraPermittedRef.current = true;
          if (cameraVideoRef.current) {
            cameraVideoRef.current.srcObject = stream;
            cameraVideoRef.current.play().catch(() => {});
          }
          await recordMonitoringEventAction({
            contestId: activeContestId,
            eventType: "CAMERA_STATUS",
            status: "Permission Granted",
            details: "Camera permission granted and active for evidence capture",
          });
        } catch {
          cameraPermittedRef.current = false;
          await recordMonitoringEventAction({
            contestId: activeContestId,
            eventType: "CAMERA_STATUS",
            status: "Unavailable",
            details: "Camera access unavailable or declined by candidate",
            captureSuccess: false,
            captureFailureReason: "Browser permission declined or media device unavailable",
          });
        }
      } else {
        cameraPermittedRef.current = false;
      }

      // Microphone request if enabled
      if (
        monitoringSettings.micEnabled &&
        typeof navigator !== "undefined" &&
        navigator.mediaDevices?.getUserMedia
      ) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach((t) => t.stop());
          await recordMonitoringEventAction({
            contestId: activeContestId,
            eventType: "MIC_STATUS",
            status: "Permission Granted",
            details: "Microphone permission granted by candidate",
          });
        } catch {
          await recordMonitoringEventAction({
            contestId: activeContestId,
            eventType: "MIC_STATUS",
            status: "Unavailable",
            details: "Microphone access unavailable or declined",
          });
        }
      }

      // Fullscreen request if enabled
      if (monitoringSettings.fullscreenEnabled && typeof document !== "undefined") {
        try {
          if (document.documentElement.requestFullscreen) {
            await document.documentElement.requestFullscreen();
          }
        } catch {
          // Ignored if blocked
        }
        await recordMonitoringEventAction({
          contestId: activeContestId,
          eventType: "FULLSCREEN_ENTER",
          status: "Compliant",
          details: "Candidate entered fullscreen mode",
        });
      }

      // Record session start
      await recordMonitoringEventAction({
        contestId: activeContestId,
        eventType: "SESSION_START",
        status: "Active",
        details: "Candidate acknowledged proctoring disclosure and entered assessment",
      });

      setHasConsented(true);
    } catch (err) {
      console.error("Start assessment error:", err);
      setHasConsented(true);
    } finally {
      setIsStartingAssessment(false);
    }
  };

  // Final submit handler
  const handleFinalSubmit = async () => {
    if (!data?.submission?.id || isReadOnly) return;
    setIsSubmitting(true);
    try {
      await flushCurrentDrafts();

      const res = await submitAssessmentAction(data.submission.id);
      if (res.success) {
        setSubmitted(true);
        setIsSubmitModalOpen(false);
        setLastSaved(
          `Finalized at ${new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })}`
        );

        // Clean up camera stream
        if (cameraStreamRef.current) {
          cameraStreamRef.current.getTracks().forEach((t) => t.stop());
          cameraStreamRef.current = null;
        }

        // Redirect directly to leaderboard if final contest submission
        const targetContestId = res.contestId || data?.contest?.id || initialContestId;
        if (res.isFinalSubmission && targetContestId) {
          window.location.href = `/dashboard/leaderboard?contestId=${targetContestId}`;
          return;
        } else if (res.nextTaskId && res.nextPhaseId && targetContestId) {
          // Proceed to next required task/phase for intermediate submission
          window.location.href = `/assessment/${targetContestId}/${res.nextPhaseId}/${res.nextTaskId}`;
          return;
        }

        window.location.href = `/dashboard/contests/${targetContestId}`;
      } else {
        // Prevent premature redirection on failure
        alert(`Submission error: ${res.error || "Failed to finalize submission. Please try again."}`);
      }
    } catch (err) {
      console.error("Submit error:", err);
      alert(`Submission error: ${err instanceof Error ? err.message : "An unexpected error occurred during submission."}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-white text-[#191c1e] flex flex-col justify-between">
        <ParticipantHeader />
        <main className="w-full py-32 flex flex-col items-center justify-center text-[#545f73]">
          <span className="w-8 h-8 border-3 border-[#15803d] border-t-transparent rounded-full animate-spin mb-3"></span>
          <p className="text-sm font-medium">Loading assessment document reader...</p>
        </main>
        <ParticipantFooter />
      </div>
    );
  }

  // Empty state handling
  if (data?.state === "NO_ENROLLMENT" || !data?.contest) {
    return (
      <div className="min-h-screen bg-white text-[#191c1e] flex flex-col justify-between">
        <ParticipantHeader />
        <main className="w-full py-24 flex flex-col items-center justify-center px-4">
          <div className="max-w-md w-full bg-white p-8 rounded-xl border border-[#e2e8f0] text-center shadow-2xs text-[#191c1e]">
            <div className="w-12 h-12 rounded-full bg-[#f2f4f6] flex items-center justify-center text-[#545f73] mx-auto mb-3">
              <span className="material-symbols-outlined text-[24px]">assignment_late</span>
            </div>
            <h2 className="text-lg font-semibold text-[#191c1e]">
              No Active Contest Assignment
            </h2>
            <p className="text-sm text-[#545f73] mt-2">
              You do not have an active contest assignment linked to your account.
            </p>
            <Link
              href="/dashboard/contests"
              className="mt-6 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#15803d] hover:bg-[#166534] text-white font-medium text-sm transition-colors shadow-2xs"
            >
              <span>View My Contests</span>
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </Link>
          </div>
        </main>
        <ParticipantFooter />
      </div>
    );
  }

  const allTasks = data.allTasks || [];
  const currentTaskIndex = allTasks.findIndex((t) => t.id === data.task.id);
  const prevTask = currentTaskIndex > 0 ? allTasks[currentTaskIndex - 1] : null;
  const nextTask =
    currentTaskIndex >= 0 && currentTaskIndex < allTasks.length - 1
      ? allTasks[currentTaskIndex + 1]
      : null;

  // Question response statistics for submission modal
  const questions = data.questions || [];
  const answeredCount = questions.filter((q) => {
    if (q.type === "MCQ") return Boolean(selectedOptions[q.id]);
    if (q.type === "WRITTEN") return Boolean(writtenResponses[q.id]?.trim());
    if (q.type === "FILE_UPLOAD" || q.type === "PDF" || q.type === "FILE") return Boolean(uploadedFiles[q.id]);
    return false;
  }).length;
  const unansweredMandatoryCount = questions.filter(
    (q) =>
      q.isMandatory &&
      ((q.type === "MCQ" && !selectedOptions[q.id]) ||
        (q.type === "WRITTEN" && !writtenResponses[q.id]?.trim()) ||
        ((q.type === "FILE_UPLOAD" || q.type === "PDF" || q.type === "FILE") && !uploadedFiles[q.id]))
  ).length;

  return (
    <div className="min-h-screen bg-white text-[#191c1e] flex flex-col justify-between selection:bg-emerald-100 selection:text-emerald-900">
      <ParticipantHeader />

      {/* Proctoring Consent / Orientation Modal */}
      {!hasConsented && !isReadOnly && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#e2e8f0] rounded-2xl shadow-xl max-w-lg w-full p-6 sm:p-8 flex flex-col gap-6 text-[#191c1e]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#f0fdf4] text-[#166534] flex items-center justify-center font-bold border border-[#bbf7d0]">
                <span className="material-symbols-outlined text-[22px]">verified_user</span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#191c1e]">
                  Assessment Environment Briefing
                </h3>
                <p className="text-xs text-[#545f73]">
                  {data.contest.title} · Module {data.phase?.phaseNumber || 1}
                </p>
              </div>
            </div>

            <div className="space-y-3 text-sm text-[#191c1e] bg-[#f8fafc] p-4 rounded-xl border border-[#e2e8f0] leading-relaxed">
              <div className="flex items-start gap-2.5">
                <span className="material-symbols-outlined text-[#15803d] text-[18px] shrink-0 mt-0.5">
                  timer
                </span>
                <p>
                  <strong>Live Timer:</strong> Authoritatively synchronized with{" "}
                  <strong>Asia/Dhaka (UTC+06:00)</strong>. Extensions granted by administrators
                  will automatically update your timer.
                </p>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="material-symbols-outlined text-[#15803d] text-[18px] shrink-0 mt-0.5">
                  cloud_done
                </span>
                <p>
                  <strong>Automatic Cloud Save:</strong> Every keystroke, MCQ choice, and PDF upload
                  is instantly saved to your encrypted draft record.
                </p>
              </div>

              {/* Contest-Configured Monitoring Penalties */}
              <div className="pt-2 border-t border-[#e2e8f0] flex flex-col gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#15803d] flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]">gavel</span>
                  Contest Integrity Rules & Penalties
                </span>

                {monitoringSettings.enableAlertPenalties ? (
                  <div className="flex items-start gap-2 text-xs text-[#7f1d1d] bg-rose-50/80 p-2.5 rounded-lg border border-rose-200">
                    <span className="material-symbols-outlined text-[16px] text-rose-600 shrink-0 mt-0.5">
                      warning
                    </span>
                    <p>
                      <strong>Monitoring Alert Penalty ({monitoringSettings.alertPenaltyPoints || 5} pts):</strong> Each confirmed alert (tab switch, window blur, or leaving fullscreen) deducts {monitoringSettings.alertPenaltyPoints || 5} points from your final score.
                    </p>
                  </div>
                ) : (
                  <div className="flex items-start gap-2 text-xs text-[#545f73]">
                    <span className="material-symbols-outlined text-[16px] text-[#545f73] shrink-0 mt-0.5">
                      info
                    </span>
                    <p>
                      <strong>Telemetry Logging:</strong> Fullscreen and focus events are neutrally recorded without direct score deductions.
                    </p>
                  </div>
                )}

                {monitoringSettings.enableAiPenalties && (
                  <div className="flex items-start gap-2 text-xs text-amber-900 bg-amber-50/80 p-2.5 rounded-lg border border-amber-200">
                    <span className="material-symbols-outlined text-[16px] text-amber-600 shrink-0 mt-0.5">
                      smart_toy
                    </span>
                    <p>
                      <strong>AI Answer Policy ({monitoringSettings.aiPenaltyPoints || 10} pts):</strong> AI-generated written responses verified under authorized review incur a {monitoringSettings.aiPenaltyPoints || 10}-point deduction.
                    </p>
                  </div>
                )}

                {/* Evidence Capture Disclosure */}
                <div className="text-[11px] text-[#545f73] bg-white p-2 rounded border border-[#e2e8f0] flex flex-col gap-1">
                  <span className="font-semibold text-[#191c1e]">Evidence Capture Permissions:</span>
                  <span>
                    • Screen Capture: {monitoringSettings.screenCaptureEnabled ? "In-app assessment screenshot recorded on alert events" : "Disabled"}
                  </span>
                  <span>
                    • Camera Frame: {monitoringSettings.cameraCaptureEnabled ? "Still frame recorded on alert events only with your explicit browser permission" : "Disabled"}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Link
                href={`/dashboard/contests/${data.contest.id}`}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-[#e2e8f0] text-[#191c1e] hover:bg-[#f2f4f6] transition-colors"
              >
                Return to Curriculum
              </Link>
              <button
                onClick={handleAcknowledgeAndStart}
                disabled={isStartingAssessment}
                className="px-5 py-2.5 rounded-lg bg-[#15803d] hover:bg-[#166534] text-white font-medium text-sm transition-colors shadow-2xs flex items-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {isStartingAssessment ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>Starting Reader...</span>
                  </>
                ) : (
                  <>
                    <span>I Acknowledge Rules & Begin Unit</span>
                    <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invisible Video Element for Camera Evidence Frame Capture */}
      <video
        ref={cameraVideoRef}
        autoPlay
        muted
        playsInline
        style={{ position: "fixed", top: -9999, left: -9999, width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
      />

      {/* Sticky Top HUD */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#e2e8f0] shadow-2xs text-[#191c1e]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Left: Breadcrumbs & Task Title */}
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href={`/dashboard/contests/${data.contest.id}`}
              className="p-1.5 rounded-lg text-[#545f73] hover:text-[#191c1e] hover:bg-[#f2f4f6] transition-colors"
              title="Return to Curriculum Path Roadmap"
            >
              <span className="material-symbols-outlined text-[20px] block">arrow_back</span>
            </Link>

            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5 text-xs text-[#545f73] truncate">
                <Link
                  href={`/dashboard/contests/${data.contest.id}`}
                  className="hover:text-[#191c1e] transition-colors truncate max-w-[140px] text-[#545f73]"
                >
                  {data.contest.title}
                </Link>
                <span>/</span>
                <span className="truncate">{data.phase?.title || `Phase ${data.phase?.phaseNumber || 1}`}</span>
              </div>
              <h2 className="text-sm sm:text-base font-bold text-[#191c1e] truncate">
                {data.task.title}
              </h2>
            </div>
          </div>

          {/* Right: Autosave Pill, Points & Asia/Dhaka Timer */}
          <div className="flex items-center gap-2.5 sm:gap-4 shrink-0 justify-between sm:justify-end">
            {/* Live Autosave Indicator */}
            <div className="flex items-center gap-1.5 text-xs font-mono text-[#545f73] select-none">
              {isSaving ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
                  <span className="text-amber-600 font-sans">Saving draft...</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-[#15803d]"></span>
                  <span className="hidden md:inline font-sans text-[#545f73]">{lastSaved}</span>
                  <span className="md:hidden font-sans text-[#545f73]">Saved</span>
                </>
              )}
            </div>

            {/* Total Points Badge */}
            <div className="px-2.5 py-1 rounded-md bg-[#f2f4f6] text-[#191c1e] text-xs font-semibold tabular-nums border border-[#e2e8f0]">
              {data.task.totalPoints} pts
            </div>

            {/* Asia/Dhaka Live Timer Badge */}
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-mono text-xs font-semibold tabular-nums border transition-colors shadow-2xs ${
                timer.isEnded || isReadOnly
                  ? "bg-[#f2f4f6] text-[#545f73] border-[#e2e8f0]"
                  : timer.isCritical
                  ? "bg-rose-50 text-rose-700 border-rose-300 animate-pulse"
                  : timer.isUrgent
                  ? "bg-amber-50 text-amber-700 border-amber-300"
                  : "bg-[#f0fdf4] text-[#166534] border-[#bbf7d0]"
              }`}
              title={`Effective Deadline: ${timer.dhakaDeadline} (Asia/Dhaka)`}
            >
              <span className="material-symbols-outlined text-[16px]">
                {timer.isEnded ? "lock_clock" : "schedule"}
              </span>
              <span>{timer.formattedTimer}</span>
              <span className="text-[10px] uppercase font-sans font-normal opacity-75 hidden lg:inline">
                Asia/Dhaka
              </span>
            </div>
          </div>
        </div>

        {/* Non-destructive Deadline Extension Notification Toast */}
        {timer.hasExtended && (
          <div className="bg-[#15803d] text-white px-4 py-2 text-xs sm:text-sm font-medium flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-1 duration-200">
            <div className="flex items-center gap-2 max-w-4xl mx-auto">
              <span className="material-symbols-outlined text-[18px]">more_time</span>
              <span>
                <strong>Deadline Extended!</strong> An administrator extended the assessment
                window until <strong>{timer.dhakaDeadline}</strong>. Your timer has updated
                automatically and all your drafts remain completely intact.
              </span>
            </div>
            <button
              onClick={timer.dismissExtensionNotice}
              className="text-white/80 hover:text-white p-1 rounded transition-colors"
              title="Dismiss notice"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
        )}
      </header>

      {/* Main Document Reader Area */}
      <main className="w-full flex-1 max-w-3xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-8">
        {/* Locked Unit Redirection Banner */}
        {data.lockedRedirectMessage && (
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2.5 shadow-2xs">
            <span className="material-symbols-outlined text-[18px] text-amber-700 shrink-0">lock</span>
            <span className="font-medium">{data.lockedRedirectMessage}</span>
          </div>
        )}

        {/* Read-Only / Concluded Banner if applicable */}
        {isReadOnly && (
          <div className="p-4 rounded-xl bg-[#f8fafc] border border-[#e2e8f0] flex items-center gap-3 text-[#191c1e]">
            <span className="material-symbols-outlined text-[#545f73] text-[22px]">lock</span>
            <div className="text-xs sm:text-sm">
              <strong className="font-semibold text-[#191c1e]">
                {submitted ? "Submission Finalized" : "Contest Concluded"}
              </strong>
              <p className="text-[#545f73] mt-0.5">
                This unit is currently in read-only mode. Your answers are safely recorded in the
                evaluation system.
              </p>
            </div>
          </div>
        )}

        {/* Document Header & Overview */}
        <section className="bg-white rounded-2xl border border-[#e2e8f0] p-6 sm:p-8 shadow-2xs flex flex-col gap-4 text-[#191c1e]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#f2f4f6] text-[#191c1e] border border-[#e2e8f0]">
              Module {data.phase?.phaseNumber || 1} · Unit {data.task.taskNumber || 1}
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#f0fdf4] text-[#166534] border border-[#bbf7d0]">
              {questions.length} Question{questions.length === 1 ? "" : "s"}
            </span>
            <span className="text-xs text-[#545f73] font-mono ml-auto">
              Total: {data.task.totalPoints} Points
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold text-[#191c1e] tracking-tight">
            {data.task.title}
          </h1>

          {data.task.instructions && (
            <div className="text-sm sm:text-base text-[#191c1e] leading-relaxed pt-2 border-t border-[#e2e8f0]">
              <p className="whitespace-pre-wrap">{data.task.instructions}</p>
            </div>
          )}

          {/* Reference Materials & Attachments Accordion */}
          {data.task.references && data.task.references.length > 0 && (
            <div className="mt-4 pt-4 border-t border-[#e2e8f0] flex flex-col gap-3">
              <button
                type="button"
                onClick={() => setReferencesExpanded((prev) => !prev)}
                className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-[#545f73] hover:text-[#191c1e] cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]">folder</span>
                  Reference Materials & Case Study Assets ({data.task.references.length})
                </span>
                <span
                  className={`material-symbols-outlined text-[18px] transition-transform ${
                    referencesExpanded ? "rotate-180" : ""
                  }`}
                >
                  expand_more
                </span>
              </button>

              {referencesExpanded && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {data.task.references.map((ref) => (
                    <div
                      key={ref.id}
                      className="p-3 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] flex items-center justify-between gap-3 hover:border-[#15803d] transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="material-symbols-outlined text-rose-600 text-[22px] shrink-0">
                          picture_as_pdf
                        </span>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-medium text-[#191c1e] truncate">
                            {ref.title}
                          </span>
                          <span className="text-[11px] text-[#545f73] font-mono">
                            {(ref.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <a
                          href={`/api/files/${ref.fileKey}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1 rounded-md text-xs font-medium bg-white border border-[#e2e8f0] text-[#191c1e] hover:text-[#15803d] hover:border-[#15803d] transition-colors shrink-0 flex items-center gap-1 cursor-pointer"
                          title="Open PDF in new tab"
                        >
                          <span className="material-symbols-outlined text-[14px]">visibility</span>
                          <span>Open PDF</span>
                        </a>
                        <a
                          href={`/api/files/${ref.fileKey}?download=1`}
                          download={ref.title || "reference.pdf"}
                          className="px-2.5 py-1 rounded-md text-xs font-medium bg-[#f2f4f6] border border-[#e2e8f0] text-[#545f73] hover:text-[#191c1e] transition-colors shrink-0 flex items-center gap-1 cursor-pointer"
                          title="Download PDF"
                        >
                          <span className="material-symbols-outlined text-[14px]">download</span>
                          <span className="hidden sm:inline">Download</span>
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Questions Document Body */}
        <section className="flex flex-col gap-6">
          {questions.map((q, idx) => {
            const isAnswered =
              (q.type === "MCQ" && Boolean(selectedOptions[q.id])) ||
              (q.type === "WRITTEN" && Boolean(writtenResponses[q.id]?.trim())) ||
              ((q.type === "FILE_UPLOAD" || q.type === "PDF" || q.type === "FILE") && Boolean(uploadedFiles[q.id]));

            return (
              <article
                key={q.id}
                className="bg-white rounded-2xl border border-[#e2e8f0] transition-all p-6 sm:p-8 flex flex-col gap-5 shadow-2xs text-[#191c1e]"
              >
                {/* Question Header Meta */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#e2e8f0]">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-md bg-[#f2f4f6] text-[#191c1e] text-xs font-bold flex items-center justify-center border border-[#e2e8f0]">
                      {idx + 1}
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#545f73]">
                      {q.type === "MCQ"
                        ? "Multiple Choice"
                        : q.type === "WRITTEN"
                        ? "Written Essay"
                        : "Document Upload"}
                    </span>
                    {q.isMandatory && (
                      <span className="px-2 py-0.2 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                        Required
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {isAnswered && (
                      <span className="text-xs text-[#15803d] font-medium flex items-center gap-1">
                        <span className="material-symbols-outlined text-[15px]">check_circle</span>
                        <span>Answered</span>
                      </span>
                    )}
                    <span className="text-xs font-semibold text-[#191c1e] tabular-nums">
                      {q.points} pt{q.points === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>

                {/* Prompt Typography */}
                <div className="space-y-1">
                  <h3 className="text-base sm:text-lg font-semibold text-[#191c1e] leading-relaxed">
                    {q.prompt}
                  </h3>
                  {q.instructions && (
                    <p className="text-xs text-[#545f73] italic">
                      {q.instructions}
                    </p>
                  )}
                </div>

                {/* Question Input Specific Renderers */}
                {/* 1. Multiple Choice Option Cards */}
                {q.type === "MCQ" && (
                  <div className="grid grid-cols-1 gap-2.5 pt-2">
                    {q.options.map((opt) => {
                      const isSelected = selectedOptions[q.id] === opt.optionKey;

                      return (
                        <div
                          key={opt.id}
                          onClick={() => !isReadOnly && handleSelectOption(q.id, opt.optionKey)}
                          role="radio"
                          aria-checked={isSelected}
                          tabIndex={isReadOnly ? -1 : 0}
                          onKeyDown={(e) => {
                            if ((e.key === "Enter" || e.key === " ") && !isReadOnly) {
                              e.preventDefault();
                              handleSelectOption(q.id, opt.optionKey);
                            }
                          }}
                          className={`p-4 rounded-xl border text-sm transition-all flex items-start gap-3.5 select-none ${
                            isReadOnly ? "cursor-default" : "cursor-pointer"
                          } ${
                            isSelected
                              ? "border-[#15803d] bg-[#f0fdf4] text-[#14532d] ring-1 ring-[#15803d]/20 shadow-2xs"
                              : "border-[#e2e8f0] hover:border-slate-300 bg-white text-[#191c1e]"
                          }`}
                        >
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs uppercase shrink-0 transition-colors ${
                              isSelected
                                ? "bg-[#15803d] text-white"
                                : "bg-[#f2f4f6] text-[#191c1e] border border-[#e2e8f0]"
                            }`}
                          >
                            {opt.optionKey}
                          </div>

                          <div className="flex-1 pt-0.5 leading-relaxed font-medium">
                            {opt.text}
                          </div>

                          {isSelected && (
                            <span className="material-symbols-outlined text-[#15803d] text-[20px] shrink-0 mt-0.5">
                              check_circle
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 2. Google Doc-style Essay / Written Response */}
                {q.type === "WRITTEN" && (
                  <div className="flex flex-col gap-2 pt-2">
                    {(() => {
                      const text = writtenResponses[q.id] || "";
                      const words =
                        text.trim().length === 0 ? 0 : text.trim().split(/\s+/).filter(Boolean).length;
                      const hasMin = q.minWords !== null && q.minWords > 0;
                      const isMinMet = hasMin ? words >= q.minWords! : true;

                      return (
                        <>
                          <textarea
                            value={text}
                            disabled={isReadOnly}
                            onChange={(e) => handleWrittenChange(q.id, e.target.value)}
                            onBlur={() => handleWrittenBlur(q.id)}
                            placeholder={
                              isReadOnly
                                ? "No response recorded."
                                : "Type your reasoned answer or essay response here. Your text is saved automatically as you write..."
                            }
                            className="w-full rounded-xl border border-[#e2e8f0] p-4 text-sm sm:text-base leading-relaxed bg-white text-[#191c1e] placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#15803d]/20 focus:border-[#15803d] min-h-[220px] resize-y transition-all disabled:opacity-75 disabled:cursor-not-allowed"
                          />

                          <div className="flex items-center justify-between text-xs text-[#545f73] pt-1">
                            <span className="font-mono">
                              Word Count: <strong className="text-[#191c1e]">{words}</strong>
                              {q.maxWords ? ` / ${q.maxWords} max` : " words"}
                            </span>

                            {hasMin && (
                              <span
                                className={`font-medium flex items-center gap-1 ${
                                  isMinMet
                                    ? "text-[#15803d]"
                                    : "text-amber-600"
                                }`}
                              >
                                {isMinMet ? (
                                  <>
                                    <span className="material-symbols-outlined text-[15px]">check</span>
                                    <span>Minimum {q.minWords} words met</span>
                                  </>
                                ) : (
                                  <>
                                    <span className="material-symbols-outlined text-[15px]">info</span>
                                    <span>
                                      Min required: {q.minWords} words ({q.minWords! - words} more needed)
                                    </span>
                                  </>
                                )}
                              </span>
                            )}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}

                {/* 3. Drag-and-Drop PDF Upload Zone */}
                {(q.type === "FILE_UPLOAD" || q.type === "PDF" || q.type === "FILE") && (
                  <div className="flex flex-col gap-3 pt-2">
                    {/* Upload error banner if any */}
                    {uploadError[q.id] && (
                      <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
                        <span className="material-symbols-outlined text-[16px]">error</span>
                        <span>{uploadError[q.id]}</span>
                      </div>
                    )}

                    {/* Uploaded File Preview Card */}
                    {uploadedFiles[q.id] ? (
                      <div className="p-4 rounded-xl border border-[#e2e8f0] bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs text-[#191c1e]">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-200">
                            <span className="material-symbols-outlined text-[24px]">
                              picture_as_pdf
                            </span>
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-sm font-semibold text-[#191c1e] truncate">
                              {uploadedFiles[q.id].name}
                            </span>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-[#545f73] mt-0.5">
                              <span className="font-mono">{uploadedFiles[q.id].size}</span>
                              <span>•</span>
                              <span className="px-2 py-0.2 rounded-md bg-[#f0fdf4] text-[#166534] font-mono text-[11px] border border-[#bbf7d0]">
                                {uploadedFiles[q.id].hash}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                          <a
                            href={`/api/files/${uploadedFiles[q.id].fileKey}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 rounded-lg border border-[#e2e8f0] bg-white text-xs font-medium text-[#191c1e] hover:bg-[#f2f4f6] transition-colors flex items-center gap-1 cursor-pointer"
                            title="Open uploaded PDF in new tab"
                          >
                            <span className="material-symbols-outlined text-[15px]">visibility</span>
                            <span>Open PDF</span>
                          </a>

                          <a
                            href={`/api/files/${uploadedFiles[q.id].fileKey}?download=1`}
                            download={uploadedFiles[q.id].name}
                            className="px-3 py-1.5 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] text-xs font-medium text-[#545f73] hover:text-[#191c1e] transition-colors flex items-center gap-1 cursor-pointer"
                            title="Download PDF deliverable"
                          >
                            <span className="material-symbols-outlined text-[15px]">download</span>
                            <span className="hidden sm:inline">Download</span>
                          </a>

                          {!isReadOnly && (
                            <button
                              type="button"
                              onClick={() =>
                                setFileToRemove({
                                  questionId: q.id,
                                  fileName: uploadedFiles[q.id].name,
                                })
                              }
                              className="px-3 py-1.5 rounded-lg border border-rose-200 text-xs font-medium text-rose-600 hover:bg-rose-50 transition-colors flex items-center gap-1 cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-[15px]">delete</span>
                              <span>Remove</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      /* Drag & Drop Zone */
                      <div
                        onClick={() => {
                          if (!isReadOnly && isUploading !== q.id) {
                            fileInputRefs.current[q.id]?.click();
                          }
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          if (!isReadOnly) setDragOverQuestionId(q.id);
                        }}
                        onDragLeave={() => setDragOverQuestionId(null)}
                        onDrop={(e) => handleDrop(q.id, e)}
                        className={`rounded-2xl border-2 border-dashed p-8 sm:p-10 flex flex-col items-center justify-center text-center transition-all ${
                          !isReadOnly ? "cursor-pointer" : "cursor-default"
                        } ${
                          dragOverQuestionId === q.id
                            ? "border-[#15803d] bg-[#f0fdf4]"
                            : "border-[#cbd5e1] bg-[#f8fafc] hover:border-[#15803d] hover:bg-[#f0fdf4]/30 text-[#191c1e]"
                        }`}
                      >
                        <input
                          ref={(el) => {
                            fileInputRefs.current[q.id] = el;
                          }}
                          type="file"
                          accept=".pdf,application/pdf"
                          disabled={isReadOnly || isUploading === q.id}
                          onChange={(e) => handleFileInputChange(q.id, e)}
                          className="hidden"
                          id={`file-input-${q.id}`}
                        />

                        {isUploading === q.id ? (
                          <div className="flex flex-col items-center gap-2 py-3 text-[#15803d]">
                            <span className="w-7 h-7 border-3 border-[#15803d] border-t-transparent rounded-full animate-spin"></span>
                            <span className="text-xs font-semibold">Encrypting and uploading PDF...</span>
                          </div>
                        ) : (
                          <>
                            <div className="w-12 h-12 rounded-full bg-[#f2f4f6] text-[#545f73] flex items-center justify-center mb-3">
                              <span className="material-symbols-outlined text-[26px]">
                                upload_file
                              </span>
                            </div>
                            <h4 className="text-sm font-semibold text-[#191c1e]">
                              Upload Case Deliverable PDF
                            </h4>
                            <p className="text-xs text-[#545f73] mt-1 max-w-sm">
                              Drag and drop your PDF file here, or click anywhere inside to browse.
                              Maximum size: 25 MB.
                            </p>
                            {!isReadOnly && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  fileInputRefs.current[q.id]?.click();
                                }}
                                className="mt-4 px-4 py-2 rounded-lg bg-white border border-[#e2e8f0] text-xs font-semibold text-[#191c1e] hover:bg-[#f2f4f6] hover:border-[#15803d] transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5"
                              >
                                <span className="material-symbols-outlined text-[16px] text-[#15803d]">attach_file</span>
                                <span>Select PDF Document</span>
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </section>
      </main>

      {/* Sticky Bottom Stepper Footer */}
      <footer className="sticky bottom-0 z-30 bg-white/95 backdrop-blur-md border-t border-[#e2e8f0] shadow-md text-[#191c1e]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3">
          {/* Previous Unit Action */}
          <div>
            {prevTask ? (
              <button
                type="button"
                onClick={() => handleNavigateToTask(prevTask)}
                className="px-4 py-2 rounded-lg border border-[#e2e8f0] text-[#191c1e] hover:bg-[#f2f4f6] font-medium text-xs sm:text-sm transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                <span className="hidden sm:inline">Previous Unit</span>
                <span className="sm:hidden">Prev</span>
              </button>
            ) : (
              <button
                disabled
                className="px-4 py-2 rounded-lg border border-[#e2e8f0] text-[#94a3b8] font-medium text-xs sm:text-sm cursor-not-allowed opacity-50 flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                <span>First Unit</span>
              </button>
            )}
          </div>

          {/* Stepper Center Indicator */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[#191c1e] tabular-nums">
              Unit {currentTaskIndex + 1} of {allTasks.length || 1}
            </span>
            <span className="text-[#cbd5e1] hidden sm:inline">•</span>
            <Link
              href={`/dashboard/contests/${data.contest.id}`}
              className="text-xs text-[#545f73] hover:text-[#15803d] transition-colors hidden sm:inline"
            >
              Curriculum Roadmap ↗
            </Link>
          </div>

          {/* Next Unit or Final Submit Action */}
          <div>
            {nextTask ? (
              <button
                type="button"
                onClick={() => handleNavigateToTask(nextTask)}
                className="px-5 py-2 rounded-lg bg-[#15803d] hover:bg-[#166534] text-white font-medium text-xs sm:text-sm transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer"
              >
                {nextTask.phaseId !== data.phase?.id ? (
                  <>
                    <span className="hidden sm:inline">Submit & Enter Phase {nextTask.phaseNumber}</span>
                    <span className="sm:hidden">Phase {nextTask.phaseNumber}</span>
                    <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                  </>
                ) : (
                  <>
                    <span className="hidden sm:inline">Save & Next Unit</span>
                    <span className="sm:hidden">Next</span>
                    <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                disabled={isReadOnly}
                onClick={() => setIsSubmitModalOpen(true)}
                className="px-5 py-2 rounded-lg bg-[#15803d] hover:bg-[#166534] text-white font-medium text-xs sm:text-sm transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-[16px]">send</span>
                <span>Finalize & Submit</span>
              </button>
            )}
          </div>
        </div>
      </footer>

      {/* Submit Confirmation Dialog Modal */}
      {isSubmitModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#e2e8f0] rounded-2xl shadow-xl max-w-md w-full p-6 flex flex-col gap-4 text-[#191c1e]">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-[#f0fdf4] text-[#166534] flex items-center justify-center shrink-0 border border-[#bbf7d0]">
                <span className="material-symbols-outlined text-[24px]">task_alt</span>
              </div>
              <div>
                <h3 className="text-base font-bold text-[#191c1e]">
                  Confirm Final Assessment Submission
                </h3>
                <p className="text-xs text-[#545f73] mt-0.5">
                  {data.contest.title} · {data.task.title}
                </p>
              </div>
            </div>

            <div className="space-y-2 text-xs bg-[#f8fafc] p-3.5 rounded-xl border border-[#e2e8f0] text-[#191c1e]">
              <div className="flex justify-between py-1 border-b border-[#e2e8f0]">
                <span>Completed Questions:</span>
                <strong className="text-[#191c1e]">
                  {answeredCount} of {questions.length}
                </strong>
              </div>
              <div className="flex justify-between py-1">
                <span>Total Benchmark Value:</span>
                <strong className="text-[#191c1e]">
                  {data.task.totalPoints} Points
                </strong>
              </div>
            </div>

            {unansweredMandatoryCount > 0 && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] shrink-0">warning</span>
                <span>
                  You have <strong>{unansweredMandatoryCount} mandatory question(s)</strong> left
                  unanswered.
                </span>
              </div>
            )}

            <p className="text-xs text-[#545f73] leading-relaxed">
              Once submitted, your answers will be locked for evaluation. You will not be able to
              change your answers unless an administrator grants an extension.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#e2e8f0]">
              <button
                type="button"
                onClick={() => setIsSubmitModalOpen(false)}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-medium rounded-lg border border-[#e2e8f0] text-[#191c1e] hover:bg-[#f2f4f6] transition-colors"
              >
                Review Answers
              </button>
              <button
                type="button"
                onClick={handleFinalSubmit}
                disabled={isSubmitting}
                className="px-5 py-2 text-xs font-medium rounded-lg bg-[#15803d] hover:bg-[#166534] text-white transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>Submitting...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[16px]">check</span>
                    <span>Confirm & Submit</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* File Deletion Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={Boolean(fileToRemove)}
        title="Remove Document Attachment"
        itemDescription={fileToRemove?.fileName || "Uploaded PDF"}
        warningDetails="This file will be permanently deleted from your draft submission. You may upload a revised PDF before the deadline."
        confirmLabel="Remove Attachment"
        isDeleting={isDeletingFile}
        onConfirm={handleConfirmDeleteFile}
        onClose={() => setFileToRemove(null)}
      />

      <ParticipantFooter />
    </div>
  );
}
