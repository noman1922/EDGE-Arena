-- AlterTable
ALTER TABLE "Contest" ADD COLUMN IF NOT EXISTS "durationMinutes" INTEGER;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "durationMinutes" INTEGER;

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);

