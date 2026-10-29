"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  getContestPhasesAndTasks,
  createPhaseAction,
  createTaskAction,
  createQuestionAction,
  deleteQuestionAction,
  deletePhaseAction,
  deleteTaskAction,
  updatePhaseDeadlineAction,
  type TaskBuilderPhase,
  type TaskBuilderTask,
  type TaskBuilderQuestion,
} from "@/app/actions/task-builder-actions";
import { getAdminContestOptions, type AdminContestOption } from "@/app/actions/contest-actions";
import dynamic from "next/dynamic";

const DeleteConfirmationModal = dynamic(
  () => import("@/components/modals/delete-confirmation-modal").then((m) => m.DeleteConfirmationModal),
  { ssr: false }
);
const EditQuestionModal = dynamic(
  () => import("@/components/modals/edit-question-modal").then((m) => m.EditQuestionModal),
  { ssr: false }
);

export default function AdminTasksPage() {
  const [contests, setContests] = useState<AdminContestOption[]>([]);
  const [selectedContestId, setSelectedContestId] = useState<string>("");
  const [contestTitle, setContestTitle] = useState<string>("");
  const [phases, setPhases] = useState<TaskBuilderPhase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTask, setActiveTask] = useState<TaskBuilderTask | null>(null);

  // Edit Question Modal State
  const [isEditQuestionModalOpen, setIsEditQuestionModalOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<TaskBuilderQuestion | null>(null);

  // Modal States
  const [isPhaseModalOpen, setIsPhaseModalOpen] = useState(false);
  const [phaseTitle, setPhaseTitle] = useState("");
  const [phaseDesc, setPhaseDesc] = useState("");
  const [phaseDeadline, setPhaseDeadline] = useState("");
  const [isSubmittingPhase, setIsSubmittingPhase] = useState(false);

  // Edit Phase Deadline Modal
  const [isEditPhaseModalOpen, setIsEditPhaseModalOpen] = useState(false);
  const [editPhaseId, setEditPhaseId] = useState("");
  const [editPhaseTitle, setEditPhaseTitle] = useState("");
  const [editPhaseDeadline, setEditPhaseDeadline] = useState("");
  const [isUpdatingPhaseDeadline, setIsUpdatingPhaseDeadline] = useState(false);

  // Universal Delete Confirmation Modal State
  const [deleteModalState, setDeleteModalState] = useState<{
    isOpen: boolean;
    title: string;
    itemDescription: string;
    warningDetails?: string;
    onConfirm: () => Promise<void>;
  }>({
    isOpen: false,
    title: "",
    itemDescription: "",
    onConfirm: async () => {},
  });
  const [isDeletingItem, setIsDeletingItem] = useState(false);

  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [selectedPhaseIdForTask, setSelectedPhaseIdForTask] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskInstructions, setTaskInstructions] = useState("");
  const [taskPoints, setTaskPoints] = useState(100);
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);

  const [isQuestionModalOpen, setIsQuestionModalOpen] = useState(false);
  const [selectedTaskIdForQ, setSelectedTaskIdForQ] = useState("");
  const [qType, setQType] = useState<"MCQ" | "WRITTEN" | "FILE_UPLOAD">("MCQ");
  const [qPrompt, setQPrompt] = useState("");
  const [qInstructions, setQInstructions] = useState("");
  const [qPoints, setQPoints] = useState(10);
  const [qMinWords, setQMinWords] = useState(200);
  const [qMaxWords, setQMaxWords] = useState(400);
  // MCQ options
  const [mcqOptA, setMcqOptA] = useState("");
  const [mcqOptB, setMcqOptB] = useState("");
  const [mcqOptC, setMcqOptC] = useState("");
  const [mcqOptD, setMcqOptD] = useState("");
  const [correctOption, setCorrectOption] = useState("A");
  const [explanation, setExplanation] = useState("");
  const [scoringGuide, setScoringGuide] = useState("");
  const [isSubmittingQuestion, setIsSubmittingQuestion] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Fast Contest Options Load
  useEffect(() => {
    async function loadContests() {
      try {
        setIsLoading(true);
        setPhaseDeadline(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16));
        const data = await getAdminContestOptions();
        setContests(data);
        if (data.length > 0) {
          setSelectedContestId(data[0].id);
        }
      } catch (err) {
        console.error("Failed to load contests:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadContests();
  }, []);

  // Load Phases & Tasks when selected contest changes
  const loadPhasesAndTasks = async (contestId: string) => {
    if (!contestId) return;
    try {
      setIsLoading(true);
      // Clear stale state immediately so switching contests never shows previous content
      setPhases([]);
      setActiveTask(null);
      const res = await getContestPhasesAndTasks(contestId);
      setContestTitle(res.contestTitle);
      setPhases(res.phases);
      if (res.phases.length > 0 && res.phases[0].tasks.length > 0) {
        setActiveTask(res.phases[0].tasks[0]);
      } else {
        setActiveTask(null);
      }
    } catch (err) {
      console.error("Failed to load phases/tasks:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedContestId) {
      loadPhasesAndTasks(selectedContestId);
    }
  }, [selectedContestId]);

  const handleCreatePhase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phaseTitle.trim() || !selectedContestId) return;

    try {
      setIsSubmittingPhase(true);
      const res = await createPhaseAction({
        contestId: selectedContestId,
        phaseNumber: phases.length + 1,
        title: phaseTitle.trim(),
        description: phaseDesc.trim() || undefined,
        deadline: new Date(phaseDeadline).toISOString(),
      });

      if (res.success) {
        setIsPhaseModalOpen(false);
        setPhaseTitle("");
        setPhaseDesc("");
        setFeedbackMsg({ type: "success", text: "Phase created successfully." });
        await loadPhasesAndTasks(selectedContestId);
      } else {
        setFeedbackMsg({ type: "error", text: res.error || "Failed to create phase" });
      }
    } catch (err) {
      setFeedbackMsg({ type: "error", text: "Unexpected network error" });
    } finally {
      setIsSubmittingPhase(false);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim() || !selectedPhaseIdForTask) return;

    try {
      setIsSubmittingTask(true);
      const phase = phases.find((p) => p.id === selectedPhaseIdForTask);
      const taskNumber = (phase?.tasks.length || 0) + 1;

      const res = await createTaskAction({
        phaseId: selectedPhaseIdForTask,
        taskNumber,
        title: taskTitle.trim(),
        instructions: taskInstructions.trim() || undefined,
        totalPoints: Number(taskPoints),
      });

      if (res.success) {
        setIsTaskModalOpen(false);
        setTaskTitle("");
        setTaskInstructions("");
        setFeedbackMsg({ type: "success", text: "Task created successfully." });
        await loadPhasesAndTasks(selectedContestId);
      } else {
        setFeedbackMsg({ type: "error", text: res.error || "Failed to create task" });
      }
    } catch (err) {
      setFeedbackMsg({ type: "error", text: "Unexpected network error" });
    } finally {
      setIsSubmittingTask(false);
    }
  };

  const handleCreateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qPrompt.trim() || !selectedTaskIdForQ) return;

    try {
      setIsSubmittingQuestion(true);
      const task = activeTask || phases.flatMap((p) => p.tasks).find((t) => t.id === selectedTaskIdForQ);
      const qNumber = (task?.questions.length || 0) + 1;

      const options =
        qType === "MCQ"
          ? [
              { optionKey: "A", text: mcqOptA.trim() || "Option A" },
              { optionKey: "B", text: mcqOptB.trim() || "Option B" },
              { optionKey: "C", text: mcqOptC.trim() || "Option C" },
              { optionKey: "D", text: mcqOptD.trim() || "Option D" },
            ]
          : undefined;

      const res = await createQuestionAction({
        taskId: selectedTaskIdForQ,
        questionNumber: qNumber,
        type: qType,
        prompt: qPrompt.trim(),
        instructions: qInstructions.trim() || undefined,
        points: Number(qPoints),
        minWords: qType === "WRITTEN" ? Number(qMinWords) : undefined,
        maxWords: qType === "WRITTEN" ? Number(qMaxWords) : undefined,
        options,
        correctOptionKey: qType === "MCQ" ? correctOption : undefined,
        explanation: qType === "MCQ" ? explanation.trim() : undefined,
        scoringGuide: scoringGuide.trim() || undefined,
      });

      if (res.success) {
        setIsQuestionModalOpen(false);
        setQPrompt("");
        setQInstructions("");
        setMcqOptA("");
        setMcqOptB("");
        setMcqOptC("");
        setMcqOptD("");
        setExplanation("");
        setScoringGuide("");
        setFeedbackMsg({ type: "success", text: "Question created and saved securely." });
        await loadPhasesAndTasks(selectedContestId);
      } else {
        setFeedbackMsg({ type: "error", text: res.error || "Failed to create question" });
      }
    } catch (err) {
      setFeedbackMsg({ type: "error", text: "Unexpected network error" });
    } finally {
      setIsSubmittingQuestion(false);
    }
  };

  const handleOpenEditQuestion = (q: TaskBuilderQuestion) => {
    setEditingQuestion(q);
    setIsEditQuestionModalOpen(true);
  };

  const handleEditQuestionSuccess = async (_updatedId: string, message: string) => {
    setFeedbackMsg({ type: "success", text: message });
    await loadPhasesAndTasks(selectedContestId);
  };

  const handleDeleteQuestion = (questionId: string, qPromptText?: string) => {
    setDeleteModalState({
      isOpen: true,
      title: "Delete Question",
      itemDescription: qPromptText || "Question",
      warningDetails: "This will permanently remove this question from the task. Any student draft responses for this question will be cleared.",
      onConfirm: async () => {
        try {
          setIsDeletingItem(true);
          const res = await deleteQuestionAction(questionId);
          if (res.success) {
            setFeedbackMsg({ type: "success", text: "Question removed." });
            setDeleteModalState((prev) => ({ ...prev, isOpen: false }));
            await loadPhasesAndTasks(selectedContestId);
          } else {
            setFeedbackMsg({ type: "error", text: res.error || "Failed to delete question" });
          }
        } catch {
          setFeedbackMsg({ type: "error", text: "Error deleting question" });
        } finally {
          setIsDeletingItem(false);
        }
      },
    });
  };

  const handleDeletePhase = (phaseId: string, phaseTitleText?: string) => {
    setDeleteModalState({
      isOpen: true,
      title: "Delete Phase",
      itemDescription: phaseTitleText || "Phase",
      warningDetails: "This will permanently delete this phase, all child tasks, questions, and associated student submissions. This action cannot be reversed.",
      onConfirm: async () => {
        try {
          setIsDeletingItem(true);
          const res = await deletePhaseAction(phaseId);
          if (res.success) {
            setFeedbackMsg({ type: "success", text: "Phase and its tasks removed." });
            setDeleteModalState((prev) => ({ ...prev, isOpen: false }));
            await loadPhasesAndTasks(selectedContestId);
          } else {
            setFeedbackMsg({ type: "error", text: res.error || "Failed to delete phase" });
          }
        } catch {
          setFeedbackMsg({ type: "error", text: "Error deleting phase" });
        } finally {
          setIsDeletingItem(false);
        }
      },
    });
  };

  const handleDeleteTask = (taskId: string, taskTitleText?: string) => {
    setDeleteModalState({
      isOpen: true,
      title: "Delete Task",
      itemDescription: taskTitleText || "Task",
      warningDetails: "This will permanently remove this task, all questions, references, and rubrics under it.",
      onConfirm: async () => {
        try {
          setIsDeletingItem(true);
          const res = await deleteTaskAction(taskId);
          if (res.success) {
            setFeedbackMsg({ type: "success", text: "Task removed." });
            setDeleteModalState((prev) => ({ ...prev, isOpen: false }));
            if (activeTask?.id === taskId) setActiveTask(null);
            await loadPhasesAndTasks(selectedContestId);
          } else {
            setFeedbackMsg({ type: "error", text: res.error || "Failed to delete task" });
          }
        } catch {
          setFeedbackMsg({ type: "error", text: "Error deleting task" });
        } finally {
          setIsDeletingItem(false);
        }
      },
    });
  };

  const handleUpdatePhaseDeadline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editPhaseId || !editPhaseDeadline) return;

    try {
      setIsUpdatingPhaseDeadline(true);
      const res = await updatePhaseDeadlineAction(editPhaseId, editPhaseDeadline);
      if (res.success) {
        setIsEditPhaseModalOpen(false);
        setFeedbackMsg({
          type: "success",
          text: `Phase deadline updated to ${res.formattedDeadline || editPhaseDeadline} (Asia/Dhaka).`,
        });
        await loadPhasesAndTasks(selectedContestId);
      } else {
        setFeedbackMsg({ type: "error", text: res.error || "Failed to update phase deadline" });
      }
    } catch {
      setFeedbackMsg({ type: "error", text: "Network error updating deadline" });
    } finally {
      setIsUpdatingPhaseDeadline(false);
    }
  };

  return (
    <div className="flex-1 p-space-md sm:p-space-lg max-w-7xl mx-auto w-full">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-space-md border-b border-[#e2e8f0] gap-space-sm mb-space-lg">
        <div>
          <div className="flex items-center gap-space-xs text-secondary font-label-xs mb-1">
            <Link href="/admin" className="hover:text-on-surface">Admin</Link>
            <span>/</span>
            <span className="text-on-surface font-medium">Phase & Task Builder</span>
          </div>
          <h1 className="font-headline-md font-semibold text-on-surface tracking-tight">
            Curriculum, Task & Rubric Architect
          </h1>
          <p className="font-body-sm text-secondary mt-0.5">
            Configure multi-stage assessments, question banks (MCQ, Written, PDF upload), and private scoring rubrics.
          </p>
        </div>

        {/* Contest Switcher */}
        <div className="flex items-center gap-space-sm">
          <label className="font-label-xs text-secondary font-medium whitespace-nowrap">
            Contest:
          </label>
          <select
            value={selectedContestId}
            onChange={(e) => setSelectedContestId(e.target.value)}
            className="px-3 py-2 bg-surface-container-lowest border border-[#e2e8f0] rounded text-on-surface font-label-sm font-medium focus:outline-none focus:border-primary-container"
          >
            {contests.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title} ({c.status})
              </option>
            ))}
          </select>
          <button
            onClick={() => setIsPhaseModalOpen(true)}
            className="px-3 py-2 bg-primary-container hover:bg-[#166534] text-on-primary font-label-sm font-medium rounded shadow-2xs flex items-center gap-1 transition-colors whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            Add Phase
          </button>
        </div>
      </div>

      {feedbackMsg && (
        <div
          className={`mb-space-md p-space-sm rounded font-label-sm flex items-center justify-between ${
            feedbackMsg.type === "success"
              ? "bg-[#dcfce7] text-[#166534] border border-[#bbf7d0]"
              : "bg-[#fee2e2] text-[#991b1b] border border-[#fecaca]"
          }`}
        >
          <span>{feedbackMsg.text}</span>
          <button onClick={() => setFeedbackMsg(null)} className="text-sm font-bold">×</button>
        </div>
      )}

      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center text-secondary">
          <span className="w-8 h-8 border-3 border-primary-container border-t-transparent rounded-full animate-spin mb-3"></span>
          <p className="font-label-sm">Loading phases and tasks...</p>
        </div>
      ) : phases.length === 0 ? (
        <div className="p-12 text-center bg-surface-container-lowest border border-[#e2e8f0] rounded-lg">
          <span className="material-symbols-outlined text-[48px] text-secondary mb-2">account_tree</span>
          <h3 className="font-headline-sm font-semibold text-on-surface">No Phases Configured</h3>
          <p className="font-body-sm text-secondary mt-1 max-w-md mx-auto">
            This contest has no assessment phases yet. Create your first diagnostic phase to begin building tasks.
          </p>
          <button
            onClick={() => setIsPhaseModalOpen(true)}
            className="mt-4 px-4 py-2 bg-primary-container text-on-primary font-label-sm font-medium rounded shadow-2xs"
          >
            Create Initial Phase
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-md">
          {/* Left Column: Phases & Task Tree */}
          <div className="lg:col-span-4 flex flex-col gap-space-sm">
            <div className="p-space-sm bg-surface-container-lowest border border-[#e2e8f0] rounded-lg">
              <span className="font-label-xs uppercase font-semibold text-secondary tracking-wider block px-2 py-1">
                Curriculum Stages ({phases.length})
              </span>
              <div className="mt-2 space-y-2">
                {phases.map((phase) => (
                  <div key={phase.id} className="border border-[#e2e8f0] rounded overflow-hidden">
                    <div className="bg-surface-container-low p-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-primary-container text-on-primary font-label-xs flex items-center justify-center font-bold">
                          {phase.phaseNumber}
                        </span>
                        <span className="font-label-sm font-semibold text-on-surface">
                          {phase.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            setEditPhaseId(phase.id);
                            setEditPhaseTitle(`Phase ${phase.phaseNumber}: ${phase.title}`);
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
                              setEditPhaseDeadline(`${getP("year")}-${getP("month")}-${getP("day")}T${getP("hour")}:${getP("minute")}`);
                            } catch {
                              setEditPhaseDeadline("");
                            }
                            setIsEditPhaseModalOpen(true);
                          }}
                          className="px-2 py-0.5 text-[11px] bg-surface-container-high hover:bg-surface-container text-on-surface font-medium rounded border border-[#e2e8f0] cursor-pointer flex items-center gap-1"
                          title="Edit Phase Deadline (Asia/Dhaka)"
                        >
                          <span className="material-symbols-outlined text-[13px]">calendar_clock</span>
                          <span>Deadline</span>
                        </button>
                        <button
                          onClick={() => {
                            setSelectedPhaseIdForTask(phase.id);
                            setIsTaskModalOpen(true);
                          }}
                          className="px-2 py-0.5 text-[11px] bg-surface-container-high hover:bg-surface-container text-on-surface font-medium rounded border border-[#e2e8f0] cursor-pointer"
                          title="Add Task to this phase"
                        >
                          + Task
                        </button>
                        <button
                          onClick={() => handleDeletePhase(phase.id, phase.title)}
                          className="p-1 text-secondary hover:text-error hover:bg-error/10 rounded transition-colors cursor-pointer"
                          title="Delete Phase"
                        >
                          <span className="material-symbols-outlined text-[14px]">delete</span>
                        </button>
                      </div>
                    </div>

                    {/* Tasks in this phase */}
                    <div className="p-1 space-y-1 bg-surface-container-lowest">
                      {phase.tasks.map((task) => (
                        <button
                          key={task.id}
                          onClick={() => setActiveTask(task)}
                          className={`w-full text-left p-2 rounded text-xs transition-colors flex items-center justify-between ${
                            activeTask?.id === task.id
                              ? "bg-primary-container text-on-primary font-medium"
                              : "hover:bg-surface-container-low text-on-surface"
                          }`}
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="material-symbols-outlined text-[14px]">
                              assignment
                            </span>
                            <span className="truncate">{task.title}</span>
                          </div>
                          <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                            activeTask?.id === task.id ? "bg-white/20 text-white" : "bg-surface-container text-secondary"
                          }`}>
                            {task.questions.length} Qs
                          </span>
                        </button>
                      ))}
                      {phase.tasks.length === 0 && (
                        <p className="text-secondary text-[11px] italic p-2 text-center">
                          No tasks. Click + Task above.
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Assessment Security Guard Note */}
            <div className="p-3 bg-surface-container-low border border-[#e2e8f0] rounded-lg text-secondary text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-on-surface mb-1">
                <span className="material-symbols-outlined text-[16px] text-primary-container">lock</span>
                Security Isolation Enforced
              </div>
              <p>
                MCQ answer keys, correct option keys, and evaluator scoring guides are strictly isolated on the server and are never serialized or transmitted to participant browsers.
              </p>
            </div>
          </div>

          {/* Right Column: Selected Task Inspector & Question Bank */}
          <div className="lg:col-span-8 flex flex-col gap-space-md">
            {activeTask ? (
              <div className="p-space-md bg-surface-container-lowest border border-[#e2e8f0] rounded-lg shadow-2xs">
                {/* Task Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-space-sm border-b border-[#e2e8f0] gap-space-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-surface-container font-label-xs font-semibold text-secondary">
                        Task #{activeTask.taskNumber}
                      </span>
                      <h2 className="font-headline-sm font-semibold text-on-surface">
                        {activeTask.title}
                      </h2>
                    </div>
                    {activeTask.instructions && (
                      <p className="font-body-sm text-secondary mt-1">
                        {activeTask.instructions}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-label-sm font-semibold text-primary-container bg-primary-fixed/20 px-2.5 py-1 rounded">
                      Total: {activeTask.totalPoints} pts
                    </span>
                    <button
                      onClick={() => handleDeleteTask(activeTask.id, activeTask.title)}
                      className="px-2.5 py-1.5 text-error hover:bg-error/10 font-label-xs font-medium rounded border border-error/20 flex items-center gap-1 transition-colors cursor-pointer"
                      title="Delete this task"
                    >
                      <span className="material-symbols-outlined text-[14px]">delete</span>
                      Delete Task
                    </button>
                    <button
                      onClick={() => {
                        setSelectedTaskIdForQ(activeTask.id);
                        setIsQuestionModalOpen(true);
                      }}
                      className="px-3 py-1.5 bg-primary-container hover:bg-[#166534] text-on-primary font-label-xs font-medium rounded shadow-2xs flex items-center gap-1 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[14px]">add</span>
                      Add Question
                    </button>
                  </div>
                </div>

                {/* Questions Section */}
                <div className="mt-space-md">
                  <div className="flex items-center justify-between mb-space-sm">
                    <span className="font-label-xs uppercase font-semibold text-secondary tracking-wider">
                      Question Bank ({activeTask.questions.length} Items)
                    </span>
                  </div>

                  {activeTask.questions.length === 0 ? (
                    <div className="p-8 text-center border border-dashed border-[#cbd5e1] rounded bg-surface-container-low">
                      <p className="font-body-sm text-secondary">
                        No questions in this task yet. Add an MCQ, written essay, or PDF upload question.
                      </p>
                      <button
                        onClick={() => {
                          setSelectedTaskIdForQ(activeTask.id);
                          setIsQuestionModalOpen(true);
                        }}
                        className="mt-2 px-3 py-1 bg-primary-container text-on-primary font-label-xs font-medium rounded"
                      >
                        + Create First Question
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-space-sm">
                      {activeTask.questions.map((q) => (
                        <div
                          key={q.id}
                          className="p-space-sm border border-[#e2e8f0] rounded-lg bg-surface-container-low hover:border-primary-container/40 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-space-sm">
                            <div className="flex items-start gap-space-xs">
                              <span className="w-6 h-6 rounded bg-surface-container text-on-surface font-label-xs font-bold flex items-center justify-center shrink-0">
                                Q{q.questionNumber}
                              </span>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                    q.type === "MCQ"
                                      ? "bg-blue-100 text-blue-800"
                                      : q.type === "WRITTEN"
                                      ? "bg-amber-100 text-amber-800"
                                      : "bg-purple-100 text-purple-800"
                                  }`}>
                                    {q.type}
                                  </span>
                                  <span className="font-label-xs text-secondary">
                                    {q.points} Points
                                  </span>
                                  {q.minWords && (
                                    <span className="font-label-xs text-secondary">
                                      · {q.minWords}-{q.maxWords} words
                                    </span>
                                  )}
                                </div>
                                <h4 className="font-body-sm font-medium text-on-surface mt-1">
                                  {q.prompt}
                                </h4>
                                {q.instructions && (
                                  <p className="font-body-xs text-secondary mt-0.5">
                                    {q.instructions}
                                  </p>
                                )}

                                {/* MCQ Options Preview */}
                                {q.type === "MCQ" && q.options.length > 0 && (
                                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5 font-body-xs">
                                    {q.options.map((opt) => (
                                      <div
                                        key={opt.id}
                                        className={`px-2 py-1 rounded border text-xs flex items-center gap-1.5 ${
                                          q.answerKey?.correctOptionKey === opt.optionKey
                                            ? "bg-[#dcfce7] border-[#86efac] text-[#166534] font-medium"
                                            : "bg-surface-container-lowest border-[#e2e8f0] text-secondary"
                                        }`}
                                      >
                                        <span className="font-bold">{opt.optionKey}.</span>
                                        <span className="truncate">{opt.text}</span>
                                        {q.answerKey?.correctOptionKey === opt.optionKey && (
                                          <span className="material-symbols-outlined text-[14px] ml-auto text-primary-container">
                                            check_circle
                                          </span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {q.answerKey?.explanation && (
                                  <div className="mt-2 p-1.5 bg-surface-container-lowest rounded border border-[#e2e8f0] text-[11px] text-secondary">
                                    <strong className="text-on-surface">Answer Key Explanation (Admin Only):</strong>{" "}
                                    {q.answerKey.explanation}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleOpenEditQuestion(q)}
                                className="p-1.5 rounded-md text-secondary hover:text-primary-container hover:bg-primary-fixed/30 transition-colors cursor-pointer"
                                title="Edit Question"
                              >
                                <span className="material-symbols-outlined text-[18px]">edit</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteQuestion(q.id, q.prompt)}
                                className="p-1.5 rounded-md text-secondary hover:text-error hover:bg-error/10 transition-colors cursor-pointer"
                                title="Delete Question"
                              >
                                <span className="material-symbols-outlined text-[18px]">delete</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Rubrics Preview for this Task */}
                <div className="mt-space-lg pt-space-md border-t border-[#e2e8f0]">
                  <span className="font-label-xs uppercase font-semibold text-secondary tracking-wider block mb-space-xs">
                    Evaluator Rubric Criteria ({activeTask.rubrics.length})
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-space-xs">
                    {activeTask.rubrics.map((r) => (
                      <div key={r.id} className="p-2.5 bg-surface-container-low rounded border border-[#e2e8f0]">
                        <span className="font-label-xs font-semibold text-on-surface block truncate">
                          {r.name}
                        </span>
                        <div className="flex items-center justify-between text-secondary text-[11px] mt-1">
                          <span>Weight: {r.weightPercentage}%</span>
                          <span>Max: {r.maxPoints} pts</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-12 text-center bg-surface-container-lowest border border-[#e2e8f0] rounded-lg">
                <p className="font-body-sm text-secondary">Select a task from the curriculum stages on the left to inspect its questions.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CREATE PHASE MODAL */}
      {isPhaseModalOpen && (
        <div className="fixed inset-0 bg-inverse-surface/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-xl max-w-md w-full p-space-lg">
            <div className="flex items-center justify-between pb-space-sm border-b border-[#e2e8f0] mb-space-md">
              <h3 className="font-headline-sm font-semibold text-on-surface">Add Curriculum Phase</h3>
              <button onClick={() => setIsPhaseModalOpen(false)} className="text-secondary hover:text-on-surface">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <form onSubmit={handleCreatePhase} className="space-y-3 font-body-sm">
              <div>
                <label className="font-label-xs text-secondary font-semibold uppercase block mb-1">
                  Phase Title *
                </label>
                <input
                  type="text"
                  required
                  value={phaseTitle}
                  onChange={(e) => setPhaseTitle(e.target.value)}
                  placeholder="e.g. Phase 2: Technical Strategy Deep Dive"
                  className="w-full px-3 py-2 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface focus:outline-none focus:border-primary-container"
                />
              </div>
              <div>
                <label className="font-label-xs text-secondary font-semibold uppercase block mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={phaseDesc}
                  onChange={(e) => setPhaseDesc(e.target.value)}
                  placeholder="Summary of benchmark expectations..."
                  className="w-full px-3 py-2 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface focus:outline-none focus:border-primary-container resize-none"
                />
              </div>
              <div>
                <label className="font-label-xs text-secondary font-semibold uppercase block mb-1">
                  Phase Deadline (Asia/Dhaka)
                </label>
                <input
                  type="datetime-local"
                  value={phaseDeadline}
                  onChange={(e) => setPhaseDeadline(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface focus:outline-none focus:border-primary-container"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#e2e8f0]">
                <button
                  type="button"
                  onClick={() => setIsPhaseModalOpen(false)}
                  className="px-4 py-2 rounded bg-surface-container-high text-on-surface font-label-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPhase}
                  className="px-4 py-2 rounded bg-primary-container text-on-primary font-label-md font-medium"
                >
                  {isSubmittingPhase ? "Creating..." : "Save Phase"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE TASK MODAL */}
      {isTaskModalOpen && (
        <div className="fixed inset-0 bg-inverse-surface/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-xl max-w-md w-full p-space-lg">
            <div className="flex items-center justify-between pb-space-sm border-b border-[#e2e8f0] mb-space-md">
              <h3 className="font-headline-sm font-semibold text-on-surface">Add Assessment Task</h3>
              <button onClick={() => setIsTaskModalOpen(false)} className="text-secondary hover:text-on-surface">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <form onSubmit={handleCreateTask} className="space-y-3 font-body-sm">
              <div>
                <label className="font-label-xs text-secondary font-semibold uppercase block mb-1">
                  Task Title *
                </label>
                <input
                  type="text"
                  required
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="e.g. Task 1.2: Financial Impact Matrix"
                  className="w-full px-3 py-2 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface focus:outline-none focus:border-primary-container"
                />
              </div>
              <div>
                <label className="font-label-xs text-secondary font-semibold uppercase block mb-1">
                  Instructions for Candidate
                </label>
                <textarea
                  rows={2}
                  value={taskInstructions}
                  onChange={(e) => setTaskInstructions(e.target.value)}
                  placeholder="Provide guidance on what to calculate and submit..."
                  className="w-full px-3 py-2 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface focus:outline-none focus:border-primary-container resize-none"
                />
              </div>
              <div>
                <label className="font-label-xs text-secondary font-semibold uppercase block mb-1">
                  Total Points
                </label>
                <input
                  type="number"
                  min="10"
                  max="500"
                  value={taskPoints}
                  onChange={(e) => setTaskPoints(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface focus:outline-none focus:border-primary-container"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#e2e8f0]">
                <button
                  type="button"
                  onClick={() => setIsTaskModalOpen(false)}
                  className="px-4 py-2 rounded bg-surface-container-high text-on-surface font-label-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingTask}
                  className="px-4 py-2 rounded bg-primary-container text-on-primary font-label-md font-medium"
                >
                  {isSubmittingTask ? "Saving..." : "Create Task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE QUESTION MODAL */}
      {isQuestionModalOpen && (
        <div className="fixed inset-0 bg-inverse-surface/40 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-xl max-w-lg w-full p-space-lg my-8">
            <div className="flex items-center justify-between pb-space-sm border-b border-[#e2e8f0] mb-space-md">
              <h3 className="font-headline-sm font-semibold text-on-surface">Add Question</h3>
              <button onClick={() => setIsQuestionModalOpen(false)} className="text-secondary hover:text-on-surface">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <form onSubmit={handleCreateQuestion} className="space-y-3 font-body-sm">
              <div>
                <label className="font-label-xs text-secondary font-semibold uppercase block mb-1">
                  Question Type
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["MCQ", "WRITTEN", "FILE_UPLOAD"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setQType(t)}
                      className={`py-1.5 rounded font-label-xs font-semibold border transition-colors ${
                        qType === t
                          ? "bg-primary-container text-on-primary border-primary-container"
                          : "bg-surface-container-low text-secondary border-[#e2e8f0] hover:bg-surface-container"
                      }`}
                    >
                      {t === "MCQ" ? "MCQ" : t === "WRITTEN" ? "Written Essay" : "PDF Upload"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="font-label-xs text-secondary font-semibold uppercase block mb-1">
                  Question Prompt *
                </label>
                <textarea
                  required
                  rows={2}
                  value={qPrompt}
                  onChange={(e) => setQPrompt(e.target.value)}
                  placeholder="Enter the question or case prompt..."
                  className="w-full px-3 py-2 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface focus:outline-none focus:border-primary-container resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-label-xs text-secondary font-semibold uppercase block mb-1">
                    Points Awarded
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={qPoints}
                    onChange={(e) => setQPoints(Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface focus:outline-none"
                  />
                </div>
                {qType === "WRITTEN" && (
                  <div className="grid grid-cols-2 gap-1.5">
                    <div>
                      <label className="font-label-xs text-secondary font-semibold uppercase block mb-1">Min Words</label>
                      <input
                        type="number"
                        value={qMinWords}
                        onChange={(e) => setQMinWords(Number(e.target.value))}
                        className="w-full px-2 py-1.5 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-label-xs text-secondary font-semibold uppercase block mb-1">Max Words</label>
                      <input
                        type="number"
                        value={qMaxWords}
                        onChange={(e) => setQMaxWords(Number(e.target.value))}
                        className="w-full px-2 py-1.5 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* MCQ Options Configuration */}
              {qType === "MCQ" && (
                <div className="space-y-2 pt-2 border-t border-[#e2e8f0]">
                  <label className="font-label-xs text-secondary font-semibold uppercase block">
                    MCQ Options & Answer Key
                  </label>
                  <div className="space-y-1.5">
                    {[
                      { key: "A", val: mcqOptA, set: setMcqOptA },
                      { key: "B", val: mcqOptB, set: setMcqOptB },
                      { key: "C", val: mcqOptC, set: setMcqOptC },
                      { key: "D", val: mcqOptD, set: setMcqOptD },
                    ].map((opt) => (
                      <div key={opt.key} className="flex items-center gap-2">
                        <span className="w-5 font-bold text-xs text-secondary">{opt.key}:</span>
                        <input
                          type="text"
                          required
                          value={opt.val}
                          onChange={(e) => opt.set(e.target.value)}
                          placeholder={`Option ${opt.key} text`}
                          className="flex-1 px-2.5 py-1 text-xs rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface"
                        />
                        <label className="flex items-center gap-1 cursor-pointer text-xs text-secondary">
                          <input
                            type="radio"
                            name="correctOpt"
                            checked={correctOption === opt.key}
                            onChange={() => setCorrectOption(opt.key)}
                            className="accent-primary-container"
                          />
                          <span>Correct</span>
                        </label>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2">
                    <label className="font-label-xs text-secondary font-semibold uppercase block mb-1">
                      Explanation (Private Answer Key)
                    </label>
                    <input
                      type="text"
                      value={explanation}
                      onChange={(e) => setExplanation(e.target.value)}
                      placeholder="Why is this option correct? (Visible only to admins & evaluators)"
                      className="w-full px-2.5 py-1.5 text-xs rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface"
                    />
                  </div>
                </div>
              )}

              {/* Scoring Guide */}
              <div>
                <label className="font-label-xs text-secondary font-semibold uppercase block mb-1">
                  Scoring Rubric / Evaluator Guide
                </label>
                <textarea
                  rows={2}
                  value={scoringGuide}
                  onChange={(e) => setScoringGuide(e.target.value)}
                  placeholder="Private rubric benchmarks for scoring..."
                  className="w-full px-3 py-1.5 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface text-xs resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#e2e8f0]">
                <button
                  type="button"
                  onClick={() => setIsQuestionModalOpen(false)}
                  className="px-4 py-2 rounded bg-surface-container-high text-on-surface font-label-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingQuestion}
                  className="px-4 py-2 rounded bg-primary-container text-on-primary font-label-md font-medium"
                >
                  {isSubmittingQuestion ? "Saving..." : "Save Question"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Phase Deadline Modal */}
      {isEditPhaseModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest max-w-md w-full rounded-xl border border-[#e2e8f0] shadow-2xl p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#e2e8f0]">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px] text-primary-container">calendar_clock</span>
                <h3 className="font-headline-sm font-semibold text-on-surface">Update Phase Deadline</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsEditPhaseModalOpen(false)}
                className="text-secondary hover:text-on-surface font-bold text-lg"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleUpdatePhaseDeadline} className="flex flex-col gap-4">
              <div>
                <span className="font-label-xs text-secondary uppercase font-semibold block mb-1">
                  Target Stage
                </span>
                <p className="text-sm font-medium text-on-surface">{editPhaseTitle}</p>
              </div>

              <div>
                <label className="font-label-xs text-secondary font-semibold uppercase block mb-1">
                  New Phase Deadline (Asia/Dhaka UTC+06:00) *
                </label>
                <input
                  type="datetime-local"
                  required
                  value={editPhaseDeadline}
                  onChange={(e) => setEditPhaseDeadline(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface font-label-md"
                />
                <p className="text-[11px] text-secondary mt-1">
                  Active candidate countdown timers will automatically re-synchronize and recalculate smoothly without interrupting candidate drafts.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#e2e8f0]">
                <button
                  type="button"
                  onClick={() => setIsEditPhaseModalOpen(false)}
                  disabled={isUpdatingPhaseDeadline}
                  className="px-4 py-2 rounded bg-surface-container-high text-on-surface font-label-md font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingPhaseDeadline}
                  className="px-4 py-2 rounded bg-primary-container hover:bg-[#166534] text-on-primary font-label-md font-medium flex items-center gap-1.5"
                >
                  {isUpdatingPhaseDeadline ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save Deadline</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Question Modal */}
      <EditQuestionModal
        isOpen={isEditQuestionModalOpen}
        question={editingQuestion}
        taskId={activeTask?.id || ""}
        contestId={selectedContestId}
        onClose={() => {
          setIsEditQuestionModalOpen(false);
          setEditingQuestion(null);
        }}
        onSuccess={handleEditQuestionSuccess}
      />

      {/* Universal Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={deleteModalState.isOpen}
        title={deleteModalState.title}
        itemDescription={deleteModalState.itemDescription}
        warningDetails={deleteModalState.warningDetails}
        isDeleting={isDeletingItem}
        onConfirm={deleteModalState.onConfirm}
        onClose={() => setDeleteModalState((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
