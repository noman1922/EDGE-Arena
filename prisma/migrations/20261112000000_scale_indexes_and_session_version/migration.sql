-- Scale optimization indexes and session version epoch column for EDGE-Arena

-- 1. Track per-user session epoch directly on User to eliminate redundant AuditLog epoch scans
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sessionVersion" INTEGER NOT NULL DEFAULT 1;

-- 2. Composite index for per-contest candidate submission lookups (scorecard, leaderboard, publish)
CREATE INDEX IF NOT EXISTS "Submission_contestId_userId_idx" ON "Submission"("contestId", "userId");

-- 3. Covering index for fast AuditLog session revocation checks and chronological monitoring lookups
DROP INDEX IF EXISTS "AuditLog_targetType_targetId_idx";
CREATE INDEX IF NOT EXISTS "AuditLog_targetType_targetId_action_createdAt_idx" ON "AuditLog"("targetType", "targetId", "action", "createdAt");

