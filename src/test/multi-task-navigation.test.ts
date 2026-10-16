import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { setTestSession } from "../lib/auth";
import { ensurePilotContest } from "./ensure-pilot-contest";
import {
  getTaskAssessmentData,
  getParticipantDashboard,
} from "../app/actions/assessment-actions";

describe("Participant Multi-Phase and Multi-Task Assessment Navigation", () => {
  const contestId = "f276718f-528b-47f6-9ae7-b32549840aaf"; // ACI Career EDGE Campus Leader Pilot 2026
  const participantEmail = "s.jenkins@campus.edu";

  before(async () => {
    await ensurePilotContest();
    await prisma.contest.update({
      where: { id: contestId },
      data: { enforceSequentialProgress: false },
    });
  });

  test("1. getTaskAssessmentData returns all phases and all tasks for navigation", async () => {
    const user = await prisma.user.findUnique({ where: { email: participantEmail } });
    assert.ok(user, "Participant user must exist");

    setTestSession({
      userId: user.id,
      email: user.email,
      role: "PARTICIPANT",
      name: user.name,
    });

    // Call without explicit taskId (default entry from dashboard)
    const data = await getTaskAssessmentData(contestId);

    assert.equal(data.state, "READY");
    assert.ok(data.task, "Default task must be resolved");
    assert.ok(data.phases && data.phases.length >= 2, "Must return all phases (expected 2)");
    assert.ok(data.allTasks && data.allTasks.length >= 4, "Must return all tasks across phases (expected 4)");

    // Verify Phase 1 and Phase 2 exist in navigation payload
    const phase1 = data.phases.find((p) => p.phaseNumber === 1);
    const phase2 = data.phases.find((p) => p.phaseNumber === 2);
    assert.ok(phase1, "Phase 1 must exist in payload");
    assert.ok(phase2, "Phase 2 must exist in payload");
    assert.equal(phase1.tasks.length, 2, "Phase 1 must have 2 tasks (1.1 and 1.2)");
    assert.equal(phase2.tasks.length, 2, "Phase 2 must have 2 tasks (2.1 and 2.2)");

    // Verify tasks include question types
    const task11 = data.allTasks.find((t) => t.taskNumber === 1 && t.phaseNumber === 1);
    const task12 = data.allTasks.find((t) => t.taskNumber === 2 && t.phaseNumber === 1);
    const task21 = data.allTasks.find((t) => t.taskNumber === 1 && t.phaseNumber === 2);
    const task22 = data.allTasks.find((t) => t.taskNumber === 2 && t.phaseNumber === 2);

    assert.ok(task11 && task12 && task21 && task22, "All 4 tasks must be present in allTasks");
    assert.ok(task11.questionTypes.includes("MCQ"), "Task 1.1 must identify as MCQ");
    assert.ok(task12.questionTypes.includes("FILE_UPLOAD"), "Task 1.2 must identify as FILE_UPLOAD");
  });

  test("2. getTaskAssessmentData seamlessly switches to any selected taskId across phases", async () => {
    const user = await prisma.user.findUnique({ where: { email: participantEmail } });
    assert.ok(user);

    setTestSession({
      userId: user.id,
      email: user.email,
      role: "PARTICIPANT",
      name: user.name,
    });

    // Test switching to Task 1.2 (PDF Upload in Phase 1)
    const task12Id = "60e233e5-9d1f-4c2e-96c3-d7603f0a1fa0";
    const data12 = await getTaskAssessmentData(contestId, task12Id);
    assert.equal(data12.task.id, task12Id);
    assert.equal(data12.phase?.phaseNumber, 1);
    assert.equal(data12.questions[0]?.type, "FILE_UPLOAD");

    // Test switching to Task 2.1 in Phase 2
    const task21Id = "92e1c776-68c9-46c5-882b-797c05e2f6b7";
    const data21 = await getTaskAssessmentData(contestId, task21Id);
    assert.equal(data21.task.id, task21Id);
    assert.equal(data21.phase?.phaseNumber, 2);
  });

  test("3. getParticipantDashboard exposes total task count and phase breakdown", async () => {
    const user = await prisma.user.findUnique({ where: { email: participantEmail } });
    assert.ok(user);

    setTestSession({
      userId: user.id,
      email: user.email,
      role: "PARTICIPANT",
      name: user.name,
    });

    const dash = await getParticipantDashboard();
    const pilot = dash.contests.find((c) => c.contestId === contestId);

    assert.ok(pilot, "Pilot contest must be on participant dashboard");
    assert.equal(pilot.totalTasks, 4, "Dashboard must report 4 total tasks");
    assert.ok(pilot.phases && pilot.phases.length >= 2, "Dashboard must include all phases");
  });
});
