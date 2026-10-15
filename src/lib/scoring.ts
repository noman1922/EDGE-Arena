/**
 * Server-Side Assessment Scoring & Validation Engine
 * 
 * CRITICAL SECURITY PRINCIPLES:
 * 1. Answer keys are stored server-side only and never sent to participant clients.
 * 2. Client clock time is untrusted; all deadline validations check the server timestamp against phase.deadline.
 * 3. Scores are computed exclusively on the server.
 */

export interface McqAnswerKey {
  questionId: string;
  correctOptionKey: string;
  points: number;
}

export interface ParticipantMcqAnswer {
  questionId: string;
  selectedOption: string;
}

export interface RubricScoreInput {
  rubricId: string;
  name: string;
  weightPercentage: number; // e.g. 40 (meaning 40%)
  maxPoints: number; // e.g. 40
  scoreAwarded: number; // e.g. 36
}

export interface DeadlineCheckResult {
  isEligible: boolean;
  isLate: boolean;
  reason?: string;
  deadline: Date;
  submittedAt: Date;
}

/**
 * Validates whether a submission is on-time or past deadline.
 * Enforces server timestamp comparison.
 */
export function checkSubmissionDeadline(
  deadline: Date,
  serverTime: Date = new Date(),
  gracePeriodSeconds: number = 0
): DeadlineCheckResult {
  const deadlineWithGrace = new Date(deadline.getTime() + gracePeriodSeconds * 1000);
  const isLate = serverTime.getTime() > deadlineWithGrace.getTime();

  return {
    isEligible: !isLate,
    isLate,
    reason: isLate
      ? `Submission received at ${serverTime.toISOString()}, which is after the cutoff deadline of ${deadline.toISOString()}.`
      : undefined,
    deadline,
    submittedAt: serverTime,
  };
}

/**
 * Server-side auto-grade for Multiple Choice Questions.
 * Compares participant answers strictly against private server keys.
 */
export function calculateMcqScore(
  participantAnswers: ParticipantMcqAnswer[],
  privateKeys: McqAnswerKey[]
): {
  totalPointsAwarded: number;
  maxPossiblePoints: number;
  itemResults: {
    questionId: string;
    isCorrect: boolean;
    pointsAwarded: number;
  }[];
} {
  const keyMap = new Map(privateKeys.map((k) => [k.questionId, k]));

  let totalPointsAwarded = 0;
  let maxPossiblePoints = 0;

  const itemResults = participantAnswers.map((ans) => {
    const key = keyMap.get(ans.questionId);
    if (!key) {
      return {
        questionId: ans.questionId,
        isCorrect: false,
        pointsAwarded: 0,
      };
    }

    maxPossiblePoints += key.points;
    const isCorrect =
      ans.selectedOption.trim().toUpperCase() ===
      key.correctOptionKey.trim().toUpperCase();

    const points = isCorrect ? key.points : 0;
    totalPointsAwarded += points;

    return {
      questionId: ans.questionId,
      isCorrect,
      pointsAwarded: points,
    };
  });

  return {
    totalPointsAwarded,
    maxPossiblePoints,
    itemResults,
  };
}

/**
 * Calculates weighted score across evaluator rubrics.
 * Formula: sum((scoreAwarded / maxPoints) * weightPercentage)
 */
export function calculateWeightedRubricScore(
  scores: RubricScoreInput[]
): {
  weightedScore: number;
  maxWeightTotal: number;
  normalizedTo100: number;
} {
  let weightedScore = 0;
  let maxWeightTotal = 0;

  for (const s of scores) {
    if (s.maxPoints <= 0) continue;
    // Bound awarded score between 0 and maxPoints
    const boundedScore = Math.max(0, Math.min(s.scoreAwarded, s.maxPoints));
    const contribution = (boundedScore / s.maxPoints) * s.weightPercentage;
    weightedScore += contribution;
    maxWeightTotal += s.weightPercentage;
  }

  const normalizedTo100 =
    maxWeightTotal > 0 ? Math.round((weightedScore / maxWeightTotal) * 100 * 100) / 100 : 0;

  return {
    weightedScore: Math.round(weightedScore * 100) / 100,
    maxWeightTotal,
    normalizedTo100,
  };
}

/**
 * Enforces role-based action permissions.
 */
export function checkUserPermission(
  userRole: "ADMIN" | "EVALUATOR" | "PARTICIPANT",
  action: "VIEW_CONTEST" | "SUBMIT_TASK" | "GRADE_SUBMISSION" | "PUBLISH_RESULTS" | "EDIT_CONTEST" | "CHANGE_ROLE"
): boolean {
  switch (action) {
    case "VIEW_CONTEST":
      return true; // All authenticated roles can view contests
    case "SUBMIT_TASK":
      return userRole === "PARTICIPANT";
    case "GRADE_SUBMISSION":
      return userRole === "ADMIN" || userRole === "EVALUATOR";
    case "PUBLISH_RESULTS":
    case "EDIT_CONTEST":
    case "CHANGE_ROLE":
      return userRole === "ADMIN";
    default:
      return false;
  }
}

/**
 * Strips private answer keys and scoring guides from question payloads
 * before returning them to participant clients.
 */
export function sanitizeQuestionForParticipant<T extends Record<string, any>>(
  question: T
): Omit<T, "answerKey"> {
  const { answerKey: _stripped, ...safeQuestion } = question;
  return safeQuestion as Omit<T, "answerKey">;
}

/**
 * Sanitizes submission answers for participant viewing.
 * Masks score and isCorrect indicators while a contest is still active or unpublished.
 */
export function sanitizeSubmissionAnswerForParticipant<
  T extends { score?: unknown; isCorrect?: unknown }
>(answer: T, isContestPublished: boolean): T {
  if (isContestPublished) {
    return answer;
  }
  return {
    ...answer,
    score: null,
    isCorrect: null,
  };
}

/**
 * Sanitizes full submission data for participant viewing.
 * Hides interim auto-grading, manual scores, and final scores until results are officially published.
 */
export function sanitizeSubmissionForParticipant<
  T extends {
    autoGradeScore?: unknown;
    manualGradeScore?: unknown;
    finalScore?: unknown;
    answers?: { score?: unknown; isCorrect?: unknown }[];
  }
>(submission: T, isContestPublished: boolean): T {
  if (isContestPublished) {
    return submission;
  }

  return {
    ...submission,
    autoGradeScore: null,
    manualGradeScore: null,
    finalScore: null,
    answers: submission.answers?.map((ans) =>
      sanitizeSubmissionAnswerForParticipant(ans, false)
    ),
  };
}

