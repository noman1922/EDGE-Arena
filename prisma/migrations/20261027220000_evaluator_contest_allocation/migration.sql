-- CreateTable
CREATE TABLE "ContestEvaluator" (
    "id" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContestEvaluator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluatorCandidateAssignment" (
    "id" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "contestEvaluatorId" TEXT NOT NULL,
    "evaluatorId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvaluatorCandidateAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContestEvaluator_contestId_idx" ON "ContestEvaluator"("contestId");

-- CreateIndex
CREATE INDEX "ContestEvaluator_userId_idx" ON "ContestEvaluator"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ContestEvaluator_contestId_userId_key" ON "ContestEvaluator"("contestId", "userId");

-- CreateIndex
CREATE INDEX "EvaluatorCandidateAssignment_contestId_evaluatorId_idx" ON "EvaluatorCandidateAssignment"("contestId", "evaluatorId");

-- CreateIndex
CREATE INDEX "EvaluatorCandidateAssignment_contestId_participantId_idx" ON "EvaluatorCandidateAssignment"("contestId", "participantId");

-- CreateIndex
CREATE INDEX "EvaluatorCandidateAssignment_evaluatorId_idx" ON "EvaluatorCandidateAssignment"("evaluatorId");

-- CreateIndex
CREATE INDEX "EvaluatorCandidateAssignment_participantId_idx" ON "EvaluatorCandidateAssignment"("participantId");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluatorCandidateAssignment_contestId_evaluatorId_particip_key" ON "EvaluatorCandidateAssignment"("contestId", "evaluatorId", "participantId");

-- AddForeignKey
ALTER TABLE "ContestEvaluator" ADD CONSTRAINT "ContestEvaluator_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "Contest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestEvaluator" ADD CONSTRAINT "ContestEvaluator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluatorCandidateAssignment" ADD CONSTRAINT "EvaluatorCandidateAssignment_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "Contest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluatorCandidateAssignment" ADD CONSTRAINT "EvaluatorCandidateAssignment_contestEvaluatorId_fkey" FOREIGN KEY ("contestEvaluatorId") REFERENCES "ContestEvaluator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluatorCandidateAssignment" ADD CONSTRAINT "EvaluatorCandidateAssignment_evaluatorId_fkey" FOREIGN KEY ("evaluatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluatorCandidateAssignment" ADD CONSTRAINT "EvaluatorCandidateAssignment_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
