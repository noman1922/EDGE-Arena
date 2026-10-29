import assert from "node:assert/strict";
import { test } from "node:test";
import { webcrypto } from "node:crypto";
import {
  getParticipantDashboard,
  saveAnswerDraftAction,
  submitAssessmentAction,
} from "../app/actions/assessment-actions";
import { prisma } from "../lib/prisma";
import {
  setTestSession,
  createSessionToken,
  verifySessionToken,
  getSessionSecret,
} from "../lib/auth";

const legacyFallbackSecret =
  "aci-career-edge-assess-production-session-secret-2025-secure";
const env = process.env as Record<string, string | undefined>;

async function signToken(secret: string, payload: object): Promise<string> {
  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const key = await webcrypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await webcrypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payloadBase64)
  );
  return `${payloadBase64}.${Buffer.from(signature).toString("base64url")}`;
}

test("production rejects forged sessions when the dedicated secret is missing", async () => {
  const previous = {
    nodeEnv: env.NODE_ENV,
    sessionSecret: env.SESSION_SECRET,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  };

  try {
    env.NODE_ENV = "production";
    delete env.SESSION_SECRET;
    env.SUPABASE_SERVICE_ROLE_KEY = "present-but-not-a-session-secret";

    const token = await signToken(legacyFallbackSecret, {
      userId: "forged-admin",
      email: "attacker@example.invalid",
      role: "ADMIN",
      name: "Attacker",
      issuedAt: Date.now(),
      expiresAt: Date.now() + 60_000,
    });

    assert.equal(await verifySessionToken(token), null);
    await assert.rejects(
      createSessionToken({
        userId: "forged-admin",
        email: "attacker@example.invalid",
        role: "ADMIN",
        name: "Attacker",
      }),
      /SESSION_SECRET must be configured/
    );
  } finally {
    if (previous.nodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = previous.nodeEnv;
    if (previous.sessionSecret === undefined) delete env.SESSION_SECRET;
    else env.SESSION_SECRET = previous.sessionSecret;
    if (previous.serviceRoleKey === undefined) delete env.SUPABASE_SERVICE_ROLE_KEY;
    else env.SUPABASE_SERVICE_ROLE_KEY = previous.serviceRoleKey;
  }
});

test("production rejects a configured session secret that is too short", async () => {
  const previous = {
    nodeEnv: env.NODE_ENV,
    sessionSecret: env.SESSION_SECRET,
  };

  try {
    env.NODE_ENV = "production";
    env.SESSION_SECRET = "too-short";
    await assert.rejects(
      createSessionToken({
        userId: "user",
        email: "user@example.invalid",
        role: "PARTICIPANT",
        name: "User",
      }),
      /SESSION_SECRET must be configured/
    );
  } finally {
    if (previous.nodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = previous.nodeEnv;
    if (previous.sessionSecret === undefined) delete env.SESSION_SECRET;
    else env.SESSION_SECRET = previous.sessionSecret;
  }
});

test("development rejects session token operations when SESSION_SECRET is missing", async () => {
  const previous = {
    nodeEnv: env.NODE_ENV,
    sessionSecret: env.SESSION_SECRET,
  };

  try {
    env.NODE_ENV = "development";
    delete env.SESSION_SECRET;

    assert.throws(
      () => getSessionSecret(),
      /SESSION_SECRET must be configured with at least 32 characters in your environment/
    );

    await assert.rejects(
      createSessionToken({
        userId: "dev-user",
        email: "dev@example.invalid",
        role: "ADMIN",
        name: "Dev Admin",
      }),
      /SESSION_SECRET must be configured/
    );
  } finally {
    if (previous.nodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = previous.nodeEnv;
    if (previous.sessionSecret === undefined) delete env.SESSION_SECRET;
    else env.SESSION_SECRET = previous.sessionSecret;
  }
});

test("development rejects session token operations when SESSION_SECRET is shorter than 32 characters", async () => {
  const previous = {
    nodeEnv: env.NODE_ENV,
    sessionSecret: env.SESSION_SECRET,
  };

  try {
    env.NODE_ENV = "development";
    env.SESSION_SECRET = "short-secret";

    assert.throws(
      () => getSessionSecret(),
      /SESSION_SECRET must be configured with at least 32 characters in your environment/
    );

    await assert.rejects(
      createSessionToken({
        userId: "dev-user",
        email: "dev@example.invalid",
        role: "ADMIN",
        name: "Dev Admin",
      }),
      /SESSION_SECRET must be configured/
    );
  } finally {
    if (previous.nodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = previous.nodeEnv;
    if (previous.sessionSecret === undefined) delete env.SESSION_SECRET;
    else env.SESSION_SECRET = previous.sessionSecret;
  }
});

test("shared SESSION_SECRET enables cross-runtime token creation and verification", async () => {
  const previous = {
    nodeEnv: env.NODE_ENV,
    sessionSecret: env.SESSION_SECRET,
  };

  try {
    env.NODE_ENV = "development";
    env.SESSION_SECRET = "valid_development_session_secret_with_32_characters_minimum";

    assert.equal(getSessionSecret(), "valid_development_session_secret_with_32_characters_minimum");

    const token = await createSessionToken({
      userId: "test-admin-id",
      email: "admin@gmail.com",
      role: "ADMIN",
      name: "System Administrator",
      mustChangePassword: true,
    });

    assert.ok(typeof token === "string" && token.includes("."));

    const verified = await verifySessionToken(token);
    assert.ok(verified !== null);
    assert.equal(verified?.email, "admin@gmail.com");
    assert.equal(verified?.role, "ADMIN");
    assert.equal(verified?.mustChangePassword, true);
  } finally {
    if (previous.nodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = previous.nodeEnv;
    if (previous.sessionSecret === undefined) delete env.SESSION_SECRET;
    else env.SESSION_SECRET = previous.sessionSecret;
  }
});

test("participant dashboard ignores a caller-supplied email and uses session identity", async () => {
  const participantEmail = "signed-in-participant@example.invalid";
  let queriedEmail: string | undefined;
  const originalFindUnique = prisma.user.findUnique;
  const originalFindMany = prisma.contestParticipant.findMany;

  prisma.user.findUnique = (async (args: { where: { email: string } }) => {
    queriedEmail = args.where.email;
    return {
      id: "signed-in-participant-id",
      email: args.where.email,
      name: "Signed In Participant",
      candidateId: null,
      institution: null,
      cohort: null,
    } as never;
  }) as unknown as typeof prisma.user.findUnique;
  prisma.contestParticipant.findMany = (async () => [] as never) as typeof prisma.contestParticipant.findMany;

  setTestSession({
    userId: "signed-in-participant-id",
    email: participantEmail,
    role: "PARTICIPANT",
    name: "Signed In Participant",
  });

  try {
    // Simulate an old or hand-crafted client still sending the former argument.
    const legacyCall = getParticipantDashboard as unknown as (
      requestedEmail: string
    ) => ReturnType<typeof getParticipantDashboard>;
    const dashboard = await legacyCall("another-participant@example.invalid");

    assert.equal(queriedEmail, participantEmail);
    assert.equal(dashboard.candidate.email, participantEmail);
  } finally {
    setTestSession(undefined);
    prisma.user.findUnique = originalFindUnique;
    prisma.contestParticipant.findMany = originalFindMany;
  }
});

function participantSubmission(ownerId: string, ownerEmail: string, status = "DRAFT") {
  const now = Date.now();
  return {
    id: "target-submission-id",
    userId: ownerId,
    status,
    submittedAt: null,
    user: { id: ownerId, email: ownerEmail },
    contestId: "contest-id",
    contest: {
      id: "contest-id",
      status: "LIVE",
      startDate: new Date(now - 60_000),
      endDate: new Date(now + 3_600_000),
    },
    phaseId: "phase-id",
    phase: { id: "phase-id", deadline: new Date(now + 1_800_000), status: "OPEN" },
    taskId: "task-id",
    task: {
      id: "task-id",
      questions: [{
        id: "question-id",
        type: "MCQ",
        points: 10,
        answerKey: { correctOptionKey: "A" },
      }],
    },
    answers: [{ questionId: "question-id", selectedOption: "A" }],
  };
}

function setParticipantA() {
  setTestSession({
    userId: "participant-a-id",
    email: "participant-a@example.invalid",
    role: "PARTICIPANT",
    name: "Participant A",
  });
}

test("participant A cannot save participant B's draft using B's email and submission ID", async () => {
  const originalFindUnique = prisma.submission.findUnique;
  let answerWrites = 0;
  const originalAnswerUpsert = prisma.submissionAnswer.upsert;

  prisma.submission.findUnique = (async () =>
    participantSubmission("participant-b-id", "participant-b@example.invalid") as never
  ) as unknown as typeof prisma.submission.findUnique;
  prisma.submissionAnswer.upsert = (async () => {
    answerWrites++;
    return {} as never;
  }) as unknown as typeof prisma.submissionAnswer.upsert;
  setParticipantA();

  try {
    const legacyCall = saveAnswerDraftAction as unknown as (
      ...args: [string, string, { writtenText?: string }, string]
    ) => ReturnType<typeof saveAnswerDraftAction>;
    const result = await legacyCall(
      "target-submission-id",
      "question-id",
      { writtenText: "unauthorized change" },
      "participant-b@example.invalid"
    );

    assert.equal(result.success, false);
    assert.match(result.error || "", /Cross-user submission modification is blocked/);
    assert.equal(answerWrites, 0, "unauthorized requests must not write answers");
  } finally {
    setTestSession(undefined);
    prisma.submission.findUnique = originalFindUnique;
    prisma.submissionAnswer.upsert = originalAnswerUpsert;
  }
});

test("participant A cannot submit participant B's work using B's email and submission ID", async () => {
  const originalFindUnique = prisma.submission.findUnique;
  let submissionWrites = 0;
  const originalUpdate = prisma.submission.update;

  prisma.submission.findUnique = (async () =>
    participantSubmission("participant-b-id", "participant-b@example.invalid") as never
  ) as unknown as typeof prisma.submission.findUnique;
  prisma.submission.update = (async () => {
    submissionWrites++;
    return {} as never;
  }) as unknown as typeof prisma.submission.update;
  setParticipantA();

  try {
    const legacyCall = submitAssessmentAction as unknown as (
      ...args: [string, string]
    ) => ReturnType<typeof submitAssessmentAction>;
    const result = await legacyCall(
      "target-submission-id",
      "participant-b@example.invalid"
    );

    assert.equal(result.success, false);
    assert.match(result.error || "", /Cross-user submission finalization is blocked/);
    assert.equal(submissionWrites, 0, "unauthorized requests must not finalize submissions");
  } finally {
    setTestSession(undefined);
    prisma.submission.findUnique = originalFindUnique;
    prisma.submission.update = originalUpdate;
  }
});

test("the submission owner can save a draft", async () => {
  const originalFindUnique = prisma.submission.findUnique;
  const originalAnswerUpsert = prisma.submissionAnswer.upsert;
  const originalSubmissionUpdate = prisma.submission.update;
  let answerWrites = 0;
  let timestampWrites = 0;

  prisma.submission.findUnique = (async () =>
    participantSubmission("participant-a-id", "participant-a@example.invalid") as never
  ) as unknown as typeof prisma.submission.findUnique;
  prisma.submissionAnswer.upsert = (async () => {
    answerWrites++;
    return {} as never;
  }) as unknown as typeof prisma.submissionAnswer.upsert;
  prisma.submission.update = (async () => {
    timestampWrites++;
    return {} as never;
  }) as unknown as typeof prisma.submission.update;
  setParticipantA();

  try {
    const result = await saveAnswerDraftAction(
      "target-submission-id",
      "question-id",
      { writtenText: "valid owner draft" }
    );

    assert.equal(result.success, true);
    assert.equal(answerWrites, 1);
    assert.equal(timestampWrites, 1);
  } finally {
    setTestSession(undefined);
    prisma.submission.findUnique = originalFindUnique;
    prisma.submissionAnswer.upsert = originalAnswerUpsert;
    prisma.submission.update = originalSubmissionUpdate;
  }
});

test("the submission owner can finalize a submission", async () => {
  const originalSubmissionFindUnique = prisma.submission.findUnique;
  const originalAnswerUpdateMany = prisma.submissionAnswer.updateMany;
  const originalSubmissionUpdate = prisma.submission.update;
  const originalContestFindUnique = prisma.contest.findUnique;
  const originalSubmissionFindMany = prisma.submission.findMany;
  let finalized = false;

  prisma.submission.findUnique = (async () =>
    participantSubmission("participant-a-id", "participant-a@example.invalid") as never
  ) as unknown as typeof prisma.submission.findUnique;
  prisma.submissionAnswer.updateMany = (async () => ({ count: 1 })) as unknown as typeof prisma.submissionAnswer.updateMany;
  prisma.submission.update = (async () => {
    finalized = true;
    return { status: "SUBMITTED" } as never;
  }) as unknown as typeof prisma.submission.update;
  prisma.contest.findUnique = (async () => ({
    phases: [{
      id: "phase-id",
      phaseNumber: 1,
      tasks: [{ id: "task-id", phaseId: "phase-id", taskNumber: 1 }],
    }],
  }) as never) as unknown as typeof prisma.contest.findUnique;
  prisma.submission.findMany = (async () => [{ taskId: "task-id", status: "SUBMITTED" }] as never) as unknown as typeof prisma.submission.findMany;
  setParticipantA();

  try {
    const result = await submitAssessmentAction("target-submission-id");

    assert.equal(result.success, true);
    assert.equal(finalized, true);
    assert.equal(result.status, "SUBMITTED");
  } finally {
    setTestSession(undefined);
    prisma.submission.findUnique = originalSubmissionFindUnique;
    prisma.submissionAnswer.updateMany = originalAnswerUpdateMany;
    prisma.submission.update = originalSubmissionUpdate;
    prisma.contest.findUnique = originalContestFindUnique;
    prisma.submission.findMany = originalSubmissionFindMany;
  }
});
