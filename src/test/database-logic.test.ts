import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateMcqScore,
  calculateWeightedRubricScore,
  checkSubmissionDeadline,
  checkUserPermission,
  sanitizeQuestionForParticipant,
  sanitizeSubmissionAnswerForParticipant,
  sanitizeSubmissionForParticipant,
  type McqAnswerKey,
  type ParticipantMcqAnswer,
  type RubricScoreInput,
} from "../lib/scoring";

describe("Database & Assessment Security Engine Tests", () => {
  // ---------------------------------------------------------------------------
  // 1. MCQ Auto-Grading & Answer Key Secrecy
  // ---------------------------------------------------------------------------
  describe("MCQ Server-Side Auto-Grading", () => {
    const sampleKeys: McqAnswerKey[] = [
      { questionId: "q1", correctOptionKey: "B", points: 10 },
      { questionId: "q2", correctOptionKey: "C", points: 15 },
    ];

    it("should award full points for correct answers", () => {
      const answers: ParticipantMcqAnswer[] = [
        { questionId: "q1", selectedOption: "B" },
        { questionId: "q2", selectedOption: "C" },
      ];

      const result = calculateMcqScore(answers, sampleKeys);
      assert.equal(result.totalPointsAwarded, 25);
      assert.equal(result.maxPossiblePoints, 25);
      assert.equal(result.itemResults[0].isCorrect, true);
      assert.equal(result.itemResults[1].isCorrect, true);
    });

    it("should award zero points for incorrect selections", () => {
      const answers: ParticipantMcqAnswer[] = [
        { questionId: "q1", selectedOption: "A" },
        { questionId: "q2", selectedOption: "D" },
      ];

      const result = calculateMcqScore(answers, sampleKeys);
      assert.equal(result.totalPointsAwarded, 0);
      assert.equal(result.itemResults[0].isCorrect, false);
      assert.equal(result.itemResults[1].isCorrect, false);
    });

    it("should be case-insensitive and handle whitespace trimming", () => {
      const answers: ParticipantMcqAnswer[] = [
        { questionId: "q1", selectedOption: " b " },
        { questionId: "q2", selectedOption: " c\n" },
      ];

      const result = calculateMcqScore(answers, sampleKeys);
      assert.equal(result.totalPointsAwarded, 25);
      assert.equal(result.itemResults[0].isCorrect, true);
    });

    it("should handle unkeyed questions safely without throwing", () => {
      const answers: ParticipantMcqAnswer[] = [
        { questionId: "unknown-q", selectedOption: "A" },
      ];

      const result = calculateMcqScore(answers, sampleKeys);
      assert.equal(result.totalPointsAwarded, 0);
      assert.equal(result.maxPossiblePoints, 0);
      assert.equal(result.itemResults[0].isCorrect, false);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Evaluator Rubric Weighted Scoring
  // ---------------------------------------------------------------------------
  describe("Evaluator Rubric Weighted Scoring Calculation", () => {
    it("should accurately compute weighted scores across rubrics", () => {
      const rubrics: RubricScoreInput[] = [
        { rubricId: "r1", name: "Analytical Depth", weightPercentage: 40, maxPoints: 40, scoreAwarded: 36 }, // 36/40 * 40 = 36
        { rubricId: "r2", name: "ESG Alignment", weightPercentage: 35, maxPoints: 35, scoreAwarded: 28 },    // 28/35 * 35 = 28
        { rubricId: "r3", name: "Communication", weightPercentage: 25, maxPoints: 25, scoreAwarded: 20 },    // 20/25 * 25 = 20
      ];

      const result = calculateWeightedRubricScore(rubrics);
      // Total = 36 + 28 + 20 = 84
      assert.equal(result.weightedScore, 84);
      assert.equal(result.maxWeightTotal, 100);
      assert.equal(result.normalizedTo100, 84);
    });

    it("should clamp scores awarded within [0, maxPoints] boundary", () => {
      const rubrics: RubricScoreInput[] = [
        { rubricId: "r1", name: "Analytical Depth", weightPercentage: 50, maxPoints: 50, scoreAwarded: 60 }, // over max
        { rubricId: "r2", name: "ESG Alignment", weightPercentage: 50, maxPoints: 50, scoreAwarded: -10 },   // below 0
      ];

      const result = calculateWeightedRubricScore(rubrics);
      // r1 clamps to 50 (50/50 * 50 = 50), r2 clamps to 0 (0/50 * 50 = 0)
      assert.equal(result.weightedScore, 50);
      assert.equal(result.normalizedTo100, 50);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Strict Server-Side Deadline Enforcement
  // ---------------------------------------------------------------------------
  describe("Server-Side Deadline Enforcement", () => {
    const deadline = new Date("2025-02-28T23:59:59Z");

    it("should accept submissions timestamped before the deadline", () => {
      const onTimeServerTime = new Date("2025-02-28T23:55:00Z");
      const check = checkSubmissionDeadline(deadline, onTimeServerTime);

      assert.equal(check.isEligible, true);
      assert.equal(check.isLate, false);
      assert.equal(check.reason, undefined);
    });

    it("should reject submissions timestamped after the deadline", () => {
      const lateServerTime = new Date("2025-03-01T00:00:01Z"); // 2 seconds late
      const check = checkSubmissionDeadline(deadline, lateServerTime);

      assert.equal(check.isEligible, false);
      assert.equal(check.isLate, true);
      assert.match(check.reason!, /after the cutoff deadline/);
    });

    it("should support configured grace periods for network latency", () => {
      const lateTime = new Date("2025-03-01T00:00:30Z"); // 31s late
      // With 60s grace buffer
      const check = checkSubmissionDeadline(deadline, lateTime, 60);

      assert.equal(check.isEligible, true);
      assert.equal(check.isLate, false);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Role-Based Permissions & Access Control
  // ---------------------------------------------------------------------------
  describe("Role-Based Authorization Permissions", () => {
    it("should permit participants to submit tasks but forbid grading, publishing, and role changes", () => {
      assert.equal(checkUserPermission("PARTICIPANT", "SUBMIT_TASK"), true);
      assert.equal(checkUserPermission("PARTICIPANT", "VIEW_CONTEST"), true);
      assert.equal(checkUserPermission("PARTICIPANT", "GRADE_SUBMISSION"), false);
      assert.equal(checkUserPermission("PARTICIPANT", "PUBLISH_RESULTS"), false);
      assert.equal(checkUserPermission("PARTICIPANT", "EDIT_CONTEST"), false);
      assert.equal(checkUserPermission("PARTICIPANT", "CHANGE_ROLE"), false);
    });

    it("should permit evaluators to grade submissions but forbid submitting tasks, publishing, and role changes", () => {
      assert.equal(checkUserPermission("EVALUATOR", "GRADE_SUBMISSION"), true);
      assert.equal(checkUserPermission("EVALUATOR", "VIEW_CONTEST"), true);
      assert.equal(checkUserPermission("EVALUATOR", "SUBMIT_TASK"), false);
      assert.equal(checkUserPermission("EVALUATOR", "PUBLISH_RESULTS"), false);
      assert.equal(checkUserPermission("EVALUATOR", "CHANGE_ROLE"), false);
    });

    it("should permit admins full privileges including role modification", () => {
      assert.equal(checkUserPermission("ADMIN", "GRADE_SUBMISSION"), true);
      assert.equal(checkUserPermission("ADMIN", "PUBLISH_RESULTS"), true);
      assert.equal(checkUserPermission("ADMIN", "EDIT_CONTEST"), true);
      assert.equal(checkUserPermission("ADMIN", "VIEW_CONTEST"), true);
      assert.equal(checkUserPermission("ADMIN", "CHANGE_ROLE"), true);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Participant-Facing Answer Key Sanitization & Score Masking
  // ---------------------------------------------------------------------------
  describe("Participant-Facing Data Sanitization & Secrecy", () => {
    it("should completely strip private answerKey from question objects", () => {
      const rawQuestion = {
        id: "q-101",
        prompt: "Scope 1 emissions definition?",
        points: 10,
        options: [
          { optionKey: "A", text: "Purchased electricity" },
          { optionKey: "B", text: "Direct boiler combustion" },
        ],
        answerKey: {
          id: "ak-101",
          correctOptionKey: "B",
          explanation: "Scope 1 covers direct owned combustions.",
          scoringGuide: "Award full 10 points for B.",
        },
      };

      const sanitized = sanitizeQuestionForParticipant(rawQuestion);
      assert.equal("answerKey" in sanitized, false);
      assert.equal((sanitized as typeof rawQuestion).answerKey, undefined);
      assert.equal(sanitized.prompt, "Scope 1 emissions definition?");
      assert.equal(sanitized.options.length, 2);
    });

    it("should mask interim score and isCorrect indicators while contest is unpublished", () => {
      const rawAnswer = {
        id: "ans-1",
        questionId: "q-101",
        selectedOption: "B",
        score: 10,
        isCorrect: true,
      };

      const hiddenAnswer = sanitizeSubmissionAnswerForParticipant(rawAnswer, false);
      assert.equal(hiddenAnswer.score, null);
      assert.equal(hiddenAnswer.isCorrect, null);
      assert.equal(hiddenAnswer.selectedOption, "B");

      const revealedAnswer = sanitizeSubmissionAnswerForParticipant(rawAnswer, true);
      assert.equal(revealedAnswer.score, 10);
      assert.equal(revealedAnswer.isCorrect, true);
    });

    it("should mask overall submission scores and nested answers when contest is unpublished", () => {
      const rawSubmission = {
        id: "sub-1",
        taskId: "task-1",
        userId: "user-1",
        autoGradeScore: 25,
        manualGradeScore: 60,
        finalScore: 85,
        answers: [
          { questionId: "q1", selectedOption: "A", score: 10, isCorrect: true },
          { questionId: "q2", selectedOption: "B", score: 15, isCorrect: true },
        ],
      };

      const hiddenSubmission = sanitizeSubmissionForParticipant(rawSubmission, false);
      assert.equal(hiddenSubmission.autoGradeScore, null);
      assert.equal(hiddenSubmission.manualGradeScore, null);
      assert.equal(hiddenSubmission.finalScore, null);
      assert.equal(hiddenSubmission.answers![0].score, null);
      assert.equal(hiddenSubmission.answers![0].isCorrect, null);

      const publishedSubmission = sanitizeSubmissionForParticipant(rawSubmission, true);
      assert.equal(publishedSubmission.autoGradeScore, 25);
      assert.equal(publishedSubmission.finalScore, 85);
      assert.equal(publishedSubmission.answers![0].score, 10);
    });
  });
});

