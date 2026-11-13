import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPasswordAsync } from "@/lib/credentials";
import {
  setTestSession,
  runWithTestCookieJar,
  getTestCookieJarToken,
  authenticateSessionToken,
  verifySessionToken,
} from "@/lib/auth";
import {
  loginAction,
  changePasswordAction,
  logoutAction,
} from "@/app/actions/auth-actions";
import {
  saveAnswerBatchAction,
  submitAssessmentAction,
  autoFinalizeExpiredSubmissionInternal,
} from "@/app/actions/assessment-actions";
import { publishContestResultsAction } from "@/app/actions/evaluator-actions";
import { getParticipantLeaderboard } from "@/app/actions/participant-nav-actions";
import {
  checkLoginRateLimitAsync,
  recordFailedLoginAttemptAsync,
  resetLoginAttemptsAsync,
  checkActionRateLimitAsync,
} from "@/lib/rate-limiter";
import { getContestMonitoringSettings, saveContestMonitoringSettings } from "@/lib/monitoring";

describe("10K Scale Optimizations: Batching, Atomic Finalization, Bulk Leaderboard & Auth/Rate-Limit", () => {
  const runTag = crypto.randomBytes(4).toString("hex");
  const adminId = `scale-admin-${runTag}`;
  const adminEmail = `scale-admin-${runTag}@example.test`;
  const pIds = [
    `scale-p1-${runTag}`,
    `scale-p2-${runTag}`,
    `scale-p3-${runTag}`,
    `scale-p4-${runTag}`,
  ];
  const pEmails = pIds.map((id) => `${id}@example.test`);
  const contestId = `scale-contest-${runTag}`;
  const otherContestId = `scale-other-contest-${runTag}`;
  const phaseId = `scale-phase-${runTag}`;
  const taskId = `scale-task-${runTag}`;
  const otherTaskId = `scale-other-task-${runTag}`;
  const q1Id = `scale-q1-${runTag}`;
  const q2Id = `scale-q2-${runTag}`;
  const foreignQId = `scale-foreign-q-${runTag}`;

  const pass = "ScaleOptPass#2026!";

  before(async () => {
    const { hash, salt } = hashPassword(pass);

    await prisma.user.createMany({
      data: [
        {
          id: adminId,
          email: adminEmail,
          name: "Scale Admin",
          role: "ADMIN",
          passwordHash: hash,
          passwordSalt: salt,
          mustChangePassword: false,
          isActive: true,
        },
        ...pIds.map((id, idx) => ({
          id,
          email: pEmails[idx],
          name: `Scale Participant ${idx + 1}`,
          candidateId: `CID-${runTag.toUpperCase()}-${idx + 1}`,
          role: "PARTICIPANT" as const,
          passwordHash: hash,
          passwordSalt: salt,
          mustChangePassword: false,
          isActive: true,
        })),
      ],
    });

    const now = new Date();
    const start = new Date(now.getTime() - 60 * 60 * 1000);
    const end = new Date(now.getTime() + 60 * 60 * 1000);

    await prisma.contest.create({
      data: {
        id: contestId,
        slug: `scale-contest-${runTag}`,
        title: "Scale Optimization Mock Contest",
        track: "Data & Tech",
        status: "LIVE",
        isPublished: false,
        startDate: start,
        endDate: end,
        durationMinutes: 60,
        phases: {
          create: {
            id: phaseId,
            phaseNumber: 1,
            title: "Phase 1",
            status: "OPEN",
            weightPercentage: 100,
            deadline: end,
            durationMinutes: 60,
            tasks: {
              create: {
                id: taskId,
                taskNumber: 1,
                title: "MCQ Task",
                totalPoints: 20,
                questions: {
                  create: [
                    {
                      id: q1Id,
                      questionNumber: 1,
                      type: "MCQ",
                      prompt: "Q1",
                      points: 10,
                      options: {
                        create: [
                          { id: `${q1Id}-a`, optionKey: "A", text: "Opt A" },
                          { id: `${q1Id}-b`, optionKey: "B", text: "Opt B" },
                        ],
                      },
                      answerKey: {
                        create: { id: `${q1Id}-k`, correctOptionKey: "B" },
                      },
                    },
                    {
                      id: q2Id,
                      questionNumber: 2,
                      type: "MCQ",
                      prompt: "Q2",
                      points: 10,
                      options: {
                        create: [
                          { id: `${q2Id}-a`, optionKey: "A", text: "Opt A" },
                          { id: `${q2Id}-b`, optionKey: "B", text: "Opt B" },
                        ],
                      },
                      answerKey: {
                        create: { id: `${q2Id}-k`, correctOptionKey: "A" },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      },
    });

    await prisma.contest.create({
      data: {
        id: otherContestId,
        slug: `scale-other-contest-${runTag}`,
        title: "Foreign Contest",
        track: "General",
        status: "LIVE",
        startDate: start,
        endDate: end,
        phases: {
          create: {
            id: `other-phase-${runTag}`,
            phaseNumber: 1,
            title: "Other Phase",
            status: "OPEN",
            weightPercentage: 100,
            deadline: end,
            tasks: {
              create: {
                id: otherTaskId,
                taskNumber: 1,
                title: "Other Task",
                totalPoints: 10,
                questions: {
                  create: {
                    id: foreignQId,
                    questionNumber: 1,
                    type: "MCQ",
                    prompt: "Foreign Q",
                    points: 10,
                  },
                },
              },
            },
          },
        },
      },
    });

    await prisma.contestParticipant.createMany({
      data: pIds.map((userId) => ({
        contestId,
        userId,
        status: "ENROLLED",
      })),
    });

    await prisma.phaseAttempt.createMany({
      data: pIds.map((userId) => ({
        contestId,
        phaseId,
        userId,
        startedAt: now,
        expiresAt: end,
        status: "IN_PROGRESS",
      })),
    });

    await prisma.submission.createMany({
      data: pIds.map((userId) => ({
        id: `sub-${userId}`,
        contestId,
        phaseId,
        taskId,
        userId,
        status: "DRAFT",
        startedAt: now,
        expiresAt: end,
      })),
    });
  });

  after(async () => {
    setTestSession(undefined);
    await prisma.cohortResult.deleteMany({ where: { contestId } }).catch(() => {});
    await prisma.contest.deleteMany({
      where: { id: { in: [contestId, otherContestId] } },
    }).catch(() => {});
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { targetId: contestId },
          { targetId: { in: [adminId, ...pIds] } },
          { actorId: { in: [adminId, ...pIds] } },
        ],
      },
    }).catch(() => {});
    await prisma.user.deleteMany({
      where: { id: { in: [adminId, ...pIds] } },
    }).catch(() => {});
  });

  it("1. Async scrypt & sessionVersion epoch invalidation preserve A4 guarantees", async () => {
    const dbP1 = await prisma.user.findUniqueOrThrow({ where: { id: pIds[0] } });
    assert.equal(await verifyPasswordAsync(pass, dbP1.passwordHash!, dbP1.passwordSalt!), true);
    assert.equal(await verifyPasswordAsync("WrongPass!", dbP1.passwordHash!, dbP1.passwordSalt!), false);

    let tokenBeforeChange: string | null = null;
    let tokenAfterChange: string | null = null;

    await runWithTestCookieJar(async () => {
      const loginRes = await loginAction(pEmails[0], pass);
      assert.equal(loginRes.success, true);
      tokenBeforeChange = getTestCookieJarToken();
      assert.ok(tokenBeforeChange);

      const parsed = await verifySessionToken(tokenBeforeChange);
      assert.ok(parsed?.sv && parsed.sv >= 1, "Signed token must carry sessionVersion sv");

      const newPass = "RotatedScale#2026!";
      const chRes = await changePasswordAction(pass, newPass, newPass);
      assert.equal(chRes.success, true);
      tokenAfterChange = getTestCookieJarToken();
      assert.ok(tokenAfterChange);

      const parsedAfter = await verifySessionToken(tokenAfterChange);
      assert.equal(parsedAfter?.sv, (parsed!.sv ?? 1) + 1);
    });

    assert.equal(
      await authenticateSessionToken(tokenBeforeChange!),
      null,
      "Old sessionVersion must be rejected immediately"
    );
    assert.ok(
      await authenticateSessionToken(tokenAfterChange!),
      "New sessionVersion token must authenticate"
    );

    // Logout must permanently revoke even the newest token
    await runWithTestCookieJar(async () => {
      const logoutRes = await logoutAction();
      assert.equal(logoutRes.success, true);
    }, tokenAfterChange!);

    assert.equal(await authenticateSessionToken(tokenAfterChange!), null);

    // Restore original password cleanly
    const restored = hashPassword(pass);
    await prisma.user.update({
      where: { id: pIds[0] },
      data: { passwordHash: restored.hash, passwordSalt: restored.salt, mustChangePassword: false },
    });
  });

  it("2. Distributed rate limiter works locally and fails safe if Redis is unreachable", async () => {
    const testEmail = `rl-test-${runTag}@example.test`;
    const prevUrl = process.env.UPSTASH_REDIS_REST_URL;
    const prevToken = process.env.UPSTASH_REDIS_REST_TOKEN;

    try {
      // Case A: Local in-memory fallback (no Redis env vars)
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
      await resetLoginAttemptsAsync(testEmail);

      for (let i = 0; i < 5; i++) {
        assert.equal((await checkLoginRateLimitAsync(testEmail)).allowed, true);
        await recordFailedLoginAttemptAsync(testEmail);
      }
      const blockedLocal = await checkLoginRateLimitAsync(testEmail);
      assert.equal(blockedLocal.allowed, false);
      assert.ok((blockedLocal.retryAfterSeconds ?? 0) >= 1);
      await resetLoginAttemptsAsync(testEmail);
      assert.equal((await checkLoginRateLimitAsync(testEmail)).allowed, true);

      // Case B: Unreachable Redis URL must gracefully fall back to local limiter
      process.env.UPSTASH_REDIS_REST_URL = "http://127.0.0.1:1";
      process.env.UPSTASH_REDIS_REST_TOKEN = "dummy-token";
      const batchAllowed = await checkActionRateLimitAsync("draft-batch", pIds[0], 3, 60);
      assert.equal(batchAllowed.allowed, true);
    } finally {
      if (prevUrl !== undefined) process.env.UPSTASH_REDIS_REST_URL = prevUrl;
      else delete process.env.UPSTASH_REDIS_REST_URL;
      if (prevToken !== undefined) process.env.UPSTASH_REDIS_REST_TOKEN = prevToken;
      else delete process.env.UPSTASH_REDIS_REST_TOKEN;
    }
  });

  it("3. saveAnswerBatchAction batches updates safely, enforces task membership, and never overwrites unrelated fields", async () => {
    const subId = `sub-${pIds[0]}`;
    setTestSession({
      userId: pIds[0],
      email: pEmails[0],
      role: "PARTICIPANT",
      name: "Scale Participant 1",
    });

    // Save initial note + selected option on q1Id and q2Id
    const res1 = await saveAnswerBatchAction(subId, [
      { questionId: q1Id, selectedOption: "A", writtenText: "Initial reasoning text" },
      // Duplicate questionId in same batch: last entry ("B") must win, and omitted writtenText must stay intact on second call
      { questionId: q1Id, selectedOption: "B", writtenText: "Initial reasoning text" },
      { questionId: q2Id, selectedOption: "A" },
    ]);
    assert.equal(res1.success, true);
    assert.equal(res1.savedCount, 2);

    // Partial update on q1Id with selectedOption only should not null writtenText
    const res2 = await saveAnswerBatchAction(subId, [
      { questionId: q1Id, selectedOption: "B" },
    ]);
    assert.equal(res2.success, true);

    const savedAnswers = await prisma.submissionAnswer.findMany({
      where: { submissionId: subId },
    });
    const a1 = savedAnswers.find((a) => a.questionId === q1Id);
    const a2 = savedAnswers.find((a) => a.questionId === q2Id);
    assert.equal(a1?.selectedOption, "B");
    assert.equal(a1?.writtenText, "Initial reasoning text");
    assert.equal(a2?.selectedOption, "A");

    // Foreign questionId belonging to another task must be rejected
    const foreignRes = await saveAnswerBatchAction(subId, [
      { questionId: foreignQId, selectedOption: "A" },
    ]);
    assert.equal(foreignRes.success, false);
    assert.match(foreignRes.error || "", /Invalid question reference/i);
  });

  it("4. Concurrent manual submit & auto-finalize are atomic, idempotent, and transition PhaseAttempt consistently", async () => {
    // Prepare P2..P4 scores cleanly:
    // P1: Q1=B(10), Q2=A(10) => 20
    // P2: Q1=B(10), Q2=B(0)  => 10
    // P3: Q1=B(10), Q2=A(10) => 20 (submitted after P1)
    // P4: unsubmitted draft? Actually submit P4=0 via pendingDrafts on submitAssessmentAction
    setTestSession({
      userId: pIds[0],
      email: pEmails[0],
      role: "PARTICIPANT",
      name: "Scale Participant 1",
    });

    // Race manual submit against auto-finalize simultaneously
    const [manualRes, autoRes] = await Promise.all([
      submitAssessmentAction(`sub-${pIds[0]}`),
      autoFinalizeExpiredSubmissionInternal(`sub-${pIds[0]}`, "Concurrent timer check"),
    ]);

    assert.equal(manualRes.success, true);
    assert.equal(autoRes.success, true);

    const sub1 = await prisma.submission.findUniqueOrThrow({ where: { id: `sub-${pIds[0]}` } });
    assert.equal(sub1.status, "SUBMITTED");
    assert.equal(Number(sub1.autoGradeScore), 20);
    assert.equal(Number(sub1.finalScore), 20);

    const pa1 = await prisma.phaseAttempt.findUniqueOrThrow({
      where: { phaseId_userId: { phaseId, userId: pIds[0] } },
    });
    assert.equal(pa1.status, "COMPLETED");
    assert.ok(pa1.completedAt);

    // P2
    setTestSession({
      userId: pIds[1],
      email: pEmails[1],
      role: "PARTICIPANT",
      name: "Scale Participant 2",
    });
    await saveAnswerBatchAction(`sub-${pIds[1]}`, [
      { questionId: q1Id, selectedOption: "B" },
      { questionId: q2Id, selectedOption: "B" },
    ]);
    assert.equal((await submitAssessmentAction(`sub-${pIds[1]}`)).success, true);

    // P3
    setTestSession({
      userId: pIds[2],
      email: pEmails[2],
      role: "PARTICIPANT",
      name: "Scale Participant 3",
    });
    const p3SubRes = await submitAssessmentAction(`sub-${pIds[2]}`, [
      { questionId: q1Id, selectedOption: "B" },
      { questionId: q2Id, selectedOption: "A" },
    ]);
    assert.equal(p3SubRes.success, true);
    const dbSub3 = await prisma.submission.findUniqueOrThrow({ where: { id: `sub-${pIds[2]}` } });
    assert.equal(Number(dbSub3.finalScore), 20);

    // P4
    setTestSession({
      userId: pIds[3],
      email: pEmails[3],
      role: "PARTICIPANT",
      name: "Scale Participant 4",
    });
    assert.equal(
      (
        await submitAssessmentAction(`sub-${pIds[3]}`, [
          { questionId: q1Id, selectedOption: "A" },
          { questionId: q2Id, selectedOption: "B" },
        ])
      ).success,
      true
    );
  });

  it("5. Bulk publishContestResultsAction & paginated getParticipantLeaderboard work cleanly without exposing PII", async () => {
    setTestSession({
      userId: adminId,
      email: adminEmail,
      role: "ADMIN",
      name: "Scale Admin",
    });

    const pub1 = await publishContestResultsAction(contestId);
    assert.equal(pub1.success, true);
    assert.equal(pub1.publishedCount, 4);
    assert.equal(pub1.isPublished, true);

    // Re-publish idempotently
    const pub2 = await publishContestResultsAction(contestId);
    assert.equal(pub2.success, true);
    assert.equal(pub2.publishedCount, 4);

    // P2 opens leaderboard with small page size=2, page=2 (where rank #3/#4 live), while pinned currentUserRank stays accurate
    setTestSession({
      userId: pIds[1],
      email: pEmails[1],
      role: "PARTICIPANT",
      name: "Scale Participant 2",
    });

    const page1 = await getParticipantLeaderboard(contestId, { page: 1, limit: 2 });
    assert.equal(page1.isPublished, true);
    assert.equal(page1.totalCount, 4);
    assert.equal(page1.totalPages, 2);
    assert.equal(page1.rows.length, 2);
    assert.equal(page1.rows[0].rank, 1);
    assert.equal(page1.rows[1].rank, 1); // 1224 tie between P1 and P3 (both 20 pts)
    assert.equal(page1.currentUserRank, 3);
    assert.equal(page1.currentUserRow?.finalScore, 10);

    const page2 = await getParticipantLeaderboard(contestId, { page: 2, limit: 2 });
    assert.equal(page2.rows.length, 2);
    assert.equal(page2.rows[0].rank, 3);
    assert.equal(page2.rows[0].isCurrentUser, true);
    assert.equal(page2.rows[1].rank, 4);

    // Strict privacy: no passwordHash/email keys on rows
    assert.equal("passwordHash" in (page2.rows[0] as unknown as Record<string, unknown>), false);
    assert.equal("email" in (page2.rows[0] as unknown as Record<string, unknown>), false);
  });

  it("6. Monitoring settings cache invalidates synchronously on update", async () => {
    const initial = await getContestMonitoringSettings(contestId);
    assert.equal(initial.fullscreenEnabled, true);

    await saveContestMonitoringSettings(contestId, { fullscreenEnabled: false }, adminId);
    const updated = await getContestMonitoringSettings(contestId);
    assert.equal(updated.fullscreenEnabled, false);
  });
});
