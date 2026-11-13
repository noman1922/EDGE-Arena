import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { prisma } from "../lib/prisma";
import { setTestSession } from "../lib/auth";
import { authorizeFileAccess } from "../lib/file-authorization";
import {
  validateStorageKey,
  getSignedDownloadUrl,
  downloadFromStorage,
  deleteFromStorage,
} from "../lib/storage";
import { getFileDownloadUrlAction } from "../app/actions/file-actions";
import { GET as fileRouteGet } from "../app/api/files/[...fileKey]/route";

describe("Security Hardening: Reference & Storage File Authorization (A3)", () => {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  const adminActiveId = crypto.randomUUID();
  const adminInactiveId = crypto.randomUUID();
  const evalAId = crypto.randomUUID();
  const evalUnassignedId = crypto.randomUUID();
  const partAId = crypto.randomUUID();
  const partA2Id = crypto.randomUUID();
  const partBId = crypto.randomUUID();
  const partDisqualifiedAId = crypto.randomUUID();

  const adminActiveEmail = `a3.admin.${suffix}@edge-test.internal`;
  const adminInactiveEmail = `a3.admin.inactive.${suffix}@edge-test.internal`;
  const evalAEmail = `a3.eval.a.${suffix}@edge-test.internal`;
  const evalUnassignedEmail = `a3.eval.other.${suffix}@edge-test.internal`;
  const partAEmail = `a3.part.a.${suffix}@edge-test.internal`;
  const partA2Email = `a3.part.a2.${suffix}@edge-test.internal`;
  const partBEmail = `a3.part.b.${suffix}@edge-test.internal`;
  const partDisqEmail = `a3.part.disq.${suffix}@edge-test.internal`;

  const contestAId = crypto.randomUUID();
  const contestBId = crypto.randomUUID();
  const phaseAId = crypto.randomUUID();
  const phaseBId = crypto.randomUUID();
  const taskAId = crypto.randomUUID();
  const taskBId = crypto.randomUUID();
  const qAId = crypto.randomUUID();
  const subAId = crypto.randomUUID();
  const subA2Id = crypto.randomUUID();
  const contestEvalAId = crypto.randomUUID();

  const refAKey = `references/a3-contest-a-${suffix}.pdf`;
  const refBPublishedKey = `references/a3-contest-b-pub-${suffix}.pdf`;
  const refNullTaskKey = `references/a3-orphan-null-task-${suffix}.pdf`;
  const subAKey = `submissions/a3-part-a-${suffix}.pdf`;
  const subA2Key = `submissions/a3-part-a2-${suffix}.pdf`;

  const fakePdfBytes = new Uint8Array(Buffer.from("%PDF-1.4\n%A3 test\n%%EOF", "utf-8"));

  before(async () => {
    const now = new Date();
    const pastStart = new Date(now.getTime() - 2 * 24 * 3600 * 1000);
    const futureEnd = new Date(now.getTime() + 5 * 24 * 3600 * 1000);

    await prisma.user.createMany({
      data: [
        { id: adminActiveId, email: adminActiveEmail, name: "A3 Admin", role: "ADMIN", isActive: true },
        { id: adminInactiveId, email: adminInactiveEmail, name: "A3 Inactive Admin", role: "ADMIN", isActive: false },
        { id: evalAId, email: evalAEmail, name: "A3 Eval A", role: "EVALUATOR", isActive: true },
        { id: evalUnassignedId, email: evalUnassignedEmail, name: "A3 Eval Other", role: "EVALUATOR", isActive: true },
        { id: partAId, email: partAEmail, name: "A3 Participant A", role: "PARTICIPANT", isActive: true },
        { id: partA2Id, email: partA2Email, name: "A3 Participant A2", role: "PARTICIPANT", isActive: true },
        { id: partBId, email: partBEmail, name: "A3 Participant B", role: "PARTICIPANT", isActive: true },
        { id: partDisqualifiedAId, email: partDisqEmail, name: "A3 Disqualified A", role: "PARTICIPANT", isActive: true },
      ],
    });

    await prisma.contest.createMany({
      data: [
        {
          id: contestAId,
          slug: `a3-contest-a-${suffix}`,
          title: `A3 Unpublished Contest A ${suffix}`,
          track: "Strategy",
          startDate: pastStart,
          endDate: futureEnd,
          status: "LIVE",
          isPublished: false,
        },
        {
          id: contestBId,
          slug: `a3-contest-b-${suffix}`,
          title: `A3 Published Contest B ${suffix}`,
          track: "Strategy",
          startDate: pastStart,
          endDate: futureEnd,
          status: "LIVE",
          isPublished: true,
        },
      ],
    });

    await prisma.phase.createMany({
      data: [
        {
          id: phaseAId,
          contestId: contestAId,
          phaseNumber: 1,
          title: "A3 Phase A1",
          weightPercentage: 100,
          deadline: futureEnd,
          status: "OPEN",
        },
        {
          id: phaseBId,
          contestId: contestBId,
          phaseNumber: 1,
          title: "A3 Phase B1",
          weightPercentage: 100,
          deadline: futureEnd,
          status: "OPEN",
        },
      ],
    });

    await prisma.task.createMany({
      data: [
        { id: taskAId, phaseId: phaseAId, taskNumber: 1, title: "A3 Task A", totalPoints: 100 },
        { id: taskBId, phaseId: phaseBId, taskNumber: 1, title: "A3 Task B", totalPoints: 100 },
      ],
    });

    await prisma.question.create({
      data: {
        id: qAId,
        taskId: taskAId,
        questionNumber: 1,
        type: "FILE_UPLOAD",
        prompt: "Upload your brief.",
        points: 100,
      },
    });

    await prisma.contestParticipant.createMany({
      data: [
        { contestId: contestAId, userId: partAId, status: "ACTIVE" },
        { contestId: contestAId, userId: partA2Id, status: "ENROLLED" },
        { contestId: contestAId, userId: partDisqualifiedAId, status: "DISQUALIFIED" },
        { contestId: contestBId, userId: partBId, status: "ACTIVE" },
      ],
    });

    await prisma.contestEvaluator.create({
      data: { id: contestEvalAId, contestId: contestAId, userId: evalAId },
    });

    // Assign evalA to partA only (NOT partA2)
    await prisma.evaluatorCandidateAssignment.create({
      data: {
        contestId: contestAId,
        contestEvaluatorId: contestEvalAId,
        evaluatorId: evalAId,
        participantId: partAId,
      },
    });

    await prisma.referenceMaterial.createMany({
      data: [
        {
          taskId: taskAId,
          title: "Contest A Confidential Brief.pdf",
          fileKey: refAKey,
          fileSizeBytes: BigInt(1024),
          mimeType: "application/pdf",
        },
        {
          taskId: taskBId,
          title: "Contest B Published Brief.pdf",
          fileKey: refBPublishedKey,
          fileSizeBytes: BigInt(1024),
          mimeType: "application/pdf",
        },
        {
          taskId: null,
          title: "Unattached Admin Only Brief.pdf",
          fileKey: refNullTaskKey,
          fileSizeBytes: BigInt(1024),
          mimeType: "application/pdf",
        },
      ],
    });

    await prisma.submission.createMany({
      data: [
        {
          id: subAId,
          contestId: contestAId,
          phaseId: phaseAId,
          taskId: taskAId,
          userId: partAId,
          status: "SUBMITTED",
          submittedAt: now,
        },
        {
          id: subA2Id,
          contestId: contestAId,
          phaseId: phaseAId,
          taskId: taskAId,
          userId: partA2Id,
          status: "SUBMITTED",
          submittedAt: now,
        },
      ],
    });

    await prisma.submissionAnswer.createMany({
      data: [
        {
          submissionId: subAId,
          questionId: qAId,
          fileKey: subAKey,
          fileName: "PartA_Submission.pdf",
        },
        {
          submissionId: subA2Id,
          questionId: qAId,
          fileKey: subA2Key,
          fileName: "PartA2_Submission.pdf",
        },
      ],
    });
  });

  after(async () => {
    setTestSession(null);
    await prisma.submissionAnswer.deleteMany({ where: { submissionId: { in: [subAId, subA2Id] } } });
    await prisma.submission.deleteMany({ where: { id: { in: [subAId, subA2Id] } } });
    await prisma.referenceMaterial.deleteMany({
      where: { fileKey: { in: [refAKey, refBPublishedKey, refNullTaskKey] } },
    });
    await prisma.evaluatorCandidateAssignment.deleteMany({ where: { contestId: contestAId } });
    await prisma.contestEvaluator.deleteMany({ where: { contestId: contestAId } });
    await prisma.contestParticipant.deleteMany({
      where: { contestId: { in: [contestAId, contestBId] } },
    });
    await prisma.question.deleteMany({ where: { id: qAId } });
    await prisma.task.deleteMany({ where: { id: { in: [taskAId, taskBId] } } });
    await prisma.phase.deleteMany({ where: { id: { in: [phaseAId, phaseBId] } } });
    await prisma.contest.deleteMany({ where: { id: { in: [contestAId, contestBId] } } });
    await prisma.user.deleteMany({
      where: {
        id: {
          in: [
            adminActiveId,
            adminInactiveId,
            evalAId,
            evalUnassignedId,
            partAId,
            partA2Id,
            partBId,
            partDisqualifiedAId,
          ],
        },
      },
    });
  });

  it("1. Rejects unauthenticated access on action and /api/files route", async () => {
    setTestSession(null);

    const actionRes = await getFileDownloadUrlAction(refBPublishedKey);
    assert.equal(actionRes.success, false);
    assert.match(actionRes.error || "", /unauthorized|authentication/i);

    const req = new NextRequest(new URL(`http://localhost:3000/api/files/${refBPublishedKey}`));
    const routeRes = await fileRouteGet(req, {
      params: Promise.resolve({ fileKey: refBPublishedKey.split("/") }),
    });
    assert.equal(routeRes.status, 401);

    setTestSession(undefined);
    const routeRes2 = await fileRouteGet(req, {
      params: Promise.resolve({ fileKey: refBPublishedKey.split("/") }),
    });
    assert.equal(routeRes2.status, 401);
  });

  it("2. Rejects non-enrolled and disqualified participants even when contest is published", async () => {
    // partA is enrolled in Contest A, NOT Contest B (even though Contest B is published!)
    setTestSession({
      userId: partAId,
      email: partAEmail,
      name: "A3 Participant A",
      role: "PARTICIPANT",
    });

    const actionRes = await getFileDownloadUrlAction(refBPublishedKey);
    assert.equal(actionRes.success, false);
    assert.match(actionRes.error || "", /forbidden|denied/i);
    assert.doesNotMatch(actionRes.error || "", /Contest B|Published/i);

    const routeRes = await fileRouteGet(
      new NextRequest(new URL(`http://localhost:3000/api/files/${refBPublishedKey}`)),
      { params: Promise.resolve({ fileKey: refBPublishedKey.split("/") }) }
    );
    assert.equal(routeRes.status, 403);

    // Disqualified participant in Contest A cannot access Contest A reference
    setTestSession({
      userId: partDisqualifiedAId,
      email: partDisqEmail,
      name: "A3 Disqualified A",
      role: "PARTICIPANT",
    });

    const disqRes = await getFileDownloadUrlAction(refAKey);
    assert.equal(disqRes.success, false);
    const disqAuth = await authorizeFileAccess(
      {
        userId: partDisqualifiedAId,
        email: partDisqEmail,
        name: "A3 Disqualified A",
        role: "PARTICIPANT",
        issuedAt: Date.now(),
        expiresAt: Date.now() + 3600 * 1000,
      },
      refAKey
    );
    assert.equal(disqAuth.authorized, false);
    if (!disqAuth.authorized) {
      assert.equal(disqAuth.status, 403);
    }
  });

  it("3. Rejects participant accessing another contest's reference or another candidate's submission", async () => {
    setTestSession({
      userId: partBId,
      email: partBEmail,
      name: "A3 Participant B",
      role: "PARTICIPANT",
    });

    const crossContestRef = await getFileDownloadUrlAction(refAKey);
    assert.equal(crossContestRef.success, false);
    assert.match(crossContestRef.error || "", /forbidden|denied/i);

    const crossContestSub = await fileRouteGet(
      new NextRequest(new URL(`http://localhost:3000/api/files/${subAKey}`)),
      { params: Promise.resolve({ fileKey: subAKey.split("/") }) }
    );
    assert.equal(crossContestSub.status, 403);
  });

  it("4. Enforces evaluator contest and candidate assignments", async () => {
    // Unassigned evaluator rejected for Contest A ref & submission
    setTestSession({
      userId: evalUnassignedId,
      email: evalUnassignedEmail,
      name: "A3 Eval Other",
      role: "EVALUATOR",
    });

    const unassRef = await getFileDownloadUrlAction(refAKey);
    assert.equal(unassRef.success, false);
    assert.match(unassRef.error || "", /forbidden|denied/i);

    const unassSubRoute = await fileRouteGet(
      new NextRequest(new URL(`http://localhost:3000/api/files/${subAKey}`)),
      { params: Promise.resolve({ fileKey: subAKey.split("/") }) }
    );
    assert.equal(unassSubRoute.status, 403);

    // evalA assigned to Contest A + partA only (NOT partA2, NOT Contest B)
    setTestSession({
      userId: evalAId,
      email: evalAEmail,
      name: "A3 Eval A",
      role: "EVALUATOR",
    });

    const evalAContestBRef = await getFileDownloadUrlAction(refBPublishedKey);
    assert.equal(evalAContestBRef.success, false);

    const evalAUnassignedCandSub = await getFileDownloadUrlAction(subA2Key);
    assert.equal(evalAUnassignedCandSub.success, false);

    const evalAAllowedRef = await getFileDownloadUrlAction(refAKey);
    assert.equal(evalAAllowedRef.success, true);

    const evalAAllowedSub = await getFileDownloadUrlAction(subAKey);
    assert.equal(evalAAllowedSub.success, true);
  });

  it("5. Secures ReferenceMaterial with taskId = null (never public to participants or evaluators)", async () => {
    setTestSession({
      userId: partAId,
      email: partAEmail,
      name: "A3 Participant A",
      role: "PARTICIPANT",
    });

    const partNullRes = await getFileDownloadUrlAction(refNullTaskKey);
    assert.equal(partNullRes.success, false);
    assert.match(partNullRes.error || "", /forbidden|denied/i);

    const partNullRoute = await fileRouteGet(
      new NextRequest(new URL(`http://localhost:3000/api/files/${refNullTaskKey}`)),
      { params: Promise.resolve({ fileKey: refNullTaskKey.split("/") }) }
    );
    assert.equal(partNullRoute.status, 403);

    setTestSession({
      userId: evalAId,
      email: evalAEmail,
      name: "A3 Eval A",
      role: "EVALUATOR",
    });

    const evalNullRes = await getFileDownloadUrlAction(refNullTaskKey);
    assert.equal(evalNullRes.success, false);

    const evalNullRoute = await fileRouteGet(
      new NextRequest(new URL(`http://localhost:3000/api/files/${refNullTaskKey}`)),
      { params: Promise.resolve({ fileKey: refNullTaskKey.split("/") }) }
    );
    assert.equal(evalNullRoute.status, 403);
  });

  it("6. Rejects path traversal, encoding bypass, and malformed keys everywhere", async () => {
    const traversalKeys = [
      "../secret.pdf",
      "submissions/../../etc/passwd",
      "submissions/./secret.pdf",
      "submissions/%2e%2e/secret.pdf",
      "references/foo%2Fbar.pdf",
      "submissions\\secret.pdf",
      "/submissions/secret.pdf",
      "submissions//secret.pdf",
      "submissions/secret.pdf?download=1",
      "submissions/secret.pdf#frag",
      "private-other/secret.pdf",
      "   ",
    ];

    setTestSession({
      userId: adminActiveId,
      email: adminActiveEmail,
      name: "A3 Admin",
      role: "ADMIN",
    });

    for (const badKey of traversalKeys) {
      assert.equal(validateStorageKey(badKey).isValid, false, `Expected invalid key: ${badKey}`);
      const res = await getFileDownloadUrlAction(badKey);
      assert.equal(res.success, false, `Action must reject traversal key: ${badKey}`);
      assert.doesNotMatch(res.error || "", /secret|passwd|supabase/i);

      await assert.rejects(() => getSignedDownloadUrl(badKey));
      await assert.rejects(() => downloadFromStorage(badKey));
      assert.equal(await deleteFromStorage(badKey), false);
    }

    const segmentAttacks: string[][] = [
      ["submissions", "..", "etc", "passwd"],
      ["submissions", ".", "foo.pdf"],
      ["submissions", "%2e%2e", "secret.pdf"],
      ["references", ""],
      ["unknown", "file.pdf"],
    ];

    for (const segments of segmentAttacks) {
      const routeRes = await fileRouteGet(
        new NextRequest(new URL("http://localhost:3000/api/files/test")),
        { params: Promise.resolve({ fileKey: segments }) }
      );
      assert.equal(routeRes.status, 400);
    }
  });

  it("7. Rejects invalid, inactive-user, and nonexistent DB file keys (even for ADMIN)", async () => {
    const arbitraryUnverifiedKey = `submissions/arbitrary-untracked-${suffix}.pdf`;
    assert.equal(validateStorageKey(arbitraryUnverifiedKey).isValid, true);

    setTestSession({
      userId: adminActiveId,
      email: adminActiveEmail,
      name: "A3 Admin",
      role: "ADMIN",
    });

    const adminArbitraryAction = await getFileDownloadUrlAction(arbitraryUnverifiedKey);
    assert.equal(adminArbitraryAction.success, false);
    assert.match(adminArbitraryAction.error || "", /not found|denied/i);

    const adminArbitraryRoute = await fileRouteGet(
      new NextRequest(new URL(`http://localhost:3000/api/files/${arbitraryUnverifiedKey}`)),
      { params: Promise.resolve({ fileKey: arbitraryUnverifiedKey.split("/") }) }
    );
    assert.equal(adminArbitraryRoute.status, 404);

    // Inactive admin cannot download valid DB reference
    setTestSession({
      userId: adminInactiveId,
      email: adminInactiveEmail,
      name: "A3 Inactive Admin",
      role: "ADMIN",
    });
    const inactiveAdminRes = await getFileDownloadUrlAction(refAKey);
    assert.equal(inactiveAdminRes.success, false);
  });

  it("8. Allows enrolled participant, assigned evaluator, and active admin to download permitted files", async () => {
    const origFetch = global.fetch;
    const origUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const origKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://mock-storage.local";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "mock-service-role-key";

    global.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/storage/v1/object/sign/")) {
        return new Response(
          JSON.stringify({ signedURL: "/object/sign/aci-assessments-private/signed-ok.pdf" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/storage/v1/object/authenticated/")) {
        return new Response(fakePdfBytes, {
          status: 200,
          headers: { "Content-Type": "application/pdf" },
        });
      }
      throw new Error(`Unexpected fetch URL in test: ${url}`);
    }) as typeof fetch;

    try {
      // Enrolled participant in Contest A downloads Contest A ReferenceMaterial
      setTestSession({
        userId: partAId,
        email: partAEmail,
        name: "A3 Participant A",
        role: "PARTICIPANT",
      });
      const partAction = await getFileDownloadUrlAction(refAKey);
      assert.equal(partAction.success, true);
      assert.ok(partAction.downloadUrl?.includes("/storage/v1/"));

      const partStream = await fileRouteGet(
        new NextRequest(new URL(`http://localhost:3000/api/files/${refAKey}`)),
        { params: Promise.resolve({ fileKey: refAKey.split("/") }) }
      );
      assert.equal(partStream.status, 200);
      assert.equal(partStream.headers.get("content-type"), "application/pdf");
      assert.match(partStream.headers.get("content-disposition") || "", /^inline;/);

      // Enrolled participant in Contest B downloads Contest B published ReferenceMaterial
      setTestSession({
        userId: partBId,
        email: partBEmail,
        name: "A3 Participant B",
        role: "PARTICIPANT",
      });
      const partBAction = await getFileDownloadUrlAction(refBPublishedKey);
      assert.equal(partBAction.success, true);

      // Active Admin downloads DB-backed ReferenceMaterial (including null-task reference) & SubmissionAnswer
      setTestSession({
        userId: adminActiveId,
        email: adminActiveEmail,
        name: "A3 Admin",
        role: "ADMIN",
      });
      const adminNullRef = await getFileDownloadUrlAction(refNullTaskKey);
      assert.equal(adminNullRef.success, true);

      const adminStream = await fileRouteGet(
        new NextRequest(new URL(`http://localhost:3000/api/files/${subAKey}?download=1`)),
        { params: Promise.resolve({ fileKey: subAKey.split("/") }) }
      );
      assert.equal(adminStream.status, 200);
      assert.match(adminStream.headers.get("content-disposition") || "", /^attachment;/);
    } finally {
      global.fetch = origFetch;
      if (origUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = origUrl;
      if (origKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = origKey;
    }
  });
});
