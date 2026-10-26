"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/ui/brand-logo";
import {
  getEvaluatorDashboardDataAction,
  gradeSubmissionAction,
  type SubmissionToGrade,
  type EvaluatorContestItem,
} from "@/app/actions/evaluator-actions";
import { logoutAction, getCurrentUserSession } from "@/app/actions/auth-actions";
import { getFileDownloadUrlAction } from "@/app/actions/file-actions";
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

  const loadData = useCallback(async (contestId?: string) => {
    try {
      setIsLoading(true);
      const activeFilter = contestId !== undefined ? contestId : selectedContestFilter;
      const [dashData, userSession] = await Promise.all([
        getEvaluatorDashboardDataAction(activeFilter !== "ALL" ? activeFilter : undefined),
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
    loadData();
  }, [loadData]);

  const openGradingDrawer = (sub: SubmissionToGrade) => {
    setSelectedSub(sub);
    setGradeSuccessMsg(null);
    setGradeErrorMsg(null);

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
        evaluatorEmail: session?.email || "evaluator.demo@example.com",
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
          <BrandLogo showSubtitle={true} />
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
            <span>{session?.email || "evaluator.demo@example.com"}</span>
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
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedContestFilter(val);
                  loadData(val);
                }}
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

              {/* Live Assessment Score Dashboard */}
              <div className="my-3 p-3 bg-surface-container-low rounded-lg border border-[#e2e8f0] grid grid-cols-3 gap-2 text-center">
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
                    Total Score
                  </span>
                  <span className="font-headline-sm font-bold text-primary-container tabular-nums">
                    {liveFinalScore} / {selectedSub.taskPoints}
                  </span>
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
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    const res = await getFileDownloadUrlAction(ans.fileKey!);
                                    if (res.success && res.downloadUrl) {
                                      window.open(res.downloadUrl, "_blank", "noopener,noreferrer");
                                    } else {
                                      window.open(`/api/files/${ans.fileKey}`, "_blank", "noopener,noreferrer");
                                    }
                                  } catch {
                                    window.open(`/api/files/${ans.fileKey}`, "_blank", "noopener,noreferrer");
                                  }
                                }}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-surface-container-lowest hover:bg-surface-container text-on-surface font-label-xs font-semibold border border-[#e2e8f0] shadow-2xs transition-colors shrink-0 cursor-pointer"
                              >
                                <span className="material-symbols-outlined text-[16px]">visibility</span>
                                <span>Open PDF Deliverable</span>
                              </button>
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
