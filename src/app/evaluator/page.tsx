"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/ui/brand-logo";
import {
  getEvaluatorDashboardDataAction,
  gradeSubmissionAction,
  getParticipantMonitoringForEvaluatorAction,
  deductMarksAction,
  type SubmissionToGrade,
  type EvaluatorContestItem,
  type ParticipantMonitoringEventView,
  type ParticipantMonitoringDataResult,
} from "@/app/actions/evaluator-actions";
import { formatMarksInWords } from "@/lib/marks-formatter";
import { getMonitoringEvidenceAction } from "@/app/actions/monitoring-actions";
import { logoutAction, getCurrentUserSession } from "@/app/actions/auth-actions";
import { SessionPayload } from "@/lib/auth";

export default function EvaluatorConsolePage() {
  const [submissions, setSubmissions] = useState<SubmissionToGrade[]>([]);
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [activeContestsCount, setActiveContestsCount] = useState(0);
  const [assignedContests, setAssignedContests] = useState<EvaluatorContestItem[]>([]);
  const [selectedContestFilter, setSelectedContestFilter] = useState<string>("ALL");
  const [filterTab, setFilterTab] = useState<"All" | "Pending" | "Graded">("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  // Grading Drawer State
  const [selectedSub, setSelectedSub] = useState<SubmissionToGrade | null>(null);
  const [questionScores, setQuestionScores] = useState<Record<string, number>>({});
  const [questionFeedback, setQuestionFeedback] = useState<Record<string, string>>({});
  const [overallFeedback, setOverallFeedback] = useState<string>("");
  const [rubricScores, setRubricScores] = useState<Record<string, number>>({});
  const [rubricComments, setRubricComments] = useState<Record<string, string>>({});
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [gradeSuccessMsg, setGradeSuccessMsg] = useState<string | null>(null);
  const [gradeErrorMsg, setGradeErrorMsg] = useState<string | null>(null);

  // Drawer Sub-tab: "grading" | "monitoring"
  const [drawerTab, setDrawerTab] = useState<"grading" | "monitoring">("grading");

  // Feature 1: Monitoring Telemetry State
  const [monitoringData, setMonitoringData] = useState<ParticipantMonitoringDataResult | null>(null);
  const [isLoadingMonitoring, setIsLoadingMonitoring] = useState(false);
  const [monitoringError, setMonitoringError] = useState<string | null>(null);
  const [evidenceViewerOpen, setEvidenceViewerOpen] = useState(false);
  const [selectedEvidence, setSelectedEvidence] = useState<{
    eventType: string;
    screenCapture: string | null;
    cameraCapture: string | null;
    timestamp: string;
  } | null>(null);
  const [isLoadingEvidence, setIsLoadingEvidence] = useState(false);

  // Feature 2: Safe Marks Deduction State
  const [isDeductModalOpen, setIsDeductModalOpen] = useState(false);
  const [isDeductConfirmOpen, setIsDeductConfirmOpen] = useState(false);
  const [deductAmountInput, setDeductAmountInput] = useState<string>("");
  const [deductReasonInput, setDeductReasonInput] = useState<string>("");
  const [idempotencyKey, setIdempotencyKey] = useState<string>("");
  const [confirmPublishedOverride, setConfirmPublishedOverride] = useState(false);
  const [isSubmittingDeduction, setIsSubmittingDeduction] = useState(false);
  const [deductError, setDeductError] = useState<string | null>(null);
  const [deductSuccessMsg, setDeductSuccessMsg] = useState<string | null>(null);

  const loadData = useCallback(async (contestId?: string) => {
    try {
      setIsLoading(true);
      const activeFilter = contestId !== undefined ? contestId : selectedContestFilter;
      const [dashData, userSession] = await Promise.all([
        getEvaluatorDashboardDataAction(activeFilter && activeFilter !== "ALL" ? activeFilter : undefined),
        getCurrentUserSession(),
      ]);
      setSubmissions(dashData.submissions);
      setActiveContestsCount(dashData.activeContestsCount);
      setAssignedContests(dashData.assignedContests);
      setSession(userSession);
    } catch (err) {
      console.error("Failed to load evaluator dashboard:", err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedContestFilter]);

  useEffect(() => {
    loadData(selectedContestFilter);
  }, [selectedContestFilter, loadData]);

  const fetchMonitoring = useCallback(async (submissionId: string) => {
    try {
      setIsLoadingMonitoring(true);
      setMonitoringError(null);
      const res = await getParticipantMonitoringForEvaluatorAction(submissionId);
      if (res.success) {
        setMonitoringData(res);
      } else {
        setMonitoringError(res.error || "Failed to load monitoring events.");
      }
    } catch (err) {
      console.error("Error loading monitoring:", err);
      setMonitoringError(err instanceof Error ? err.message : "Failed to load monitoring data.");
    } finally {
      setIsLoadingMonitoring(false);
    }
  }, []);

  const handleInspectEvidence = async (contestId: string, eventId: string) => {
    try {
      setIsLoadingEvidence(true);
      const res = await getMonitoringEvidenceAction({ contestId, eventId });
      if (res.success && res.evidence) {
        setSelectedEvidence(res.evidence);
        setEvidenceViewerOpen(true);
      } else {
        alert(res.error || "Evidence could not be retrieved.");
      }
    } catch {
      alert("Failed to load evidence.");
    } finally {
      setIsLoadingEvidence(false);
    }
  };

  const handleOpenDeductForm = () => {
    setDeductAmountInput("");
    setDeductReasonInput("");
    setDeductError(null);
    setConfirmPublishedOverride(false);
    setIdempotencyKey(`deduct_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`);
    setIsDeductModalOpen(true);
  };

  const handleProceedToConfirmDeduction = () => {
    setDeductError(null);
    const amount = Number(deductAmountInput);
    if (isNaN(amount) || amount <= 0) {
      setDeductError("Please enter a valid positive deduction amount in marks (e.g. 5, 10, 55).");
      return;
    }

    if (Math.round(amount * 100) / 100 !== amount) {
      setDeductError("Deduction amount cannot have more than 2 decimal places.");
      return;
    }

    if (!deductReasonInput.trim() || deductReasonInput.trim().length < 5) {
      setDeductError("A mandatory deduction reason of at least 5 characters is required.");
      return;
    }

    const currentScore = selectedSub?.finalScore !== null && selectedSub?.finalScore !== undefined
      ? Number(selectedSub.finalScore)
      : liveFinalScore;

    if (amount > currentScore) {
      setDeductError(`Deduction amount (${amount} marks) exceeds candidate's eligible score (${currentScore} marks). Cannot reduce below 0.`);
      return;
    }

    // Passed client validation -> open Confirmation Dialog
    setIsDeductModalOpen(false);
    setIsDeductConfirmOpen(true);
  };

  const handleApplyDeduction = async () => {
    if (!selectedSub) return;
    try {
      setIsSubmittingDeduction(true);
      setDeductError(null);

      const res = await deductMarksAction({
        submissionId: selectedSub.id,
        amount: Number(deductAmountInput),
        reason: deductReasonInput.trim(),
        idempotencyKey,
        confirmPublishedOverride,
      });

      if (res.success) {
        setDeductSuccessMsg(
          `Successfully deducted ${res.deductionAmount} marks (${res.spelledMarks || formatMarksInWords(res.deductionAmount || 0)}). Adjusted score: ${res.adjustedScore} marks.`
        );
        setIsDeductConfirmOpen(false);
        if (res.adjustedScore !== undefined) {
          setSelectedSub((prev) =>
            prev ? { ...prev, finalScore: res.adjustedScore! } : null
          );
        }
        await loadData();
        await fetchMonitoring(selectedSub.id);
      } else {
        setDeductError(res.error || "Failed to apply marks deduction.");
      }
    } catch (err) {
      console.error("Deduction error:", err);
      setDeductError(err instanceof Error ? err.message : "Failed to apply marks deduction.");
    } finally {
      setIsSubmittingDeduction(false);
    }
  };

  const openGradingDrawer = (sub: SubmissionToGrade) => {
    setSelectedSub(sub);
    setDrawerTab("grading");
    setGradeSuccessMsg(null);
    setGradeErrorMsg(null);
    setDeductError(null);
    setDeductSuccessMsg(null);
    setMonitoringData(null);
    setMonitoringError(null);

    // Pre-fetch candidate attempt monitoring
    fetchMonitoring(sub.id);

    // 1. Populate individual question scores & feedback
    const initialQScore: Record<string, number> = {};
    const initialQFeedback: Record<string, string> = {};

    sub.answers.forEach((ans) => {
      initialQScore[ans.questionId] =
        ans.score !== null ? Number(ans.score) : 0;
      initialQFeedback[ans.questionId] = ans.feedback || "";
    });

    // 2. Populate rubrics
    const initialRubricScores: Record<string, number> = {};
    const initialRubricComments: Record<string, string> = {};

    sub.rubrics.forEach((r) => {
      initialRubricScores[r.id] =
        r.currentScoreAwarded !== undefined
          ? r.currentScoreAwarded
          : Math.round(r.maxPoints * 0.85);
      initialRubricComments[r.id] = r.currentComments || "";
    });

    setQuestionScores(initialQScore);
    setQuestionFeedback(initialQFeedback);
    setOverallFeedback(sub.overallFeedback || "");
    setRubricScores(initialRubricScores);
    setRubricComments(initialRubricComments);
  };

  // Live Score Computations
  const { autoScore, manualScore, liveFinalScore } = useMemo(() => {
    if (!selectedSub) {
      return { autoScore: 0, manualScore: 0, liveFinalScore: 0 };
    }

    // MCQ Auto-graded total
    const auto = selectedSub.answers
      .filter((a) => a.questionType === "MCQ")
      .reduce((sum, a) => sum + (a.score !== null ? Number(a.score) : 0), 0);

    let manual = 0;
    if (selectedSub.rubrics.length > 0) {
      let weightedTotal = 0;
      selectedSub.rubrics.forEach((r) => {
        const awarded = rubricScores[r.id] ?? 0;
        const bounded = Math.max(0, Math.min(awarded, r.maxPoints));
        weightedTotal += (bounded / r.maxPoints) * r.weightPercentage;
      });
      const rubricTaskIds = new Set(selectedSub.rubrics.map((r) => r.taskId).filter(Boolean));
      const nonRubricQuestionsScore = selectedSub.answers
        .filter((a) => a.questionType !== "MCQ" && (!a.taskId || !rubricTaskIds.has(a.taskId)))
        .reduce((sum, a) => sum + (questionScores[a.questionId] ?? 0), 0);
      manual = Math.round((weightedTotal + nonRubricQuestionsScore) * 100) / 100;
    } else {
      manual = selectedSub.answers
        .filter((a) => a.questionType !== "MCQ")
        .reduce((sum, a) => sum + (questionScores[a.questionId] ?? 0), 0);
    }

    const finalTotal = Math.min(
      selectedSub.taskPoints,
      Math.max(0, Math.round((auto + manual) * 100) / 100)
    );

    return { autoScore: auto, manualScore: manual, liveFinalScore: finalTotal };
  }, [selectedSub, rubricScores, questionScores]);

  const handleSaveEvaluation = async (isDraft: boolean) => {
    if (!selectedSub) return;

    try {
      if (isDraft) {
        setIsSavingDraft(true);
      } else {
        setIsFinalizing(true);
      }
      setGradeSuccessMsg(null);
      setGradeErrorMsg(null);

      // Validate marks against maximum question bounds
      for (const ans of selectedSub.answers) {
        if (ans.questionType !== "MCQ") {
          const val = questionScores[ans.questionId] ?? 0;
          if (val < 0 || val > ans.questionPoints) {
            setGradeErrorMsg(
              `Question 0${ans.questionNumber} score (${val}) must be between 0 and maximum ${ans.questionPoints} points.`
            );
            return;
          }
        }
      }

      // Validate rubric bounds
      for (const r of selectedSub.rubrics) {
        const val = rubricScores[r.id] ?? 0;
        if (val < 0 || val > r.maxPoints) {
          setGradeErrorMsg(
            `Rubric "${r.name}" score (${val}) must be between 0 and maximum ${r.maxPoints} points.`
          );
          return;
        }
      }

      const questionGradesPayload = selectedSub.answers
        .filter((a) => a.questionType !== "MCQ")
        .map((a) => ({
          questionId: a.questionId,
          score: Number(questionScores[a.questionId] ?? 0),
          feedback: questionFeedback[a.questionId] || undefined,
        }));

      const rubricScoresPayload = selectedSub.rubrics.map((r) => ({
        rubricId: r.id,
        scoreAwarded: Number(rubricScores[r.id] ?? 0),
        comments: rubricComments[r.id] || undefined,
      }));

      const res = await gradeSubmissionAction({
        submissionId: selectedSub.id,
        evaluatorEmail: session?.email || "evaluator@career-edge.internal",
        isDraft,
        overallFeedback,
        questionGrades: questionGradesPayload,
        rubricScores: rubricScoresPayload,
      });

      if (res.success) {
        if (isDraft) {
          setGradeSuccessMsg(
            `Draft saved! Status: Grading in Progress • Manual: ${res.manualGradeScore} pts • Score: ${res.finalScore}/${selectedSub.taskPoints}`
          );
        } else {
          setGradeSuccessMsg(
            `Evaluation finalized! Locked Score: ${res.finalScore}/${selectedSub.taskPoints} (Auto: ${res.autoGradeScore} pts • Manual: ${res.manualGradeScore} pts)`
          );
        }
        await loadData();
      } else {
        setGradeErrorMsg(res.error || "Failed to record evaluation.");
      }
    } catch (err) {
      console.error("Grading workflow error:", err);
      setGradeErrorMsg(err instanceof Error ? err.message : "Failed to record evaluation.");
    } finally {
      setIsSavingDraft(false);
      setIsFinalizing(false);
    }
  };

  const filteredSubmissions = submissions.filter((s) => {
    const matchesFilter =
      filterTab === "All" ||
      (filterTab === "Pending" &&
        (s.status === "SUBMITTED" || s.status === "GRADING_IN_PROGRESS")) ||
      (filterTab === "Graded" && (s.status === "GRADED" || s.status === "PUBLISHED"));
    const matchesSearch =
      s.candidateName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.candidateEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.candidateId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.contestTitle.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const pendingCount = submissions.filter(
    (s) => s.status === "SUBMITTED" || s.status === "GRADING_IN_PROGRESS"
  ).length;
  const gradedCount = submissions.filter(
    (s) => s.status === "GRADED" || s.status === "PUBLISHED"
  ).length;

  return (
    <div className="min-h-screen bg-surface flex flex-col justify-between">
      {/* Top Header */}
      <header className="h-16 w-full border-b border-[#e2e8f0] bg-surface-container-lowest/90 backdrop-blur-xl px-4 sm:px-gutter flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-4">
          <BrandLogo showSubtitle={true} subtitleText="Evaluator Console" />
          <nav className="hidden md:flex items-center gap-1 pl-4 border-l border-[#e2e8f0]">
            <Link
              href="/evaluator"
              className="px-3 py-1.5 rounded font-label-xs font-semibold bg-primary-container text-on-primary shadow-xs"
            >
              Grading
            </Link>
            <Link
              href="/evaluator/monitoring"
              className="px-3 py-1.5 rounded font-label-xs font-medium bg-surface-container-low hover:bg-surface-container-high text-on-surface border border-[#e2e8f0] flex items-center gap-1.5 transition-colors"
            >
              <span className="material-symbols-outlined text-[16px] text-primary-container">sensors</span>
              <span>Monitoring</span>
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-surface-container-low border border-[#e2e8f0] font-label-xs text-secondary">
            <span className="w-2 h-2 rounded-full bg-primary-container"></span>
            <span className="font-semibold text-on-surface">Evaluator Console:</span>
            <span>{session?.email || "evaluator@career-edge.internal"}</span>
          </div>

          <button
            onClick={async () => {
              await logoutAction();
              window.location.href = "/login";
            }}
            className="px-3 py-1.5 rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-label-xs border border-[#e2e8f0] flex items-center gap-1 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">logout</span>
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-space-lg flex flex-col gap-space-lg flex-1">
        {/* Welcome Section */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-space-md pb-space-sm border-b border-[#e2e8f0]">
          <div>
            <div className="flex items-center gap-2 font-label-xs uppercase tracking-wider text-secondary mb-1">
              <span>Academic Evaluation Panel</span>
              <span>•</span>
              <span className="text-primary-container font-semibold">Standardized Grading</span>
            </div>
            <h1 className="font-display-lg text-on-surface tracking-tight">
              Assigned Submissions
            </h1>
            <p className="font-body-md text-secondary mt-1">
              Review candidate written answers, inspect uploaded PDF deliverables, score rubrics, and finalize assessment marks.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={() => loadData()}
              className="px-3 py-1.5 rounded bg-surface-container-lowest hover:bg-surface-container text-on-surface font-label-sm border border-[#e2e8f0] shadow-2xs flex items-center gap-1.5 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px] text-secondary">refresh</span>
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Stats Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-md">
          <div className="p-4 bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs flex justify-between items-center">
            <div>
              <span className="font-label-xs uppercase tracking-wider text-secondary block">
                Active Contests
              </span>
              <span className="font-display-lg text-on-surface tabular-nums">
                {activeContestsCount}
              </span>
              <span className="font-label-xs text-secondary mt-0.5 block">
                {assignedContests.length} assigned challenge{assignedContests.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="w-10 h-10 rounded bg-surface-container-low flex items-center justify-center text-primary-container">
              <span className="material-symbols-outlined text-[20px]">workspace_premium</span>
            </div>
          </div>

          <div className="p-4 bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs flex justify-between items-center">
            <div>
              <span className="font-label-xs uppercase tracking-wider text-secondary block">
                Total Submissions
              </span>
              <span className="font-display-lg text-on-surface tabular-nums">
                {submissions.length}
              </span>
              <span className="font-label-xs text-secondary mt-0.5 block">
                {pendingCount} pending review
              </span>
            </div>
            <div className="w-10 h-10 rounded bg-surface-container-low flex items-center justify-center text-secondary">
              <span className="material-symbols-outlined text-[20px]">assignment</span>
            </div>
          </div>

          <div className="p-4 bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs flex justify-between items-center">
            <div>
              <span className="font-label-xs uppercase tracking-wider text-secondary block">
                Pending Evaluation
              </span>
              <span className="font-display-lg text-amber-600 tabular-nums">
                {pendingCount}
              </span>
              <span className="font-label-xs text-amber-700/80 mt-0.5 block">
                Awaiting manual review & locking
              </span>
            </div>
            <div className="w-10 h-10 rounded bg-amber-50 flex items-center justify-center text-amber-600">
              <span className="material-symbols-outlined text-[20px]">pending_actions</span>
            </div>
          </div>

          <div className="p-4 bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs flex justify-between items-center">
            <div>
              <span className="font-label-xs uppercase tracking-wider text-secondary block">
                Evaluations Finalized
              </span>
              <span className="font-display-lg text-primary-container tabular-nums">
                {gradedCount}
              </span>
              <span className="font-label-xs text-secondary mt-0.5 block">
                Scores locked & certified
              </span>
            </div>
            <div className="w-10 h-10 rounded bg-[#dcfce7] flex items-center justify-center text-primary-container">
              <span className="material-symbols-outlined text-[20px]">verified</span>
            </div>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="bg-surface-container-lowest p-space-sm rounded-lg border border-[#e2e8f0] shadow-2xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-space-sm">
          <div className="flex-1 flex items-center gap-space-sm px-space-sm">
            <span className="material-symbols-outlined text-[20px] text-secondary">search</span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by candidate name, email, ID, challenge..."
              className="w-full bg-transparent text-on-surface placeholder:text-secondary font-body-sm focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {assignedContests.length > 0 && (
              <select
                value={selectedContestFilter}
                onChange={(e) => setSelectedContestFilter(e.target.value)}
                className="px-3 py-1 rounded bg-surface-container-low border border-[#e2e8f0] font-label-xs text-on-surface focus:outline-none focus:border-primary-container"
              >
                <option value="ALL">All Contests ({assignedContests.length})</option>
                {assignedContests.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} ({c.uiStatus})
                  </option>
                ))}
              </select>
            )}

            <div className="flex items-center bg-surface-container-low p-0.5 rounded border border-[#e2e8f0]">
              {(["All", "Pending", "Graded"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setFilterTab(tab)}
                  className={`px-3 py-1 rounded font-label-xs transition-colors cursor-pointer ${
                    filterTab === tab
                      ? "bg-surface-container-lowest text-on-surface font-semibold shadow-2xs"
                      : "text-secondary hover:text-on-surface"
                  }`}
                >
                  {tab}{" "}
                  {tab === "Pending" && `(${pendingCount})`}
                  {tab === "Graded" && `(${gradedCount})`}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Submissions List */}
        <div className="bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs divide-y divide-[#f1f5f9] overflow-hidden">
          {isLoading ? (
            <div className="p-12 text-center text-secondary">
              <div className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-primary-container border-t-transparent rounded-full animate-spin"></span>
                <span>Loading assigned candidate submissions...</span>
              </div>
            </div>
          ) : filteredSubmissions.length > 0 ? (
            filteredSubmissions.map((sub) => {
              const isGraded = sub.status === "GRADED" || sub.status === "PUBLISHED";
              const isDraft = sub.status === "GRADING_IN_PROGRESS";

              return (
                <div
                  key={sub.id}
                  className="p-space-lg flex flex-col sm:flex-row sm:items-center justify-between gap-space-md hover:bg-surface-container-low/40 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-label-xs font-semibold ${
                          isGraded
                            ? "bg-[#dcfce7] text-[#166534]"
                            : isDraft
                            ? "bg-amber-100 text-amber-800"
                            : "bg-surface-container-high text-secondary"
                        }`}
                      >
                        {isGraded ? (
                          <span className="material-symbols-outlined text-[13px]">verified</span>
                        ) : isDraft ? (
                          <span className="material-symbols-outlined text-[13px]">edit_note</span>
                        ) : (
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                        )}
                        {isGraded ? "Graded" : isDraft ? "Draft Saved" : "Ready for Grading"}
                      </span>
                      <span className="font-label-xs text-secondary">• {sub.contestTitle}</span>
                      <span className="font-label-xs text-secondary">• {sub.phaseTitle}</span>
                    </div>

                    <h3 className="font-headline-sm text-on-surface truncate">
                      {sub.candidateName}
                    </h3>
                    <p className="font-body-sm text-secondary mt-0.5 truncate">
                      {sub.candidateId} • {sub.institution} • {sub.candidateEmail}
                    </p>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2.5 font-label-sm text-secondary">
                      <span>Submitted: {sub.submittedAt ? new Date(sub.submittedAt).toLocaleString() : "Recent"}</span>
                      {sub.finalScore !== null && (
                        <span className="font-semibold text-primary-container">
                          Score: {sub.finalScore}/{sub.taskPoints} pts
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => openGradingDrawer(sub)}
                      className="inline-flex items-center gap-1.5 px-space-md py-2 bg-primary-container hover:bg-[#166534] text-on-primary font-label-md rounded shadow-2xs transition-colors cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        {isGraded ? "edit_note" : isDraft ? "edit" : "rate_review"}
                      </span>
                      <span>
                        {isGraded ? "Review Grade" : isDraft ? "Continue Grading" : "Grade Submission"}
                      </span>
                    </button>
                  </div>
                </div>
              );
            })
          ) : assignedContests.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center justify-center">
              <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center text-secondary mb-3">
                <span className="material-symbols-outlined text-[24px]">assignment_late</span>
              </div>
              <h4 className="font-headline-sm font-semibold text-on-surface">No Contests Assigned</h4>
              <p className="font-body-sm text-secondary mt-1 max-w-md mx-auto">
                Platform administrators have not assigned any assessment contests or candidate cohorts to your account yet.
              </p>
            </div>
          ) : (
            <div className="p-12 text-center flex flex-col items-center justify-center">
              <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center text-secondary mb-3">
                <span className="material-symbols-outlined text-[24px]">assignment_turned_in</span>
              </div>
              <h4 className="font-headline-sm font-semibold text-on-surface">No Submissions Found</h4>
              <p className="font-body-sm text-secondary mt-1">
                {filterTab === "Pending"
                  ? "All assigned submissions have been evaluated."
                  : "No submissions match your search query."}
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Evaluator Manual Grading & Rubric Drawer */}
      {selectedSub && (
        <div
          className="fixed inset-0 bg-inverse-surface/40 backdrop-blur-xs z-50 flex justify-end transition-opacity"
          onClick={() => setSelectedSub(null)}
        >
          <div
            className="w-full max-w-2xl bg-surface-container-lowest h-full shadow-2xl p-space-lg flex flex-col justify-between border-l border-[#e2e8f0]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col overflow-y-auto pr-1">
              {/* Header */}
              <div className="flex items-center justify-between pb-space-md border-b border-[#f1f5f9]">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded font-label-xs font-semibold ${
                      selectedSub.status === "GRADED"
                        ? "bg-[#dcfce7] text-[#166534]"
                        : selectedSub.status === "GRADING_IN_PROGRESS"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-surface-container-high text-secondary"
                    }`}
                  >
                    {selectedSub.status === "GRADED"
                      ? "Graded"
                      : selectedSub.status === "GRADING_IN_PROGRESS"
                      ? "Draft Saved"
                      : "Ready for Review"}
                  </span>
                  <span className="font-label-xs text-secondary font-mono">
                    ID: #{selectedSub.id.slice(0, 8)}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedSub(null)}
                  className="p-1 rounded text-secondary hover:text-on-surface hover:bg-surface-container cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>

              {/* Candidate Info */}
              <h2 className="font-headline-lg text-on-surface tracking-tight mt-3">
                {selectedSub.candidateName}
              </h2>
              <p className="font-body-md text-secondary mt-0.5">
                {selectedSub.candidateId} • {selectedSub.institution} • {selectedSub.contestTitle} ({selectedSub.phaseTitle})
              </p>

              {/* Drawer View Navigation Tabs */}
              <div className="flex items-center gap-1 my-3 p-1 bg-surface-container-low rounded-lg border border-[#e2e8f0]">
                <button
                  type="button"
                  onClick={() => setDrawerTab("grading")}
                  className={`flex-1 py-1.5 px-3 rounded-md font-label-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    drawerTab === "grading"
                      ? "bg-surface-container-lowest text-on-surface shadow-xs border border-[#e2e8f0]"
                      : "text-secondary hover:text-on-surface"
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">rate_review</span>
                  <span>Answer Sheet & Grading</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDrawerTab("monitoring");
                    if (selectedSub) fetchMonitoring(selectedSub.id);
                  }}
                  className={`flex-1 py-1.5 px-3 rounded-md font-label-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    drawerTab === "monitoring"
                      ? "bg-surface-container-lowest text-on-surface shadow-xs border border-[#e2e8f0]"
                      : "text-secondary hover:text-on-surface"
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">visibility</span>
                  <span>Participant Monitoring</span>
                  {monitoringData?.alertCount ? (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-red-100 text-red-700">
                      {monitoringData.alertCount} alerts
                    </span>
                  ) : null}
                </button>
              </div>

              {/* Live Assessment Score Dashboard & Deduction Control */}
              <div className="my-2 p-3 bg-surface-container-low rounded-lg border border-[#e2e8f0] flex flex-col gap-2.5">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 bg-surface-container-lowest rounded border border-[#e2e8f0]">
                    <span className="font-label-xs uppercase tracking-wider text-secondary block">
                      Auto-Graded (MCQ)
                    </span>
                    <span className="font-headline-sm font-bold text-on-surface tabular-nums">
                      {autoScore} pts
                    </span>
                  </div>
                  <div className="p-2 bg-surface-container-lowest rounded border border-[#e2e8f0]">
                    <span className="font-label-xs uppercase tracking-wider text-secondary block">
                      {selectedSub.rubrics.length > 0 ? "Rubric Weighted" : "Manual Marks"}
                    </span>
                    <span className="font-headline-sm font-bold text-primary-container tabular-nums">
                      {manualScore} pts
                    </span>
                  </div>
                  <div className="p-2 bg-surface-container-lowest rounded border border-primary-container/30">
                    <span className="font-label-xs uppercase tracking-wider text-primary-container font-semibold block">
                      Eligible Score
                    </span>
                    <span className="font-headline-sm font-bold text-primary-container tabular-nums">
                      {selectedSub.finalScore !== null ? Number(selectedSub.finalScore) : liveFinalScore} / {selectedSub.taskPoints} pts
                    </span>
                  </div>
                </div>

                {/* Safe Marks Deduction Control Strip */}
                <div className="p-2.5 bg-surface-container-lowest rounded-md border border-[#e2e8f0] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-secondary">
                    <span>
                      Original: <strong className="text-on-surface font-mono">{liveFinalScore} marks</strong>
                    </span>
                    {(monitoringData?.totalPenalties ?? 0) > 0 && (
                      <>
                        <span>•</span>
                        <span className="text-red-700 font-semibold">
                          Deductions: <strong className="font-mono">-{monitoringData?.totalPenalties} marks</strong>
                        </span>
                        <span>•</span>
                        <span className="text-[#166534] font-semibold">
                          Adjusted:{" "}
                          <strong className="font-mono">
                            {selectedSub.finalScore !== null
                              ? Number(selectedSub.finalScore)
                              : Math.max(0, liveFinalScore - (monitoringData?.totalPenalties ?? 0))}{" "}
                            marks
                          </strong>
                        </span>
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenDeductForm}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-label-xs font-bold transition-colors cursor-pointer shrink-0"
                  >
                    <span className="material-symbols-outlined text-[16px]">remove_circle_outline</span>
                    <span>Deduct Marks</span>
                  </button>
                </div>
              </div>

              {gradeSuccessMsg && (
                <div className="my-2 p-3 rounded bg-[#dcfce7] border border-primary-container/40 text-[#166534] font-label-sm font-semibold flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">verified</span>
                  <span>{gradeSuccessMsg}</span>
                </div>
              )}

              {gradeErrorMsg && (
                <div className="my-2 p-3 rounded bg-red-50 border border-red-200 text-red-700 font-label-sm font-semibold flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">error</span>
                  <span>{gradeErrorMsg}</span>
                </div>
              )}

              {deductSuccessMsg && (
                <div className="my-2 p-3 rounded bg-[#dcfce7] border border-primary-container/40 text-[#166534] font-label-sm font-semibold flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">gavel</span>
                  <span>{deductSuccessMsg}</span>
                </div>
              )}

              {deductError && (
                <div className="my-2 p-3 rounded bg-red-50 border border-red-200 text-red-700 font-label-sm font-semibold flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">error</span>
                  <span>{deductError}</span>
                </div>
              )}

              {/* View Tab 1: Answer Sheet & Evaluation */}
              {drawerTab === "grading" && (
                <>
                  {/* Question-by-Question Grading */}
              <div className="my-space-md flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="font-label-xs uppercase tracking-wider text-secondary font-semibold">
                    Question-by-Question Evaluation ({selectedSub.answers.length} items)
                  </span>
                  <span className="font-label-xs text-secondary">
                    Total Task Points: {selectedSub.taskPoints}
                  </span>
                </div>

                {selectedSub.answers.map((ans, i) => {
                  const currentScore = questionScores[ans.questionId] ?? 0;
                  const isScoreInvalid = currentScore < 0 || currentScore > ans.questionPoints;

                  return (
                    <div
                      key={ans.id}
                      className="p-3.5 bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs text-body-sm flex flex-col gap-2.5"
                    >
                      <div className="flex items-center justify-between text-secondary font-label-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-on-surface">
                            Question 0{ans.questionNumber || i + 1}
                          </span>
                          <span
                            className={`px-2 py-0.2 rounded text-[10px] font-semibold uppercase tracking-wider ${
                              ans.questionType === "MCQ"
                                ? "bg-slate-100 text-slate-700"
                                : ans.questionType === "WRITTEN"
                                ? "bg-blue-50 text-blue-700"
                                : "bg-purple-50 text-purple-700"
                            }`}
                          >
                            {ans.questionType}
                          </span>
                        </div>
                        <span className="font-medium text-secondary">
                          Max: {ans.questionPoints} pts
                        </span>
                      </div>

                      <p className="font-body-sm text-on-surface font-medium">
                        {ans.questionPrompt}
                      </p>

                      {ans.questionInstructions && (
                        <p className="font-body-xs text-secondary text-xs italic">
                          {ans.questionInstructions}
                        </p>
                      )}

                      {/* MCQ Response Review */}
                      {ans.questionType === "MCQ" && (
                        <div className="p-3 rounded bg-surface-container-low border border-[#e2e8f0] flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <span className="font-label-sm text-on-surface">
                              Candidate Selected:{" "}
                              <strong className="text-primary-container">
                                Option {ans.selectedOption || "None"}
                              </strong>
                            </span>
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${
                                ans.isCorrect
                                  ? "bg-[#dcfce7] text-[#166534]"
                                  : "bg-red-50 text-red-700"
                              }`}
                            >
                              <span className="material-symbols-outlined text-[14px]">
                                {ans.isCorrect ? "check_circle" : "cancel"}
                              </span>
                              <span>
                                {ans.isCorrect
                                  ? `Correct (+${ans.score ?? ans.questionPoints} pts)`
                                  : "Incorrect (0 pts)"}
                              </span>
                            </span>
                          </div>
                          <p className="text-[11px] text-secondary">
                            Auto-graded on server submission using verified answer key.
                          </p>
                        </div>
                      )}

                      {/* Written Response Review & Grading */}
                      {ans.questionType === "WRITTEN" && (
                        <div className="flex flex-col gap-2.5">
                          {ans.writtenText ? (
                            <div className="p-3 rounded bg-surface-container-low font-body-sm text-on-surface text-xs leading-relaxed italic border border-[#e2e8f0]">
                              &quot;{ans.writtenText}&quot;
                              <div className="text-secondary font-label-xs mt-1.5 not-italic flex items-center gap-3">
                                <span>Word Count: <strong>{ans.wordCount ?? 0} words</strong></span>
                                {(ans.minWords || ans.maxWords) && (
                                  <span>
                                    Target: {ans.minWords ?? 0} – {ans.maxWords ?? "No limit"} words
                                  </span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="p-2.5 rounded bg-surface-container-low text-xs text-secondary italic border border-[#e2e8f0]">
                              No written response was provided by candidate.
                            </div>
                          )}

                          {/* Manual Question Scoring Input */}
                          <div className="p-3 bg-surface-container-low rounded border border-[#e2e8f0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex-1">
                              <label className="block font-label-xs font-semibold text-on-surface mb-1">
                                Award Marks (0 – {ans.questionPoints} pts)
                              </label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min="0"
                                  max={ans.questionPoints}
                                  step="1"
                                  value={questionScores[ans.questionId] ?? 0}
                                  onChange={(e) =>
                                    setQuestionScores({
                                      ...questionScores,
                                      [ans.questionId]: Number(e.target.value),
                                    })
                                  }
                                  className={`w-24 px-2.5 py-1 text-sm rounded bg-surface-container-lowest border font-mono font-bold ${
                                    isScoreInvalid
                                      ? "border-red-500 text-red-600 focus:outline-red-500"
                                      : "border-[#e2e8f0] text-on-surface focus:outline-primary-container"
                                  }`}
                                />
                                <span className="font-label-xs text-secondary">
                                  / {ans.questionPoints} max points
                                </span>
                              </div>
                              {isScoreInvalid && (
                                <span className="text-[11px] text-red-600 mt-0.5 block">
                                  Score cannot exceed {ans.questionPoints} points or be negative.
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Question Feedback Textarea */}
                          <div>
                            <label className="block font-label-xs text-secondary font-semibold mb-1">
                              Question Evaluator Feedback
                            </label>
                            <textarea
                              rows={2}
                              value={questionFeedback[ans.questionId] || ""}
                              onChange={(e) =>
                                setQuestionFeedback({
                                  ...questionFeedback,
                                  [ans.questionId]: e.target.value,
                                })
                              }
                              placeholder="Add specific qualitative feedback for this response..."
                              className="w-full px-2.5 py-1.5 text-xs rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface focus:outline-none focus:border-primary-container"
                            />
                          </div>
                        </div>
                      )}

                      {/* File Upload Review & Grading */}
                      {ans.questionType === "FILE_UPLOAD" && (
                        <div className="flex flex-col gap-2.5">
                          {ans.fileKey ? (
                            <div className="p-3 bg-surface-container-low rounded border border-[#e2e8f0] text-xs flex items-center justify-between">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span className="material-symbols-outlined text-red-600 text-[26px] shrink-0">
                                  picture_as_pdf
                                </span>
                                <div className="min-w-0">
                                  <span className="font-semibold text-on-surface block truncate">
                                    {ans.fileName || "Candidate_Deliverable.pdf"}
                                  </span>
                                  <span className="text-[11px] text-secondary font-mono">
                                    Verified Secure PDF Deliverable
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <a
                                  href={`/api/files/${ans.fileKey}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-surface-container-lowest hover:bg-surface-container text-on-surface font-label-xs font-semibold border border-[#e2e8f0] shadow-2xs transition-colors shrink-0 cursor-pointer"
                                  title="Open PDF in new browser tab"
                                >
                                  <span className="material-symbols-outlined text-[16px]">visibility</span>
                                  <span>Open PDF</span>
                                </a>
                                <a
                                  href={`/api/files/${ans.fileKey}?download=1`}
                                  download={ans.fileName || "Candidate_Deliverable.pdf"}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-label-xs font-medium border border-[#e2e8f0] transition-colors shrink-0 cursor-pointer"
                                  title="Download PDF to your computer"
                                >
                                  <span className="material-symbols-outlined text-[16px]">download</span>
                                  <span className="hidden sm:inline">Download</span>
                                </a>
                              </div>
                            </div>
                          ) : (
                            <div className="p-2.5 rounded bg-surface-container-low text-xs text-secondary italic border border-[#e2e8f0]">
                              No file attachment was uploaded by candidate.
                            </div>
                          )}

                          {/* Manual Question Scoring Input */}
                          <div className="p-3 bg-surface-container-low rounded border border-[#e2e8f0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex-1">
                              <label className="block font-label-xs font-semibold text-on-surface mb-1">
                                Award Marks (0 – {ans.questionPoints} pts)
                              </label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min="0"
                                  max={ans.questionPoints}
                                  step="1"
                                  value={questionScores[ans.questionId] ?? 0}
                                  onChange={(e) =>
                                    setQuestionScores({
                                      ...questionScores,
                                      [ans.questionId]: Number(e.target.value),
                                    })
                                  }
                                  className={`w-24 px-2.5 py-1 text-sm rounded bg-surface-container-lowest border font-mono font-bold ${
                                    isScoreInvalid
                                      ? "border-red-500 text-red-600 focus:outline-red-500"
                                      : "border-[#e2e8f0] text-on-surface focus:outline-primary-container"
                                  }`}
                                />
                                <span className="font-label-xs text-secondary">
                                  / {ans.questionPoints} max points
                                </span>
                              </div>
                              {isScoreInvalid && (
                                <span className="text-[11px] text-red-600 mt-0.5 block">
                                  Score cannot exceed {ans.questionPoints} points or be negative.
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Deliverable Feedback */}
                          <div>
                            <label className="block font-label-xs text-secondary font-semibold mb-1">
                              Deliverable Evaluator Feedback
                            </label>
                            <textarea
                              rows={2}
                              value={questionFeedback[ans.questionId] || ""}
                              onChange={(e) =>
                                setQuestionFeedback({
                                  ...questionFeedback,
                                  [ans.questionId]: e.target.value,
                                })
                              }
                              placeholder="Feedback on structure, pitch deck design, and quantitative accuracy..."
                              className="w-full px-2.5 py-1.5 text-xs rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface focus:outline-none focus:border-primary-container"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Rubric Evaluation Form (Rendered if criteria are configured) */}
              {selectedSub.rubrics.length > 0 && (
                <div className="my-space-md flex flex-col gap-3">
                  <div className="flex items-center justify-between pb-1 border-b border-[#e2e8f0]">
                    <span className="font-label-xs uppercase tracking-wider text-secondary font-semibold">
                      Standardized Rubric Scoring Matrix ({selectedSub.rubrics.length} Criteria)
                    </span>
                    <span className="font-label-xs text-primary-container font-semibold">
                      Weighted Total: {manualScore} / 100
                    </span>
                  </div>

                  <div className="space-y-3">
                    {selectedSub.rubrics.map((r) => {
                      const currentVal = rubricScores[r.id] ?? Math.round(r.maxPoints * 0.85);

                      return (
                        <div
                          key={r.id}
                          className="p-3 bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs flex flex-col gap-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-label-md font-semibold text-on-surface">
                              {r.name}
                            </span>
                            <span className="font-label-xs text-secondary">
                              Max {r.maxPoints} pts ({r.weightPercentage}% weight)
                            </span>
                          </div>

                          {r.description && (
                            <p className="font-body-xs text-secondary text-xs">{r.description}</p>
                          )}

                          <div className="flex items-center gap-3 pt-1">
                            <input
                              type="range"
                              min="0"
                              max={r.maxPoints}
                              step="1"
                              value={currentVal}
                              onChange={(e) =>
                                setRubricScores({
                                  ...rubricScores,
                                  [r.id]: Number(e.target.value),
                                })
                              }
                              className="flex-1 accent-primary-container cursor-pointer"
                            />
                            <span className="font-mono text-on-surface font-bold text-sm w-16 text-right">
                              {currentVal} / {r.maxPoints}
                            </span>
                          </div>

                          <input
                            type="text"
                            placeholder="Criterion evaluation notes..."
                            value={rubricComments[r.id] || ""}
                            onChange={(e) =>
                              setRubricComments({
                                ...rubricComments,
                                [r.id]: e.target.value,
                              })
                            }
                            className="px-2.5 py-1 text-xs rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface focus:outline-none focus:border-primary-container"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Overall Evaluator Feedback */}
              <div className="my-space-sm p-3 bg-surface-container-lowest rounded-lg border border-[#e2e8f0] flex flex-col gap-1.5">
                <label className="font-label-xs uppercase tracking-wider text-secondary font-semibold">
                  Overall Candidate Feedback & Executive Summary
                </label>
                <textarea
                  rows={3}
                  value={overallFeedback}
                  onChange={(e) => setOverallFeedback(e.target.value)}
                  placeholder="Comprehensive feedback notes for the participant and academic audit..."
                  className="w-full px-2.5 py-1.5 text-xs rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface focus:outline-none focus:border-primary-container"
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-space-md flex items-center justify-end gap-space-sm border-t border-[#f1f5f9] mt-3">
                <button
                  type="button"
                  onClick={() => setSelectedSub(null)}
                  className="px-space-md py-2 rounded bg-surface-container-high hover:bg-surface-container text-on-surface font-label-md border border-[#e2e8f0] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSavingDraft || isFinalizing}
                  onClick={() => handleSaveEvaluation(true)}
                  className="px-space-md py-2 rounded bg-surface-container-lowest hover:bg-surface-container text-on-surface font-label-md font-medium border border-[#e2e8f0] shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSavingDraft && (
                    <span className="w-3.5 h-3.5 border-2 border-secondary border-t-transparent rounded-full animate-spin"></span>
                  )}
                  <span className="material-symbols-outlined text-[16px] text-secondary">save</span>
                  <span>Save Draft</span>
                </button>
                <button
                  type="button"
                  disabled={isSavingDraft || isFinalizing}
                  onClick={() => handleSaveEvaluation(false)}
                  className="px-space-md py-2 rounded bg-primary-container hover:bg-[#166534] text-on-primary font-label-md font-medium shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isFinalizing && (
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  )}
                  <span className="material-symbols-outlined text-[16px]">verified</span>
                  <span>Finalize & Lock Grade</span>
                </button>
              </div>
            </>
          )}

          {/* View Tab 2: Feature 1: Participant-Specific Monitoring */}
          {drawerTab === "monitoring" && (
            <div className="my-space-md flex flex-col gap-3">
              <div className="p-3 bg-surface-container-low rounded-lg border border-[#e2e8f0] flex items-center justify-between">
                <div>
                  <h4 className="font-label-sm font-bold text-on-surface">
                    Assessment Session Telemetry Stream
                  </h4>
                  <p className="font-body-xs text-secondary mt-0.5">
                    Scoped strictly to this candidate attempt ({selectedSub.candidateName} • {selectedSub.candidateId}).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => fetchMonitoring(selectedSub.id)}
                  disabled={isLoadingMonitoring}
                  className="p-1.5 rounded-md bg-surface-container-lowest hover:bg-surface-container border border-[#e2e8f0] text-secondary hover:text-on-surface cursor-pointer disabled:opacity-50"
                  title="Refresh Telemetry Events"
                >
                  <span className={`material-symbols-outlined text-[18px] ${isLoadingMonitoring ? "animate-spin" : ""}`}>
                    refresh
                  </span>
                </button>
              </div>

              {/* Summary Chips */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2.5 bg-surface-container-lowest rounded-md border border-[#e2e8f0]">
                  <span className="font-label-xs uppercase tracking-wider text-secondary block">
                    Monitoring Alerts
                  </span>
                  <span className="font-headline-sm font-bold text-red-600 tabular-nums">
                    {monitoringData?.alertCount ?? 0}
                  </span>
                </div>
                <div className="p-2.5 bg-surface-container-lowest rounded-md border border-[#e2e8f0]">
                  <span className="font-label-xs uppercase tracking-wider text-secondary block">
                    Total Penalties
                  </span>
                  <span className="font-headline-sm font-bold text-red-700 tabular-nums">
                    -{monitoringData?.totalPenalties ?? 0} marks
                  </span>
                </div>
                <div className="p-2.5 bg-surface-container-lowest rounded-md border border-[#e2e8f0]">
                  <span className="font-label-xs uppercase tracking-wider text-secondary block">
                    Recorded Events
                  </span>
                  <span className="font-headline-sm font-bold text-on-surface tabular-nums">
                    {monitoringData?.events?.length ?? 0}
                  </span>
                </div>
              </div>

              {/* Loading State */}
              {isLoadingMonitoring && (
                <div className="p-8 text-center flex flex-col items-center justify-center gap-2 bg-surface-container-low rounded-lg border border-[#e2e8f0]">
                  <span className="w-6 h-6 border-2 border-primary-container border-t-transparent rounded-full animate-spin"></span>
                  <span className="font-label-xs font-semibold text-secondary">
                    Loading verified telemetry events for candidate...
                  </span>
                </div>
              )}

              {/* Error State */}
              {monitoringError && (
                <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    <span className="material-symbols-outlined text-[18px]">error</span>
                    <span>{monitoringError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => fetchMonitoring(selectedSub.id)}
                    className="px-2.5 py-1 rounded bg-red-100 hover:bg-red-200 text-xs font-bold shrink-0 cursor-pointer"
                  >
                    Retry
                  </button>
                </div>
              )}

              {/* Empty State */}
              {!isLoadingMonitoring && !monitoringError && (!monitoringData?.events || monitoringData.events.length === 0) && (
                <div className="p-8 text-center flex flex-col items-center justify-center bg-surface-container-low rounded-lg border border-[#e2e8f0]">
                  <span className="material-symbols-outlined text-[32px] text-secondary mb-1">
                    verified_user
                  </span>
                  <h4 className="font-label-md font-bold text-on-surface">
                    No Telemetry Events Recorded
                  </h4>
                  <p className="font-body-xs text-secondary mt-1 max-w-sm">
                    No window switches, fullscreen exits, or proctoring alerts were recorded for this candidate attempt.
                  </p>
                </div>
              )}

              {/* Telemetry Event Stream */}
              {!isLoadingMonitoring && monitoringData?.events && monitoringData.events.length > 0 && (
                <div className="space-y-2">
                  {monitoringData.events.map((evt) => (
                    <div
                      key={evt.id}
                      className="p-3 bg-surface-container-lowest rounded-lg border border-[#e2e8f0] flex flex-col gap-1.5 shadow-2xs"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              evt.severity === "HIGH"
                                ? "bg-red-100 text-red-700"
                                : evt.severity === "WARNING"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {evt.eventType.replace(/_/g, " ")}
                          </span>
                          <span
                            className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase ${
                              evt.severity === "HIGH"
                                ? "bg-red-50 text-red-600 border border-red-200"
                                : evt.severity === "WARNING"
                                ? "bg-amber-50 text-amber-700 border border-amber-200"
                                : "bg-slate-50 text-slate-600 border border-slate-200"
                            }`}
                          >
                            {evt.severity}
                          </span>
                        </div>
                        <span className="font-mono text-[11px] text-secondary">
                          {new Date(evt.timestamp).toLocaleTimeString()}
                        </span>
                      </div>

                      <p className="text-xs text-on-surface font-medium">
                        {evt.status} {evt.details ? `— ${evt.details}` : ""}
                      </p>

                      <div className="flex items-center justify-between text-[11px] pt-1 border-t border-[#f1f5f9]">
                        {evt.penaltyApplied ? (
                          <span className="text-red-700 font-bold flex items-center gap-1">
                            <span className="material-symbols-outlined text-[13px]">gavel</span>
                            <span>-{evt.penaltyApplied} marks deduction applied</span>
                          </span>
                        ) : (
                          <span className="text-secondary italic">No automatic penalty applied</span>
                        )}

                        {evt.hasEvidence && evt.eventId && (
                          <button
                            type="button"
                            onClick={() => handleInspectEvidence(selectedSub.contestId, evt.eventId!)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold hover:bg-blue-100 border border-blue-200 text-[10px] cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[12px]">image</span>
                            <span>Inspect Evidence Still</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Applied Penalties Breakdown Card */}
              {monitoringData?.penalties && monitoringData.penalties.length > 0 && (
                <div className="mt-2 p-3 bg-red-50/60 rounded-lg border border-red-200/70">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-label-xs uppercase tracking-wider text-red-800 font-bold">
                      Recorded Score Deductions ({monitoringData.penalties.length})
                    </span>
                    <span className="font-label-xs font-bold text-red-700 font-mono">
                      Total: -{monitoringData.totalPenalties} marks
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {monitoringData.penalties.map((p) => (
                      <div
                        key={p.id}
                        className="p-2 rounded bg-surface-container-lowest border border-red-200 text-xs flex items-center justify-between gap-2"
                      >
                        <div>
                          <span className="font-bold text-red-700">-{p.points} marks</span>
                          <span className="text-secondary ml-1.5">• {p.reason}</span>
                        </div>
                        <span className="text-[10px] text-secondary font-mono shrink-0">
                          {new Date(p.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Switch to grading button */}
              <div className="pt-3 border-t border-[#f1f5f9] flex justify-end">
                <button
                  type="button"
                  onClick={() => setDrawerTab("grading")}
                  className="px-space-md py-2 rounded bg-surface-container-high hover:bg-surface-container text-on-surface font-label-md border border-[#e2e8f0] cursor-pointer"
                >
                  Return to Answer Sheet
                </button>
              </div>
            </div>
          )}
            </div>
          </div>
        </div>
      )}

      {/* Deduct Marks Form Modal */}
      {isDeductModalOpen && selectedSub && (
        <div
          className="fixed inset-0 bg-inverse-surface/50 backdrop-blur-xs z-60 flex items-center justify-center p-4"
          onClick={() => setIsDeductModalOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-surface-container-lowest rounded-xl shadow-2xl border border-[#e2e8f0] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-[#f1f5f9] flex items-center justify-between bg-surface-container-low">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-red-600 text-[22px]">remove_circle_outline</span>
                <h3 className="font-headline-sm font-bold text-on-surface">Deduct Marks</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsDeductModalOpen(false)}
                className="p-1 rounded text-secondary hover:text-on-surface hover:bg-surface-container cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="p-3 bg-surface-container-low rounded-lg border border-[#e2e8f0] text-xs space-y-1">
                <div>Candidate: <strong className="text-on-surface">{selectedSub.candidateName}</strong> ({selectedSub.candidateId})</div>
                <div>Assessment: <strong className="text-on-surface">{selectedSub.contestTitle}</strong> • {selectedSub.phaseTitle}</div>
                <div>
                  Current Eligible Score:{" "}
                  <strong className="text-primary-container font-mono">
                    {selectedSub.finalScore !== null ? Number(selectedSub.finalScore) : liveFinalScore} marks
                  </strong>
                </div>
              </div>

              {deductError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px] shrink-0">error</span>
                  <span>{deductError}</span>
                </div>
              )}

              <div>
                <label className="block font-label-xs font-bold text-on-surface uppercase tracking-wider mb-1">
                  Deduction Amount <span className="text-red-600">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0.25"
                    step="0.25"
                    max={selectedSub.finalScore !== null ? Number(selectedSub.finalScore) : liveFinalScore}
                    value={deductAmountInput}
                    onChange={(e) => {
                      setDeductAmountInput(e.target.value);
                      setDeductError(null);
                    }}
                    placeholder="e.g. 5, 10, 55"
                    className="w-full px-3 py-2 pr-16 text-sm rounded-lg bg-surface-container-low border border-[#e2e8f0] font-mono font-bold text-on-surface focus:outline-none focus:border-red-500"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-secondary uppercase font-mono">
                    marks
                  </span>
                </div>
                {deductAmountInput && !isNaN(Number(deductAmountInput)) && Number(deductAmountInput) > 0 && (
                  <p className="text-[11px] text-red-700 font-semibold mt-1">
                    Spelled out: <strong>{formatMarksInWords(Number(deductAmountInput))}</strong>
                  </p>
                )}
              </div>

              <div>
                <label className="block font-label-xs font-bold text-on-surface uppercase tracking-wider mb-1">
                  Mandatory Deduction Reason <span className="text-red-600">*</span>
                </label>
                <textarea
                  rows={3}
                  value={deductReasonInput}
                  onChange={(e) => {
                    setDeductReasonInput(e.target.value);
                    setDeductError(null);
                  }}
                  placeholder="Provide an explicit, reviewable rationale for this score deduction (e.g., unauthorized window focus switch, plagiarism, or rubric discrepancy)..."
                  className="w-full px-3 py-2 text-xs rounded-lg bg-surface-container-low border border-[#e2e8f0] text-on-surface focus:outline-none focus:border-red-500"
                />
                <span className="text-[10px] text-secondary">
                  Minimum 5 characters required for academic audit compliance.
                </span>
              </div>

              {/* Live Preview */}
              {deductAmountInput && !isNaN(Number(deductAmountInput)) && Number(deductAmountInput) > 0 && (
                <div className="p-3 bg-red-50/50 rounded-lg border border-red-200 text-xs flex items-center justify-between">
                  <div>
                    <span className="text-secondary block">Original Score</span>
                    <strong className="text-on-surface font-mono">
                      {selectedSub.finalScore !== null ? Number(selectedSub.finalScore) : liveFinalScore} marks
                    </strong>
                  </div>
                  <div className="text-center">
                    <span className="text-red-700 font-bold block">Deduction</span>
                    <strong className="text-red-600 font-mono">-{Number(deductAmountInput)} marks</strong>
                  </div>
                  <div className="text-right">
                    <span className="text-[#166534] font-bold block">Resulting Score</span>
                    <strong className="text-[#166534] font-mono font-bold">
                      {Math.max(
                        0,
                        (selectedSub.finalScore !== null ? Number(selectedSub.finalScore) : liveFinalScore) -
                          Number(deductAmountInput)
                      )}{" "}
                      marks
                    </strong>
                  </div>
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-[#f1f5f9] bg-surface-container-low flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsDeductModalOpen(false)}
                className="px-4 py-2 rounded-md bg-surface-container-high hover:bg-surface-container text-on-surface font-label-sm border border-[#e2e8f0] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleProceedToConfirmDeduction}
                className="px-4 py-2 rounded-md bg-red-600 hover:bg-red-700 text-white font-label-sm font-bold shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <span>Review & Confirm Deduction</span>
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* High-Priority Confirmation Dialog (Safe Marks Deduction with 5 vs 55 Distinction) */}
      {isDeductConfirmOpen && selectedSub && (
        <div
          className="fixed inset-0 bg-inverse-surface/60 backdrop-blur-sm z-70 flex items-center justify-center p-4"
          onClick={() => !isSubmittingDeduction && setIsDeductConfirmOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-surface-container-lowest rounded-2xl shadow-2xl border-2 border-red-300 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 bg-red-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[24px]">gavel</span>
                <h3 className="font-headline-sm font-bold tracking-tight">Confirm Marks Deduction</h3>
              </div>
              <button
                type="button"
                disabled={isSubmittingDeduction}
                onClick={() => setIsDeductConfirmOpen(false)}
                className="p-1 rounded text-white/80 hover:text-white hover:bg-red-700 cursor-pointer disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="text-xs text-secondary">
                Please verify the exact participant and deduction parameters below. A second explicit click is required to apply this adjustment.
              </div>

              {/* Exact Participant & Assessment Info */}
              <div className="p-3 bg-surface-container-low rounded-lg border border-[#e2e8f0] text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-secondary">Participant Name:</span>
                  <strong className="text-on-surface font-semibold">{selectedSub.candidateName}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-secondary">Candidate ID:</span>
                  <strong className="text-on-surface font-mono">{selectedSub.candidateId}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-secondary">Assessment:</span>
                  <strong className="text-on-surface truncate max-w-[260px]">
                    {selectedSub.contestTitle} ({selectedSub.phaseTitle})
                  </strong>
                </div>
              </div>

              {/* PROMINENT DEDUCTION AMOUNT CALLOUT (5 vs 55 Unmistakable Distinction) */}
              <div className="p-4 rounded-xl bg-red-50 border-2 border-red-300 text-center">
                <span className="font-label-xs uppercase tracking-widest text-red-700 font-bold block mb-1">
                  Deduction Amount (Marks)
                </span>
                <div className="text-4xl sm:text-5xl font-black text-red-600 font-mono tracking-tight my-1">
                  {deductAmountInput} marks
                </div>
                <div className="text-xs font-bold text-red-800 uppercase tracking-widest bg-red-100 px-3 py-1 rounded inline-block border border-red-200 mt-1">
                  {formatMarksInWords(Number(deductAmountInput))}
                </div>

                {Number(deductAmountInput) >= 10 && (
                  <div className="mt-2.5 p-2 rounded bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold flex items-center justify-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px] text-amber-600">warning</span>
                    <span>High-Impact Deduction: You are deducting {deductAmountInput} marks ({formatMarksInWords(Number(deductAmountInput))}).</span>
                  </div>
                )}
              </div>

              {/* Mandatory Reason Repeated */}
              <div className="p-3 bg-surface-container-low rounded-lg border border-[#e2e8f0]">
                <span className="font-label-xs uppercase tracking-wider text-secondary font-bold block mb-1">
                  Recorded Reason
                </span>
                <p className="text-xs text-on-surface italic bg-surface-container-lowest p-2 rounded border border-[#e2e8f0]">
                  &quot;{deductReasonInput.trim()}&quot;
                </p>
              </div>

              {/* Resulting Score Breakdown */}
              <div className="p-3 rounded-lg bg-surface-container-low border border-[#e2e8f0] grid grid-cols-3 gap-2 text-center text-xs">
                <div>
                  <span className="text-secondary block">Original Score</span>
                  <strong className="text-on-surface font-mono text-sm block mt-0.5">
                    {selectedSub.finalScore !== null ? Number(selectedSub.finalScore) : liveFinalScore} marks
                  </strong>
                </div>
                <div>
                  <span className="text-red-700 font-semibold block">Deduction</span>
                  <strong className="text-red-600 font-mono text-sm block mt-0.5">
                    -{deductAmountInput} marks
                  </strong>
                </div>
                <div>
                  <span className="text-[#166534] font-semibold block">Resulting Score</span>
                  <strong className="text-[#166534] font-mono text-sm font-bold block mt-0.5">
                    {Math.max(
                      0,
                      (selectedSub.finalScore !== null ? Number(selectedSub.finalScore) : liveFinalScore) -
                        Number(deductAmountInput)
                    )}{" "}
                    marks
                  </strong>
                </div>
              </div>

              {/* Published Result Safeguard Warning */}
              {selectedSub.contestIsPublished && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-xs space-y-2">
                  <div className="flex items-center gap-1.5 font-bold text-amber-800">
                    <span className="material-symbols-outlined text-[16px]">lock</span>
                    <span>Published Assessment Warning</span>
                  </div>
                  <p>
                    This contest result has already been published. Applying this deduction will adjust the certified Cohort Result and require leaderboard republishing.
                  </p>
                  {session?.role === "ADMIN" ? (
                    <label className="flex items-center gap-2 font-semibold text-amber-950 cursor-pointer pt-1">
                      <input
                        type="checkbox"
                        checked={confirmPublishedOverride}
                        onChange={(e) => setConfirmPublishedOverride(e.target.checked)}
                        className="rounded text-primary-container focus:ring-0"
                      />
                      <span>I explicitly authorize updating published certified results.</span>
                    </label>
                  ) : (
                    <p className="text-red-700 font-bold">
                      Evaluators cannot alter already published results. Administrator override is required.
                    </p>
                  )}
                </div>
              )}

              {deductError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px] shrink-0">error</span>
                  <span>{deductError}</span>
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-[#f1f5f9] bg-surface-container-low flex items-center justify-between gap-2">
              <button
                type="button"
                disabled={isSubmittingDeduction}
                onClick={() => {
                  setIsDeductConfirmOpen(false);
                  setIsDeductModalOpen(true);
                }}
                className="px-4 py-2 rounded-md bg-surface-container-high hover:bg-surface-container text-on-surface font-label-sm border border-[#e2e8f0] cursor-pointer disabled:opacity-50"
              >
                Back / Edit
              </button>
              <button
                type="button"
                disabled={
                  isSubmittingDeduction ||
                  (selectedSub.contestIsPublished && session?.role !== "ADMIN") ||
                  (selectedSub.contestIsPublished && session?.role === "ADMIN" && !confirmPublishedOverride)
                }
                onClick={handleApplyDeduction}
                className="px-4 py-2 rounded-md bg-red-600 hover:bg-red-700 text-white font-label-sm font-bold shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSubmittingDeduction ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>Applying Deduction...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[16px]">check_circle</span>
                    <span>Confirm & Apply {deductAmountInput} Marks Deduction</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Captured Evidence Still Viewer Modal */}
      {evidenceViewerOpen && selectedEvidence && (
        <div
          className="fixed inset-0 bg-inverse-surface/60 backdrop-blur-sm z-80 flex items-center justify-center p-4"
          onClick={() => setEvidenceViewerOpen(false)}
        >
          <div
            className="w-full max-w-2xl bg-surface-container-lowest rounded-xl shadow-2xl border border-[#e2e8f0] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3 border-b border-[#f1f5f9] flex items-center justify-between bg-surface-container-low">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px] text-primary-container">image</span>
                <h4 className="font-label-sm font-bold text-on-surface">
                  Captured Telemetry Evidence Still ({selectedEvidence.eventType})
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setEvidenceViewerOpen(false)}
                className="p-1 rounded text-secondary hover:text-on-surface hover:bg-surface-container cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="p-5 text-center space-y-3">
              {selectedEvidence.screenCapture ? (
                <div>
                  <span className="font-label-xs uppercase tracking-wider text-secondary font-bold block mb-1">
                    Screen Capture Evidence Still
                  </span>
                  <img
                    src={selectedEvidence.screenCapture}
                    alt="Screen telemetry evidence"
                    className="max-h-96 mx-auto rounded-lg border border-[#e2e8f0] object-contain shadow-xs"
                  />
                </div>
              ) : selectedEvidence.cameraCapture ? (
                <div>
                  <span className="font-label-xs uppercase tracking-wider text-secondary font-bold block mb-1">
                    Camera Telemetry Still
                  </span>
                  <img
                    src={selectedEvidence.cameraCapture}
                    alt="Camera telemetry evidence"
                    className="max-h-96 mx-auto rounded-lg border border-[#e2e8f0] object-contain shadow-xs"
                  />
                </div>
              ) : (
                <div className="p-8 text-secondary text-xs italic">
                  No visual image data was captured or permitted for this telemetry event.
                </div>
              )}
              <p className="text-[11px] text-secondary font-mono">
                Captured At: {new Date(selectedEvidence.timestamp).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="w-full bg-surface-container-low py-space-md border-t border-[#e2e8f0] text-center font-body-sm text-secondary">
        © 2025 ACI Career EDGE Assessment Platform. Standardized Evaluator Portal.
      </footer>
    </div>
  );
}
