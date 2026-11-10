-- 1. Create Enum for PhaseAttempt status
CREATE TYPE "PhaseAttemptStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'EXPIRED');

-- 2. Add durationMinutes to Phase table
ALTER TABLE "Phase" ADD COLUMN "durationMinutes" INTEGER;

-- 3. Add composite unique constraint to Phase table for referential integrity
CREATE UNIQUE INDEX "Phase_id_contestId_key" ON "Phase"("id", "contestId");

-- 4. Create PhaseAttempt table (including completedAt)
CREATE TABLE "PhaseAttempt" (
    "id" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "phaseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "PhaseAttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhaseAttempt_pkey" PRIMARY KEY ("id")
);

-- 5. Create unique constraint for one attempt per participant per phase
CREATE UNIQUE INDEX "PhaseAttempt_phaseId_userId_key" ON "PhaseAttempt"("phaseId", "userId");

-- 6. Create performance indexes
CREATE INDEX "PhaseAttempt_contestId_userId_idx" ON "PhaseAttempt"("contestId", "userId");
CREATE INDEX "PhaseAttempt_phaseId_status_idx" ON "PhaseAttempt"("phaseId", "status");
CREATE INDEX "PhaseAttempt_userId_status_idx" ON "PhaseAttempt"("userId", "status");

-- 7. Add foreign keys with cascading delete safety
ALTER TABLE "PhaseAttempt" 
    ADD CONSTRAINT "PhaseAttempt_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "User"("id") 
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PhaseAttempt" 
    ADD CONSTRAINT "PhaseAttempt_contestId_fkey" 
    FOREIGN KEY ("contestId") REFERENCES "Contest"("id") 
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PhaseAttempt" 
    ADD CONSTRAINT "PhaseAttempt_phaseId_contestId_fkey" 
    FOREIGN KEY ("phaseId", "contestId") REFERENCES "Phase"("id", "contestId") 
    ON DELETE CASCADE ON UPDATE CASCADE;

