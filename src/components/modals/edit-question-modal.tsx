"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  updateQuestionAction,
  type TaskBuilderQuestion,
} from "@/app/actions/task-builder-actions";

export interface EditQuestionModalProps {
  isOpen: boolean;
  question: TaskBuilderQuestion | null;
  taskId: string;
  contestId: string;
  onClose: () => void;
  onSuccess: (updatedQuestionId: string, message: string) => Promise<void> | void;
}

interface EditableOption {
  id?: string;
  optionKey: string;
  text: string;
  scopeTag?: string;
}

export function EditQuestionModal({
  isOpen,
  question,
  taskId,
  contestId,
  onClose,
  onSuccess,
}: EditQuestionModalProps) {
  // Form State
  const [prompt, setPrompt] = useState("");
  const [instructions, setInstructions] = useState("");
  const [points, setPoints] = useState<number>(10);
  const [questionNumber, setQuestionNumber] = useState<number>(1);
  const [type, setType] = useState<"MCQ" | "WRITTEN" | "FILE_UPLOAD">("MCQ");
  const [minWords, setMinWords] = useState<number>(200);
  const [maxWords, setMaxWords] = useState<number>(400);

  // MCQ state
  const [options, setOptions] = useState<EditableOption[]>([]);
  const [correctOptionKey, setCorrectOptionKey] = useState<string>("A");
  const [explanation, setExplanation] = useState("");
  const [scoringGuide, setScoringGuide] = useState("");

  // Safety & UI State
  const [submissionCount, setSubmissionCount] = useState<number>(0);
  const [confirmImpact, setConfirmImpact] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Initial snapshot to track dirty state
  const initialSnapshotRef = useRef<string>("");

  // Populate form whenever question changes or modal opens
  useEffect(() => {
    if (question && isOpen) {
      setPrompt(question.prompt || "");
      setInstructions(question.instructions || "");
      setPoints(question.points || 10);
      setQuestionNumber(question.questionNumber || 1);
      setType(
        question.type === "MCQ" || question.type === "WRITTEN" || question.type === "FILE_UPLOAD"
          ? question.type
          : "MCQ"
      );
      setMinWords(question.minWords || 200);
      setMaxWords(question.maxWords || 400);

      const defaultOptions: EditableOption[] =
        question.options && question.options.length > 0
          ? question.options.map((o) => ({
              id: o.id,
              optionKey: o.optionKey,
              text: o.text,
              scopeTag: o.scopeTag || undefined,
            }))
          : [
              { optionKey: "A", text: "" },
              { optionKey: "B", text: "" },
              { optionKey: "C", text: "" },
              { optionKey: "D", text: "" },
            ];

      setOptions(defaultOptions);
      setCorrectOptionKey(question.answerKey?.correctOptionKey || "A");
      setExplanation(question.answerKey?.explanation || "");
      setScoringGuide(question.answerKey?.scoringGuide || "");
      setSubmissionCount(question.submissionCount || 0);
      setConfirmImpact(false);
      setErrorMessage(null);

      // Snapshot for dirty checking
      initialSnapshotRef.current = JSON.stringify({
        prompt: question.prompt || "",
        instructions: question.instructions || "",
        points: question.points || 10,
        questionNumber: question.questionNumber || 1,
        type: question.type,
        minWords: question.minWords,
        maxWords: question.maxWords,
        correctOptionKey: question.answerKey?.correctOptionKey || "A",
        explanation: question.answerKey?.explanation || "",
        scoringGuide: question.answerKey?.scoringGuide || "",
        options: defaultOptions.map((o) => ({ key: o.optionKey, text: o.text })),
      });
    }
  }, [question, isOpen]);

  // Check if form has unsaved modifications
  const isDirty = (): boolean => {
    if (!initialSnapshotRef.current) return false;
    const current = JSON.stringify({
      prompt,
      instructions,
      points,
      questionNumber,
      type,
      minWords,
      maxWords,
      correctOptionKey,
      explanation,
      scoringGuide,
      options: options.map((o) => ({ key: o.optionKey, text: o.text })),
    });
    return current !== initialSnapshotRef.current;
  };

  const handleSafeClose = () => {
    if (isDirty()) {
      const confirmDiscard = window.confirm(
        "You have unsaved changes to this question. Are you sure you want to discard them?"
      );
      if (!confirmDiscard) return;
    }
    onClose();
  };

  const handleOptionTextChange = (index: number, newText: string) => {
    setOptions((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], text: newText };
      return next;
    });
  };

  const handleAddOption = () => {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const existingKeys = new Set(options.map((o) => o.optionKey.toUpperCase()));
    let nextLetter = "A";
    for (let i = 0; i < letters.length; i++) {
      if (!existingKeys.has(letters[i])) {
        nextLetter = letters[i];
        break;
      }
    }
    setOptions((prev) => [...prev, { optionKey: nextLetter, text: "" }]);
  };

  const handleRemoveOption = (indexToRemove: number) => {
    if (options.length <= 2) {
      setErrorMessage("An MCQ question must have at least 2 answer options.");
      return;
    }
    const removedKey = options[indexToRemove].optionKey;
    const remaining = options.filter((_, i) => i !== indexToRemove);
    setOptions(remaining);
    // If the removed option was the correct one, reassign to the first remaining
    if (correctOptionKey === removedKey && remaining.length > 0) {
      setCorrectOptionKey(remaining[0].optionKey);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question) return;

    setErrorMessage(null);

    // Client-side validations
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setErrorMessage("Question prompt text is required.");
      return;
    }

    if (isNaN(points) || points <= 0 || !Number.isInteger(Number(points))) {
      setErrorMessage("Marks assigned to the question must be a positive whole number.");
      return;
    }

    if (type === "MCQ") {
      if (options.length < 2) {
        setErrorMessage("MCQ questions require at least 2 answer options.");
        return;
      }

      for (const opt of options) {
        if (!opt.text.trim()) {
          setErrorMessage(`Option ${opt.optionKey} text cannot be empty.`);
          return;
        }
      }

      const availableKeys = options.map((o) => o.optionKey.toUpperCase());
      if (!availableKeys.includes(correctOptionKey.toUpperCase())) {
        setErrorMessage(`Selected correct answer (${correctOptionKey}) does not match any valid option.`);
        return;
      }
    }

    if (type === "WRITTEN") {
      if (minWords > maxWords) {
        setErrorMessage("Minimum word count cannot exceed maximum word count.");
        return;
      }
    }

    if (submissionCount > 0 && !confirmImpact) {
      setErrorMessage(
        "Please check the confirmation box acknowledging changes to an active question with existing submissions."
      );
      return;
    }

    try {
      setIsSubmitting(true);

      const res = await updateQuestionAction({
        questionId: question.id,
        expectedTaskId: taskId,
        expectedContestId: contestId,
        questionNumber: Number(questionNumber),
        type,
        prompt: trimmedPrompt,
        instructions: instructions.trim() || undefined,
        points: Number(points),
        minWords: type === "WRITTEN" ? Number(minWords) : undefined,
        maxWords: type === "WRITTEN" ? Number(maxWords) : undefined,
        options:
          type === "MCQ"
            ? options.map((o) => ({
                optionKey: o.optionKey.trim().toUpperCase(),
                text: o.text.trim(),
                scopeTag: o.scopeTag || undefined,
              }))
            : undefined,
        correctOptionKey: type === "MCQ" ? correctOptionKey.trim().toUpperCase() : undefined,
        explanation: type === "MCQ" ? explanation.trim() : undefined,
        scoringGuide: scoringGuide.trim() || undefined,
        confirmSubmissionImpact: confirmImpact,
      });

      if (res.success) {
        await onSuccess(
          question.id,
          `Question Q${questionNumber} updated successfully.`
        );
        onClose();
      } else if (res.requiresConfirmation) {
        setErrorMessage(res.warning || "Confirmation required to proceed.");
      } else {
        setErrorMessage(res.error || "Failed to update question.");
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Network error updating question.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !question) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-question-title"
    >
      <div className="bg-surface-container-lowest max-w-2xl w-full max-h-[92vh] flex flex-col rounded-xl border border-[#e2e8f0] shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-[#e2e8f0] flex items-center justify-between bg-surface-container-low/40">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-primary-fixed/40 text-primary-container flex items-center justify-center">
              <span className="material-symbols-outlined text-[20px]">edit_note</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="edit-question-title" className="font-headline-sm font-semibold text-on-surface">
                  Edit Question Q{questionNumber}
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-800">
                  {type}
                </span>
                <span className="text-xs font-semibold text-secondary">
                  {points} {points === 1 ? "Mark" : "Marks"}
                </span>
              </div>
              <p className="text-xs text-secondary mt-0.5">
                Update prompt, options, answer key, marks, or instructions.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSafeClose}
            className="w-8 h-8 rounded-lg hover:bg-surface-container text-secondary hover:text-on-surface flex items-center justify-center transition-colors cursor-pointer"
            title="Close"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {/* Validation Error Alert */}
          {errorMessage && (
            <div className="p-3 rounded-lg bg-error-container/60 border border-error/20 text-error text-xs flex items-start gap-2">
              <span className="material-symbols-outlined text-[16px] shrink-0 mt-0.5">error</span>
              <span className="leading-relaxed">{errorMessage}</span>
            </div>
          )}

          {/* Existing Submissions Safety Warning */}
          {submissionCount > 0 && (
            <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs flex flex-col gap-2">
              <div className="flex items-center gap-1.5 font-semibold text-amber-950">
                <span className="material-symbols-outlined text-[18px] text-amber-600">warning</span>
                <span>Active Assessment Warning ({submissionCount} submissions recorded)</span>
              </div>
              <p className="leading-relaxed text-amber-900/90">
                This question has already been completed or drafted by candidates. Modifying its prompt, options,
                answer key, or marks will apply to future submissions and evaluator grading, but will not alter previously
                finalized candidate scores or published leaderboards.
              </p>
              <label className="flex items-center gap-2 mt-1 cursor-pointer font-medium text-amber-950">
                <input
                  type="checkbox"
                  checked={confirmImpact}
                  onChange={(e) => setConfirmImpact(e.target.checked)}
                  className="rounded border-amber-300 text-primary-container focus:ring-primary-container"
                />
                <span>I understand and confirm saving modifications for this active question.</span>
              </label>
            </div>
          )}

          {/* Quick Correct Answer Selector for MCQ */}
          {type === "MCQ" && (
            <div className="p-3.5 rounded-lg bg-[#f0fdf4] border border-[#bbf7d0] text-emerald-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="font-label-xs uppercase font-bold text-emerald-800 tracking-wider block">
                  Designated Correct Answer
                </span>
                <span className="text-xs text-emerald-900">
                  Click any option to change only the answer key instantly:
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {options.map((opt) => (
                  <button
                    key={opt.optionKey}
                    type="button"
                    onClick={() => setCorrectOptionKey(opt.optionKey)}
                    className={`px-3 py-1.5 rounded-md font-bold text-xs transition-all cursor-pointer flex items-center gap-1 ${
                      correctOptionKey === opt.optionKey
                        ? "bg-[#166534] text-white shadow-xs scale-105"
                        : "bg-white text-emerald-900 border border-[#86efac] hover:bg-emerald-50"
                    }`}
                  >
                    <span>{opt.optionKey}</span>
                    {correctOptionKey === opt.optionKey && (
                      <span className="material-symbols-outlined text-[14px]">check</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Core Fields Grid: Question Number, Type, Points */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="font-label-xs text-secondary font-semibold uppercase block mb-1">
                Order Number
              </label>
              <input
                type="number"
                min="1"
                required
                value={questionNumber}
                onChange={(e) => setQuestionNumber(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full px-3 py-1.5 text-xs rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface"
              />
            </div>

            <div>
              <label className="font-label-xs text-secondary font-semibold uppercase block mb-1">
                Question Type
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as any)}
                disabled={submissionCount > 0}
                className="w-full px-3 py-1.5 text-xs rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface disabled:opacity-60 cursor-pointer"
              >
                <option value="MCQ">MCQ (Multiple Choice)</option>
                <option value="WRITTEN">Written / Long Answer</option>
                <option value="FILE_UPLOAD">File Upload (PDF)</option>
              </select>
              {submissionCount > 0 && (
                <span className="text-[10px] text-secondary mt-0.5 block">
                  Locked (submissions exist)
                </span>
              )}
            </div>

            <div>
              <label className="font-label-xs text-secondary font-semibold uppercase block mb-1">
                Marks / Points *
              </label>
              <input
                type="number"
                min="1"
                required
                value={points}
                onChange={(e) => setPoints(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full px-3 py-1.5 text-xs rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface"
              />
            </div>
          </div>

          {/* Question Prompt */}
          <div>
            <label className="font-label-xs text-secondary font-semibold uppercase block mb-1">
              Question Prompt / Text *
            </label>
            <textarea
              required
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter full question text..."
              className="w-full px-3 py-2 text-xs rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface resize-none focus:outline-none focus:border-primary-container"
            />
          </div>

          {/* Candidate Instructions */}
          <div>
            <label className="font-label-xs text-secondary font-semibold uppercase block mb-1">
              Instructions (Optional)
            </label>
            <input
              type="text"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. Choose the single best answer based on market dynamics."
              className="w-full px-3 py-1.5 text-xs rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface"
            />
          </div>

          {/* Written Question Word Limits */}
          {type === "WRITTEN" && (
            <div className="grid grid-cols-2 gap-3 p-3 bg-surface-container-low rounded-lg border border-[#e2e8f0]">
              <div>
                <label className="font-label-xs text-secondary font-semibold uppercase block mb-1">
                  Min Word Count
                </label>
                <input
                  type="number"
                  min="0"
                  value={minWords}
                  onChange={(e) => setMinWords(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 text-xs rounded bg-surface-container-lowest border border-[#e2e8f0] text-on-surface"
                />
              </div>
              <div>
                <label className="font-label-xs text-secondary font-semibold uppercase block mb-1">
                  Max Word Count
                </label>
                <input
                  type="number"
                  min="1"
                  value={maxWords}
                  onChange={(e) => setMaxWords(parseInt(e.target.value) || 100)}
                  className="w-full px-3 py-1.5 text-xs rounded bg-surface-container-lowest border border-[#e2e8f0] text-on-surface"
                />
              </div>
            </div>
          )}

          {/* MCQ Options List */}
          {type === "MCQ" && (
            <div className="space-y-3 pt-3 border-t border-[#e2e8f0]">
              <div className="flex items-center justify-between">
                <label className="font-label-xs text-secondary font-semibold uppercase block">
                  MCQ Answer Options ({options.length})
                </label>
                <button
                  type="button"
                  onClick={handleAddOption}
                  className="text-xs text-primary-container hover:text-[#166534] font-medium flex items-center gap-1 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[14px]">add_circle</span>
                  <span>Add Option</span>
                </button>
              </div>

              <div className="space-y-2">
                {options.map((opt, idx) => (
                  <div
                    key={opt.optionKey}
                    className={`flex items-center gap-2 p-2 rounded-lg border transition-colors ${
                      correctOptionKey === opt.optionKey
                        ? "bg-[#f0fdf4] border-[#86efac]"
                        : "bg-surface-container-low border-[#e2e8f0]"
                    }`}
                  >
                    <span className="w-6 font-bold text-xs text-center text-secondary">
                      {opt.optionKey}.
                    </span>

                    <input
                      type="text"
                      required
                      value={opt.text}
                      onChange={(e) => handleOptionTextChange(idx, e.target.value)}
                      placeholder={`Option ${opt.optionKey} text`}
                      className="flex-1 px-2.5 py-1 text-xs rounded bg-surface-container-lowest border border-[#e2e8f0] text-on-surface focus:outline-none focus:border-primary-container"
                    />

                    {/* Radio Button to designate Correct */}
                    <label className="flex items-center gap-1 text-xs font-semibold text-secondary cursor-pointer shrink-0 px-2 py-1 rounded hover:bg-surface-container">
                      <input
                        type="radio"
                        name="correctOptionRadio"
                        checked={correctOptionKey === opt.optionKey}
                        onChange={() => setCorrectOptionKey(opt.optionKey)}
                        className="accent-primary-container cursor-pointer"
                      />
                      <span className={correctOptionKey === opt.optionKey ? "text-[#166534]" : ""}>
                        Correct
                      </span>
                    </label>

                    {/* Delete Option (only allowed if > 2) */}
                    {options.length > 2 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveOption(idx)}
                        className="p-1 text-secondary hover:text-error hover:bg-error/10 rounded cursor-pointer transition-colors"
                        title={`Remove Option ${opt.optionKey}`}
                      >
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Private Explanation */}
              <div className="pt-2">
                <label className="font-label-xs text-secondary font-semibold uppercase block mb-1">
                  Answer Key Explanation (Admins & Evaluators Only)
                </label>
                <input
                  type="text"
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  placeholder="Rationale for why this answer is correct..."
                  className="w-full px-3 py-1.5 text-xs rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface"
                />
              </div>
            </div>
          )}

          {/* Evaluator Scoring Rubric / Guide */}
          <div>
            <label className="font-label-xs text-secondary font-semibold uppercase block mb-1">
              Scoring Rubric / Evaluator Benchmark Guide (Private)
            </label>
            <textarea
              rows={2}
              value={scoringGuide}
              onChange={(e) => setScoringGuide(e.target.value)}
              placeholder="Private guidance notes for manual evaluators..."
              className="w-full px-3 py-1.5 text-xs rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface resize-none"
            />
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-[#e2e8f0]">
            <button
              type="button"
              onClick={handleSafeClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-label-md transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || (submissionCount > 0 && !confirmImpact)}
              className="px-4 py-2 rounded-lg bg-primary-container hover:bg-[#166534] text-on-primary font-label-md font-medium transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">save</span>
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

