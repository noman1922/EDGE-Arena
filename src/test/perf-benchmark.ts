import { performance } from "perf_hooks";
import { getAdminContests, getAdminContestOptions, getAdminOverviewSummaryAction } from "../app/actions/contest-actions";
import { getSubmissionsForGrading } from "../app/actions/evaluator-actions";
import { getAdminParticipants } from "../app/actions/participant-actions";
import { getAdminSubmissionsList, getAdminLeaderboardAndResults } from "../app/actions/results-actions";
import { getContestMonitoringDashboardAction } from "../app/actions/monitoring-actions";
import { setTestSession } from "../lib/auth";

async function measure<T>(name: string, fn: () => Promise<T>): Promise<{ name: string; ms: number }> {
  // Warmup
  try { await fn(); } catch (e) { /* ignore warmup error */ }

  const start = performance.now();
  await fn();
  const end = performance.now();
  const ms = Math.round((end - start) * 10) / 10;
  return { name, ms };
}

async function runBenchmark() {
  setTestSession({
    userId: "admin-benchmark-user",
    email: "admin@test.edu",
    role: "ADMIN",
    name: "Admin Benchmark",
    issuedAt: Date.now(),
    expiresAt: Date.now() + 3600000,
  });

  console.log("=== Performance Benchmark Start ===");
  const results: Record<string, number> = {};

  const b1 = await measure("getAdminContests", () => getAdminContests());
  console.log(`${b1.name}: ${b1.ms} ms`);
  results[b1.name] = b1.ms;

  const b2 = await measure("getSubmissionsForGrading", () => getSubmissionsForGrading());
  console.log(`${b2.name}: ${b2.ms} ms`);
  results[b2.name] = b2.ms;

  const b3 = await measure("getAdminParticipants", () => getAdminParticipants());
  console.log(`${b3.name}: ${b3.ms} ms`);
  results[b3.name] = b3.ms;

  const b4 = await measure("getAdminSubmissionsList", () => getAdminSubmissionsList());
  console.log(`${b4.name}: ${b4.ms} ms`);
  results[b4.name] = b4.ms;

  const b5 = await measure("getAdminLeaderboardAndResults", () => getAdminLeaderboardAndResults());
  console.log(`${b5.name}: ${b5.ms} ms`);
  results[b5.name] = b5.ms;

  const b6 = await measure("getContestMonitoringDashboardAction", () => getContestMonitoringDashboardAction());
  console.log(`${b6.name}: ${b6.ms} ms`);
  results[b6.name] = b6.ms;

  const b7 = await measure("getAdminContestOptions", () => getAdminContestOptions());
  console.log(`${b7.name}: ${b7.ms} ms`);
  results[b7.name] = b7.ms;

  const b8 = await measure("getAdminOverviewSummaryAction", () => getAdminOverviewSummaryAction());
  console.log(`${b8.name}: ${b8.ms} ms`);
  results[b8.name] = b8.ms;

  console.log("=== Performance Benchmark End ===");
  setTestSession(null);
}

runBenchmark().catch(console.error);
