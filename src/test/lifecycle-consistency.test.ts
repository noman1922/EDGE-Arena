import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { setTestSession } from "../lib/auth";
import { ensurePilotContest } from "./ensure-pilot-contest";
import {
  getAdminContests,
  getAdminOverviewSummaryAction,
  updateContestStatusAction,
} from "../app/actions/contest-actions";
import {
  getTaskAssessmentData,
  getParticipantDashboard,
} from "../app/actions/assessment-actions";
import { getEvaluatorDashboardDataAction } from "../app/actions/evaluator-actions";
import { getContestMonitoringDashboardAction } from "../app/actions/monitoring-actions";
import {
  isContestActive,
  isContestConcluded,
  getAuthoritativeContestDeadline,
} from "../lib/contest-lifecycle";

describe("Shared Contest Lifecycle & Cross-Role Consistency", () => {
  const contestId = "f276718f-528b-47f6-9ae7-b32549840aaf"; // ACI Career EDGE Campus Leader Pilot 2026
  const participantEmail = "s.jenkins@campus.edu";
  const evaluatorEmail = "evaluator.demo@example.com";
  const adminEmail = "admin.demo@example.com";

  before(async () => {
    await ensurePilotContest();
  });

  test("1. Admin LIVE contest displays Live in Admin, active in Participant, and active in Evaluator", async () => {
    const participantUser = await prisma.user.findUnique({ where: { email: participantEmail } });
    const evaluatorUser = await prisma.user.findUnique({ where: { email: evaluatorEmail } });
    const adminUser = await prisma.user.findUnique({ where: { email: adminEmail } });

    assert.ok(participantUser);
    assert.ok(evaluatorUser);
    assert.ok(adminUser);

    // 1. Admin View
    setTestSession({ userId: adminUser.id, email: adminEmail, role: "ADMIN", name: "Administrator" });
    const adminContests = await getAdminContests();
    const pilotAdmin = adminContests.find((c) => c.id === contestId);
    const adminSummary = await getAdminOverviewSummaryAction();

    assert.equal(pilotAdmin?.status, "Live", "Admin must display contest as Live");
    assert.ok(adminSummary.activeContests >= 1, "Admin active contests count must be >= 1");

    // 2. Participant View
    setTestSession({ userId: participantUser.id, email: participantEmail, role: "PARTICIPANT", name: "Sarah Jenkins" });
    const partDash = await getParticipantDashboard(participantEmail);
    const pilotPartDash = partDash.contests.find((c) => c.contestId === contestId);

    assert.notEqual(pilotPartDash?.daysRemainingText, "Contest Concluded", "Live contest must not show Contest Concluded on dashboard");
    assert.notEqual(pilotPartDash?.status, "COMPLETED", "Live contest must not have status COMPLETED on participant dashboard");

    const taskData = await getTaskAssessmentData(contestId);
    assert.equal(taskData.isContestEnded, false, "Live contest must NOT have isContestEnded = true for participant");
    assert.ok(taskData.task.secondsLeft > 0, "Seconds left must be greater than zero");
    assert.equal(taskData.canSubmit, true, "Participant must be able to submit active task");

    // 3. Evaluator View
    setTestSession({ userId: evaluatorUser.id, email: evaluatorEmail, role: "EVALUATOR", name: "Demo Evaluator" });
    const evalDash = await getEvaluatorDashboardDataAction();
    const pilotEval = evalDash.assignedContests.find((c) => c.id === contestId);

    assert.ok(evalDash.activeContestsCount >= 1, "Evaluator active contests count must be >= 1");
    assert.equal(pilotEval?.isActive, true, "Contest must be marked active for evaluator");
    assert.equal(pilotEval?.uiStatus, "Live", "Evaluator UI status must be Live");

    const monDash = await getContestMonitoringDashboardAction(contestId);
    assert.equal(monDash.success, true, "Evaluator must be able to access monitoring dashboard for active contest");
  });

  test("2. Admin marks COMPLETED: all three roles immediately agree contest is concluded", async () => {
    const participantUser = await prisma.user.findUnique({ where: { email: participantEmail } });
    const evaluatorUser = await prisma.user.findUnique({ where: { email: evaluatorEmail } });
    const adminUser = await prisma.user.findUnique({ where: { email: adminEmail } });

    assert.ok(participantUser && evaluatorUser && adminUser);

    setTestSession({ userId: adminUser.id, email: adminEmail, role: "ADMIN", name: "Administrator" });
    await updateContestStatusAction(contestId, "COMPLETED");

    // Admin check
    const adminContestsComp = await getAdminContests();
    const pilotAdminComp = adminContestsComp.find((c) => c.id === contestId);
    assert.equal(pilotAdminComp?.status, "Completed");

    // Participant check
    setTestSession({ userId: participantUser.id, email: participantEmail, role: "PARTICIPANT", name: "Sarah Jenkins" });
    const taskDataComp = await getTaskAssessmentData(contestId);
    assert.equal(taskDataComp.isContestEnded, true);
    assert.equal(taskDataComp.task.secondsLeft, 0);
    assert.equal(taskDataComp.canSubmit, false);

    // Evaluator check
    setTestSession({ userId: evaluatorUser.id, email: evaluatorEmail, role: "EVALUATOR", name: "Demo Evaluator" });
    const evalDashComp = await getEvaluatorDashboardDataAction();
    const pilotEvalComp = evalDashComp.assignedContests.find((c) => c.id === contestId);
    assert.equal(pilotEvalComp?.isActive, false);
    assert.equal(pilotEvalComp?.uiStatus, "Completed");

    // Restore to LIVE for continued testing
    setTestSession({ userId: adminUser.id, email: adminEmail, role: "ADMIN", name: "Administrator" });
    await updateContestStatusAction(contestId, "LIVE");
  });

  test("3. Contest isolation: status changes on another contest do not bleed into pilot contest", async () => {
    const adminUser = await prisma.user.findUnique({ where: { email: adminEmail } });
    assert.ok(adminUser);

    setTestSession({ userId: adminUser.id, email: adminEmail, role: "ADMIN", name: "Administrator" });
    const secondContestId = "33f22c22-1b9d-4206-bb1d-e0c8ff4bcb3f";

    await updateContestStatusAction(secondContestId, "LIVE");
    const adminSummaryAfterLive = await getAdminOverviewSummaryAction();
    assert.ok(adminSummaryAfterLive.activeContests >= 2);

    await updateContestStatusAction(secondContestId, "DRAFT");
    const pilotStillLive = (await getAdminContests()).find((c) => c.id === contestId);
    assert.equal(pilotStillLive?.status, "Live");
  });
});
