"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  getAdminSubmissionsList,
  type AdminSubmissionsOverview,
  type AdminSubmissionDetail,
} from "@/app/actions/results-actions";
import { gradeSubmissionAction } from "@/app/actions/evaluator-actions";
import { useAdminContest } from "@/context/admin-contest-context";

export default function AdminSubmissionsPage() {
  const { selectedContestId: globalContestId, setSelectedContestId: setGlobalContestId } = useAdminContest();
  const [data, setData] = useState<AdminSubmissionsOverview | null>(null);
  const [selectedContestId, setSelectedContestId] = useState<string>(globalContestId || "ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "SUBMITTED" | "GRADED">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSubmission, setSelectedSubmission] = useState<AdminSubmissionDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Sync with global contest context when changed from sidebar or header
  useEffect(() => {
    if (globalContestId && globalContestId !== selectedContestId) {
      setSelectedContestId(globalContestId);
    }
  }, [globalContestId, selectedContestId]);

  // Interactive Grading Drawer State
  const [questionScores, setQuestionScores] = useState<Record<string, number>>({});
  const [questionFeedback, setQuestionFeedback] = useState<Record<string, string>>({});
  const [overallFeedback, setOverallFeedback] = useState<string>("");
  const [rubricScores, setRubricScores] = useState<Record<string, number>>({});
  const [rubricComments, setRubricComments] = useState<Record<string, string>>({});
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [gradeSuccessMsg, setGradeSuccessMsg] = useState<string | null>(null);
  const [gradeErrorMsg, setGradeErrorMsg] = useState<string | null>(null);

  const loadSubmissions = useCallback(async (contestId?: string) => {
    try {
      setIsLoading(true);
      const res = await getAdminSubmissionsList(contestId);
      setData(res);
      if (selectedSubmission) {
        const updated = res.submissions.find((s) => s.id === selectedSubmission.id);
        if (updated) setSelectedSubmission(updated);
      }
    } catch (err) {
      console.error("Failed to load submissions:", err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedSubmission]);

  useEffect(() => {
    loadSubmissions(selectedContestId || undefined);
  }, [selectedContestId, loadSubmissions]);

  const openInspector = (sub: AdminSubmissionDetail) => {
    setSelectedSubmission(sub);
    setGradeSuccessMsg(null);
    setGradeErrorMsg(null);

    const initialQScore: Record<string, number> = {};
    const initialQFeedback: Record<string, string> = {};

    sub.answers.forEach((ans) => {
      initialQScore[ans.questionId] =
        ans.score !== null ? Number(ans.score) : 0;
      initialQFeedback[ans.questionId] = ans.feedback || "";
    });

    const initialRubricScores: Record<string, number> = {};
    const initialRubricComments: Record<string, string> = {};

    sub.evaluations.forEach((ev) => {
      initialRubricScores[ev.rubricId] =
        ev.scoreAwarded !== undefined && ev.scoreAwarded !== null && ev.scoreAwarded > 0
          ? Number(ev.scoreAwarded)
          : Math.round(ev.maxPoints * 0.85);
      initialRubricComments[ev.rubricId] = ev.comments || "";
    });

    setQuestionScores(initialQScore);
    setQuestionFeedback(initialQFeedback);
    setOverallFeedback(sub.overallFeedback || "");
    setRubricScores(initialRubricScores);
    setRubricComments(initialRubricComments);
  };

  // Live Score Computations
  const { autoScore, manualScore, liveFinalScore } = useMemo(() => {
    if (!selectedSubmission) {
      return { autoScore: 0, manualScore: 0, liveFinalScore: 0 };
    }

    const auto = selectedSubmission.answers
      .filter((a) => a.questionType === "MCQ")
      .reduce((sum, a) => sum + (a.score !== null ? Number(a.score) : 0), 0);

    let manual = 0;
    if (selectedSubmission.evaluations.length > 0) {
      let weightedTotal = 0;
      selectedSubmission.evaluations.forEach((ev) => {
        const awarded = rubricScores[ev.rubricId] ?? 0;
        const bounded = Math.max(0, Math.min(awarded, ev.maxPoints));
        weightedTotal += (bounded / ev.maxPoints) * ev.weightPercentage;
      });

      const rubricTaskTitles = new Set(
        selectedSubmission.evaluations.map((e) => e.taskTitle).filter(Boolean)
      );

      const nonRubricQuestionsScore = selectedSubmission.answers
        .filter((a) => a.questionType !== "MCQ" && (!a.taskTitle || !rubricTaskTitles.has(a.taskTitle)))
        .reduce((sum, a) => sum + (questionScores[a.questionId] ?? 0), 0);

      manual = Math.round((weightedTotal + nonRubricQuestionsScore) * 100) / 100;
    } else {
      manual = selectedSubmission.answers
        .filter((a) => a.questionType !== "MCQ")
        .reduce((sum, a) => sum + (questionScores[a.questionId] ?? 0), 0);
    }

    const maxPts = selectedSubmission.taskPoints || 100;
    const finalTotal = Math.min(maxPts, Math.max(0, Math.round((auto + manual) * 100) / 100));

    return { autoScore: auto, manualScore: manual, liveFinalScore: finalTotal };
  }, [selectedSubmission, rubricScores, questionScores]);

  const handleSaveEvaluation = async (isDraft: boolean) => {
    if (!selectedSubmission) return;

    try {
      if (isDraft) {
        setIsSavingDraft(true);
      } else {
        setIsFinalizing(true);
      }
      setGradeSuccessMsg(null);
      setGradeErrorMsg(null);

      // Validate question scores against max bounds
      for (const ans of selectedSubmission.answers) {
        if (ans.questionType !== "MCQ") {
          const val = questionScores[ans.questionId] ?? 0;
          if (val < 0 || val > ans.points) {
            setGradeErrorMsg(
              `Question 0${ans.questionNumber} mark (${val}) must be between 0 and maximum ${ans.points} points.`
            );
            return;
          }
        }
      }

      // Validate rubric scores against max bounds
      for (const ev of selectedSubmission.evaluations) {
        const val = rubricScores[ev.rubricId] ?? 0;
        if (val < 0 || val > ev.maxPoints) {
          setGradeErrorMsg(
            `Rubric "${ev.rubricName}" score (${val}) must be between 0 and maximum ${ev.maxPoints} points.`
          );
          return;
        }
      }

      const questionGradesPayload = selectedSubmission.answers
        .filter((a) => a.questionType !== "MCQ")
        .map((a) => ({
          questionId: a.questionId,
          score: Number(questionScores[a.questionId] ?? 0),
          feedback: questionFeedback[a.questionId] || undefined,
        }));

      const rubricScoresPayload = selectedSubmission.evaluations.map((ev) => ({
        rubricId: ev.rubricId,
        scoreAwarded: Number(rubricScores[ev.rubricId] ?? 0),
        comments: rubricComments[ev.rubricId] || undefined,
      }));

      const res = await gradeSubmissionAction({
        submissionId: selectedSubmission.id,
        isDraft,
        overallFeedback,
        questionGrades: questionGradesPayload,
        rubricScores: rubricScoresPayload,
      });

      if (res.success) {
        const maxPts = selectedSubmission.taskPoints || 100;
        if (isDraft) {
          setGradeSuccessMsg(
            `Draft saved! Status: In Review • Manual: ${res.manualGradeScore} pts • Score: ${res.finalScore}/${maxPts}`
          );
        } else {
          setGradeSuccessMsg(
            `Evaluation finalized! Locked Score: ${res.finalScore}/${maxPts} (Auto: ${res.autoGradeScore} pts • Manual: ${res.manualGradeScore} pts)`
          );
        }
        await loadSubmissions(selectedContestId);
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

  const filteredSubmissions = (data?.submissions || []).filter((sub) => {
    const matchesFilter =
      statusFilter === "ALL" ||
      (statusFilter === "SUBMITTED" &&
        (sub.status === "SUBMITTED" || sub.status === "GRADING_IN_PROGRESS" || sub.status === "IN_REVIEW")) ||
      (statusFilter === "GRADED" && (sub.status === "GRADED" || sub.status === "PUBLISHED"));

    const matchesSearch =
      sub.candidateName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sub.candidateEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sub.candidateId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sub.institution.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  return (
    <div className="flex-1 p-space-md sm:p-space-lg max-w-7xl mx-auto w-full">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-space-md border-b border-[#e2e8f0] gap-space-sm mb-space-lg">
        <div>
          <div className="flex items-center gap-space-xs text-secondary font-label-xs mb-1">
            <Link href="/admin" className="hover:text-on-surface">Admin</Link>
            <span>/</span>
            <span className="text-on-surface font-medium">Submissions & Evaluation Status</span>
          </div>
          <h1 className="font-headline-md font-semibold text-on-surface tracking-tight">
            Submission Auditing & Grading Velocity
          </h1>
          <p className="font-body-sm text-secondary mt-0.5">
            Inspect candidate assessment attempts, auto-graded MCQ accuracy, and perform manual rubric evaluation.
          </p>
        </div>

        {/* Contest Switcher */}
        {data && (
          <div className="flex items-center gap-space-sm">
            <label className="font-label-xs text-secondary font-medium whitespace-nowrap">
              Contest:
            </label>
            <select
              value={selectedContestId}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedContestId(val);
                setGlobalContestId(val);
              }}
              className="px-3 py-2 bg-surface-container-lowest border border-[#e2e8f0] rounded text-on-surface font-label-sm font-medium focus:outline-none focus:border-primary-container"
            >
              <option value="ALL">All Contests (Global Scope)</option>
              {data.contests.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Metrics Row */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-space-sm mb-space-lg">
          <div className="p-space-sm bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs">
            <span className="font-label-xs text-secondary uppercase font-semibold">Total Candidates</span>
            <div className="text-2xl font-bold text-on-surface mt-1">{data.metrics.totalSubmissions}</div>
          </div>
          <div className="p-space-sm bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs">
            <span className="font-label-xs text-secondary uppercase font-semibold">Pending Review</span>
            <div className="text-2xl font-bold text-amber-600 mt-1">{data.metrics.inReview}</div>
          </div>
          <div className="p-space-sm bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs">
            <span className="font-label-xs text-secondary uppercase font-semibold">Fully Graded</span>
            <div className="text-2xl font-bold text-primary-container mt-1">{data.metrics.graded}</div>
          </div>
          <div className="p-space-sm bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs">
            <span className="font-label-xs text-secondary uppercase font-semibold">Cohort Mean Score</span>
            <div className="text-2xl font-bold text-on-surface mt-1">{data.metrics.averageScore} <span className="text-xs text-secondary font-normal">/ 100</span></div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-space-sm mb-space-md">
        <div className="flex items-center gap-1.5 w-full sm:w-auto">
          {(["ALL", "SUBMITTED", "GRADED"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded font-label-xs font-semibold border transition-colors ${
                statusFilter === s
                  ? "bg-primary-container text-on-primary border-primary-container"
                  : "bg-surface-container-lowest text-secondary border-[#e2e8f0] hover:bg-surface-container"
              }`}
            >
              {s === "ALL" ? "All Candidates" : s === "SUBMITTED" ? "In Review" : "Graded"}
            </button>
          ))}
        </div>

        <div className="w-full sm:w-72 relative">
          <span className="material-symbols-outlined text-[18px] text-secondary absolute left-3 top-2.5">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search candidate, ID, or school..."
            className="w-full pl-9 pr-3 py-1.5 rounded bg-surface-container-lowest border border-[#e2e8f0] text-on-surface font-body-sm focus:outline-none focus:border-primary-container"
          />
        </div>
      </div>

      {/* Submissions Table - 1 Row Per Candidate Attempt */}
      <div className="bg-surface-container-lowest border border-[#e2e8f0] rounded-lg shadow-2xs overflow-hidden">
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center text-secondary">
            <span className="w-8 h-8 border-3 border-primary-container border-t-transparent rounded-full animate-spin mb-3"></span>
            <p className="font-label-sm">Loading candidate submission attempts...</p>
          </div>
        ) : filteredSubmissions.length === 0 ? (
          <div className="p-12 text-center text-secondary">
            <span className="material-symbols-outlined text-[40px] mb-2 text-secondary/60">inbox</span>
            <h4 className="font-headline-sm font-semibold text-on-surface">No Submissions Found</h4>
            <p className="font-body-sm text-secondary mt-1">
              No candidate submissions match your current filter in this contest.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low border-b border-[#e2e8f0] font-label-xs uppercase font-semibold text-secondary">
                  <th className="py-3 px-space-md">Candidate</th>
                  <th className="py-3 px-space-md">Institution</th>
                  <th className="py-3 px-space-md">Submitted (BST)</th>
                  <th className="py-3 px-space-md">Status</th>
                  <th className="py-3 px-space-md text-right">Auto MCQ</th>
                  <th className="py-3 px-space-md text-right">Manual / Rubric</th>
                  <th className="py-3 px-space-md text-right">Final Score</th>
                  <th className="py-3 px-space-md text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9] font-body-sm text-on-surface">
                {filteredSubmissions.map((sub) => (
                  <tr
                    key={sub.id}
                    onClick={() => openInspector(sub)}
                    className="hover:bg-surface-container-lowest/80 transition-colors cursor-pointer"
                  >
                    <td className="py-3.5 px-space-md">
                      <div className="flex flex-col">
                        <span className="font-medium text-on-surface">{sub.candidateName}</span>
                        <div className="flex items-center gap-1.5 text-secondary text-xs">
                          <span className="font-mono">{sub.candidateId}</span>
                          <span>•</span>
                          <span>{sub.candidateEmail}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-space-md text-secondary text-xs">
                      {sub.institution}
                    </td>
                    <td className="py-3.5 px-space-md text-secondary text-xs whitespace-nowrap">
                      {sub.submittedAt
                        ? new Date(sub.submittedAt).toLocaleString("en-US", {
                            timeZone: "Asia/Dhaka",
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "Draft"}
                    </td>
                    <td className="py-3.5 px-space-md">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          sub.status === "GRADED" || sub.status === "PUBLISHED"
                            ? "bg-[#dcfce7] text-[#166534]"
                            : sub.status === "GRADING_IN_PROGRESS"
                            ? "bg-[#fef3c7] text-[#92400e]"
                            : "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {sub.status === "GRADING_IN_PROGRESS" ? "In Review" : sub.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-space-md text-right font-mono text-xs">
                      {sub.autoGradeScore !== null ? `${sub.autoGradeScore} pts` : "—"}
                    </td>
                    <td className="py-3.5 px-space-md text-right font-mono text-xs">
                      {sub.manualGradeScore !== null ? `${sub.manualGradeScore} pts` : "Pending"}
                    </td>
                    <td className="py-3.5 px-space-md text-right font-mono font-semibold text-primary-container">
                      {sub.finalScore !== null ? `${sub.finalScore}` : "—"}
                    </td>
                    <td className="py-3.5 px-space-md text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => openInspector(sub)}
                        className="px-3 py-1 text-xs bg-surface-container-high hover:bg-surface-container text-on-surface font-semibold rounded border border-[#e2e8f0] inline-flex items-center gap-1 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[14px]">edit_note</span>
                        <span>{sub.status === "GRADED" ? "Review" : "Grade"}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Slide-Over Drawer for Candidate Review & Grading */}
      {selectedSubmission && (
        <div
          className="fixed inset-0 bg-inverse-surface/40 backdrop-blur-xs z-50 flex justify-end transition-opacity"
          onClick={() => setSelectedSubmission(null)}
        >
          <div
            className="w-full sm:w-[94vw] md:w-[75vw] lg:w-[48vw] lg:min-w-[680px] lg:max-w-[920px] xl:max-w-[1020px] 2xl:max-w-[1150px] bg-surface-container-lowest h-full shadow-2xl p-space-lg flex flex-col justify-between border-l border-[#e2e8f0] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              {/* Drawer Header */}
              <div className="flex items-center justify-between pb-space-sm border-b border-[#e2e8f0] mb-space-md">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded font-label-xs font-semibold ${
                        selectedSubmission.status === "GRADED" || selectedSubmission.status === "PUBLISHED"
                          ? "bg-[#dcfce7] text-[#166534]"
                          : selectedSubmission.status === "GRADING_IN_PROGRESS"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-surface-container-high text-secondary"
                      }`}
                    >
                      {selectedSubmission.status}
                    </span>
                    <span className="font-mono text-xs text-secondary font-semibold">
                      {selectedSubmission.candidateId}
                    </span>
                  </div>
                  <h3 className="font-headline-sm font-semibold text-on-surface mt-1">
                    {selectedSubmission.candidateName}
                  </h3>
                  <p className="text-secondary text-xs">
                    {selectedSubmission.institution} • {selectedSubmission.candidateEmail}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedSubmission(null)}
                  className="text-secondary hover:text-on-surface p-1 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>

              {/* Score Summary Box */}
              <div className="p-space-sm bg-surface-container-low rounded-lg border border-[#e2e8f0] grid grid-cols-3 gap-space-xs text-center mb-space-md">
                <div className="p-2 bg-surface-container-lowest rounded border border-[#e2e8f0]">
                  <span className="font-label-xs uppercase text-secondary font-semibold block">MCQ Auto Score</span>
                  <span className="font-headline-sm font-bold text-on-surface">
                    {autoScore} pts
                  </span>
                </div>
                <div className="p-2 bg-surface-container-lowest rounded border border-[#e2e8f0]">
                  <span className="font-label-xs uppercase text-secondary font-semibold block">Manual / Rubric</span>
                  <span className="font-headline-sm font-bold text-primary-container">
                    {manualScore} pts
                  </span>
                </div>
                <div className="p-2 bg-surface-container-lowest rounded border border-primary-container/30">
                  <span className="font-label-xs uppercase text-primary-container font-semibold block">Total Score</span>
                  <span className="font-headline-sm font-bold text-primary-container">
                    {liveFinalScore} / {selectedSubmission.taskPoints || 100}
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

              {/* Submitted Answers Section */}
              <div className="space-y-space-md">
                <div className="flex items-center justify-between pb-1 border-b border-[#e2e8f0]">
                  <span className="font-label-xs uppercase font-semibold text-secondary tracking-wider block">
                    Candidate Responses ({selectedSubmission.answers.length} Questions)
                  </span>
                  <span className="font-label-xs text-secondary">
                    Total Contest Points: {selectedSubmission.taskPoints || 100}
                  </span>
                </div>

                {selectedSubmission.answers.map((ans, idx) => {
                  const currentScore = questionScores[ans.questionId] ?? 0;
                  const isScoreInvalid = currentScore < 0 || currentScore > ans.points;

                  return (
                    <div
                      key={ans.id}
                      className="p-space-sm bg-surface-container-low rounded-lg border border-[#e2e8f0] flex flex-col gap-2.5"
                    >
                      <div className="flex items-center justify-between text-xs text-secondary">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-on-surface">Question #{ans.questionNumber || idx + 1}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              ans.questionType === "MCQ"
                                ? "bg-slate-100 text-slate-700"
                                : ans.questionType === "WRITTEN"
                                ? "bg-blue-50 text-blue-700"
                                : "bg-purple-50 text-purple-700"
                            }`}
                          >
                            {ans.questionType}
                          </span>
                          {ans.taskTitle && (
                            <span className="text-[11px] text-secondary/80">({ans.taskTitle})</span>
                          )}
                        </div>
                        <span className="font-medium text-secondary">Max: {ans.points} pts</span>
                      </div>

                      <p className="font-body-sm font-medium text-on-surface">
                        {ans.questionPrompt}
                      </p>

                      {/* MCQ Response Review */}
                      {ans.questionType === "MCQ" && (
                        <div className="p-3 bg-surface-container-lowest rounded border border-[#e2e8f0] text-xs flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <span className="text-secondary">
                              Selected Option:{" "}
                              <strong className="text-primary-container font-mono text-sm">
                                {ans.selectedOption || "None"}
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
                                  ? `Correct (+${ans.score ?? ans.points} pts)`
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
                          <div className="p-3 bg-surface-container-lowest rounded border border-[#e2e8f0] text-xs leading-relaxed">
                            <div className="flex justify-between text-[11px] text-secondary pb-1 border-b border-[#f1f5f9] mb-1.5">
                              <span>Candidate Written Submission</span>
                              <span className="font-mono">{ans.wordCount || 0} words</span>
                            </div>
                            <p className="text-on-surface whitespace-pre-wrap italic">
                              &quot;{ans.writtenText || "No response submitted."}&quot;
                            </p>
                          </div>

                          {/* Manual Question Scoring Input */}
                          <div className="p-2.5 bg-surface-container-lowest rounded border border-[#e2e8f0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex-1">
                              <label className="block font-label-xs font-semibold text-on-surface mb-1">
                                Award Marks (0 – {ans.points} pts)
                              </label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min="0"
                                  max={ans.points}
                                  step="1"
                                  value={questionScores[ans.questionId] ?? 0}
                                  onChange={(e) =>
                                    setQuestionScores({
                                      ...questionScores,
                                      [ans.questionId]: Number(e.target.value),
                                    })
                                  }
                                  className={`w-24 px-2.5 py-1 text-sm rounded bg-surface-container-low border font-mono font-bold ${
                                    isScoreInvalid
                                      ? "border-red-500 text-red-600 focus:outline-red-500"
                                      : "border-[#e2e8f0] text-on-surface focus:outline-primary-container"
                                  }`}
                                />
                                <span className="font-label-xs text-secondary">
                                  / {ans.points} max points
                                </span>
                              </div>
                              {isScoreInvalid && (
                                <span className="text-[11px] text-red-600 mt-0.5 block">
                                  Mark cannot exceed {ans.points} points or be negative.
                                </span>
                              )}
                            </div>
                          </div>

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
                              placeholder="Qualitative feedback on this written answer..."
                              className="w-full px-2.5 py-1.5 text-xs rounded bg-surface-container-lowest border border-[#e2e8f0] text-on-surface focus:outline-none focus:border-primary-container"
                            />
                          </div>
                        </div>
                      )}

                      {/* File Upload Review & Grading */}
                      {ans.questionType === "FILE_UPLOAD" && (
                        <div className="flex flex-col gap-2.5">
                          <div className="p-3 bg-surface-container-lowest rounded border border-[#e2e8f0] text-xs flex items-center justify-between">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="material-symbols-outlined text-red-600 text-[26px] shrink-0">
                                picture_as_pdf
                              </span>
                              <div className="min-w-0">
                                <span className="font-semibold text-on-surface block truncate">
                                  {ans.fileName || "Submitted PDF Deliverable"}
                                </span>
                                <span className="text-[11px] text-secondary font-mono truncate block">
                                  {ans.fileKey || "PDF Document"}
                                </span>
                              </div>
                            </div>
                            {ans.fileKey && (
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
                            )}
                          </div>

                          {/* Manual Question Scoring Input */}
                          <div className="p-2.5 bg-surface-container-lowest rounded border border-[#e2e8f0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex-1">
                              <label className="block font-label-xs font-semibold text-on-surface mb-1">
                                Award Marks (0 – {ans.points} pts)
                              </label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min="0"
                                  max={ans.points}
                                  step="1"
                                  value={questionScores[ans.questionId] ?? 0}
                                  onChange={(e) =>
                                    setQuestionScores({
                                      ...questionScores,
                                      [ans.questionId]: Number(e.target.value),
                                    })
                                  }
                                  className={`w-24 px-2.5 py-1 text-sm rounded bg-surface-container-low border font-mono font-bold ${
                                    isScoreInvalid
                                      ? "border-red-500 text-red-600 focus:outline-red-500"
                                      : "border-[#e2e8f0] text-on-surface focus:outline-primary-container"
                                  }`}
                                />
                                <span className="font-label-xs text-secondary">
                                  / {ans.points} max points
                                </span>
                              </div>
                              {isScoreInvalid && (
                                <span className="text-[11px] text-red-600 mt-0.5 block">
                                  Mark cannot exceed {ans.points} points or be negative.
                                </span>
                              )}
                            </div>
                          </div>

                          <div>
                            <label className="block font-label-xs text-secondary font-semibold mb-1">
                              Deliverable Feedback
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
                              placeholder="Feedback on PDF deliverable and presentation..."
                              className="w-full px-2.5 py-1.5 text-xs rounded bg-surface-container-lowest border border-[#e2e8f0] text-on-surface focus:outline-none focus:border-primary-container"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Rubrics Breakdown & Scoring */}
                {selectedSubmission.evaluations.length > 0 && (
                  <div className="pt-space-md border-t border-[#e2e8f0]">
                    <div className="flex items-center justify-between pb-1 mb-space-xs">
                      <span className="font-label-xs uppercase font-semibold text-secondary tracking-wider block">
                        Rubric Scoring Matrix ({selectedSubmission.evaluations.length} Criteria)
                      </span>
                      <span className="font-label-xs text-primary-container font-semibold">
                        Weighted Total: {manualScore} pts
                      </span>
                    </div>

                    <div className="space-y-space-xs">
                      {selectedSubmission.evaluations.map((ev) => {
                        const currentVal = rubricScores[ev.rubricId] ?? ev.scoreAwarded;

                        return (
                          <div
                            key={ev.rubricId}
                            className="p-3 bg-surface-container-low rounded border border-[#e2e8f0] text-xs flex flex-col gap-2"
                          >
                            <div className="flex justify-between font-medium">
                              <div>
                                <span className="text-on-surface font-semibold">{ev.rubricName}</span>
                                {ev.taskTitle && (
                                  <span className="text-secondary ml-1">({ev.taskTitle})</span>
                                )}
                              </div>
                              <span className="text-primary-container font-mono font-bold">
                                {currentVal} / {ev.maxPoints} pts ({ev.weightPercentage}% weight)
                              </span>
                            </div>

                            <div className="flex items-center gap-3 pt-1">
                              <input
                                type="range"
                                min="0"
                                max={ev.maxPoints}
                                step="1"
                                value={currentVal}
                                onChange={(e) =>
                                  setRubricScores({
                                    ...rubricScores,
                                    [ev.rubricId]: Number(e.target.value),
                                  })
                                }
                                className="flex-1 accent-primary-container cursor-pointer"
                              />
                              <span className="font-mono text-on-surface font-bold text-sm w-16 text-right">
                                {currentVal} / {ev.maxPoints}
                              </span>
                            </div>

                            <input
                              type="text"
                              placeholder="Criterion notes..."
                              value={rubricComments[ev.rubricId] || ""}
                              onChange={(e) =>
                                setRubricComments({
                                  ...rubricComments,
                                  [ev.rubricId]: e.target.value,
                                })
                              }
                              className="px-2.5 py-1 text-xs rounded bg-surface-container-lowest border border-[#e2e8f0] text-on-surface focus:outline-none focus:border-primary-container"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Overall Feedback */}
                <div className="pt-space-sm">
                  <label className="font-label-xs uppercase tracking-wider text-secondary font-semibold block mb-1">
                    Overall Candidate Feedback
                  </label>
                  <textarea
                    rows={3}
                    value={overallFeedback}
                    onChange={(e) => setOverallFeedback(e.target.value)}
                    placeholder="Comprehensive feedback notes for candidate and administrative audit..."
                    className="w-full px-2.5 py-1.5 text-xs rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface focus:outline-none focus:border-primary-container"
                  />
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-space-md border-t border-[#e2e8f0] flex items-center justify-end gap-space-sm mt-4">
              <button
                type="button"
                onClick={() => setSelectedSubmission(null)}
                className="px-4 py-2 bg-surface-container-high hover:bg-surface-container text-on-surface font-label-md rounded border border-[#e2e8f0] cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                disabled={isSavingDraft || isFinalizing}
                onClick={() => handleSaveEvaluation(true)}
                className="px-4 py-2 bg-surface-container-lowest hover:bg-surface-container text-on-surface font-label-md font-medium rounded border border-[#e2e8f0] shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
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
                className="px-4 py-2 bg-primary-container hover:bg-[#166534] text-on-primary font-label-md font-medium rounded shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isFinalizing && (
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                )}
                <span className="material-symbols-outlined text-[16px]">lock</span>
                <span>Finalize & Lock Grade</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
