-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'EVALUATOR', 'PARTICIPANT');

-- CreateEnum
CREATE TYPE "ParticipantStatus" AS ENUM ('ENROLLED', 'ACTIVE', 'DISQUALIFIED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ContestStatus" AS ENUM ('DRAFT', 'LIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PhaseStatus" AS ENUM ('UPCOMING', 'OPEN', 'EVALUATING', 'CLOSED');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('MCQ', 'WRITTEN', 'FILE_UPLOAD', 'REFERENCE');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'GRADING_IN_PROGRESS', 'GRADED', 'PUBLISHED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'PARTICIPANT',
    "name" TEXT NOT NULL,
    "candidateId" TEXT,
    "institution" TEXT,
    "avatarUrl" TEXT,
    "cohortId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cohort" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "institutionCount" INTEGER NOT NULL DEFAULT 1,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cohort_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contest" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "track" TEXT NOT NULL,
    "description" TEXT,
    "status" "ContestStatus" NOT NULL DEFAULT 'DRAFT',
    "cohortId" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContestParticipant" (
    "id" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ParticipantStatus" NOT NULL DEFAULT 'ENROLLED',
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContestParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Phase" (
    "id" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "phaseNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "weightPercentage" DECIMAL(5,2) NOT NULL,
    "deadline" TIMESTAMP(3) NOT NULL,
    "status" "PhaseStatus" NOT NULL DEFAULT 'UPCOMING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Phase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "phaseId" TEXT NOT NULL,
    "taskNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT,
    "totalPoints" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "questionNumber" INTEGER NOT NULL,
    "type" "QuestionType" NOT NULL,
    "prompt" TEXT NOT NULL,
    "instructions" TEXT,
    "points" INTEGER NOT NULL,
    "isMandatory" BOOLEAN NOT NULL DEFAULT true,
    "minWords" INTEGER,
    "maxWords" INTEGER,
    "allowedFileTypes" TEXT,
    "maxFileSizeBytes" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McqOption" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "optionKey" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "scopeTag" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McqOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionAnswerKey" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "correctOptionKey" TEXT,
    "explanation" TEXT,
    "scoringGuide" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionAnswerKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferenceMaterial" (
    "id" TEXT NOT NULL,
    "taskId" TEXT,
    "title" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileUrl" TEXT,
    "fileSizeBytes" BIGINT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "version" TEXT DEFAULT 'Rev 1',
    "checksumSha256" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferenceMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "phaseId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "autoSavedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "autoGradeScore" DECIMAL(6,2),
    "manualGradeScore" DECIMAL(6,2),
    "finalScore" DECIMAL(6,2),
    "isLate" BOOLEAN NOT NULL DEFAULT false,
    "feedbackSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmissionAnswer" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "selectedOption" TEXT,
    "writtenText" TEXT,
    "wordCount" INTEGER,
    "fileKey" TEXT,
    "fileName" TEXT,
    "fileSizeBytes" BIGINT,
    "fileSha256" TEXT,
    "score" DECIMAL(6,2),
    "isCorrect" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubmissionAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RubricCriterion" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "weightPercentage" DECIMAL(5,2) NOT NULL,
    "maxPoints" DECIMAL(6,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RubricCriterion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationScore" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "rubricId" TEXT NOT NULL,
    "evaluatorId" TEXT NOT NULL,
    "scoreAwarded" DECIMAL(6,2) NOT NULL,
    "comments" TEXT,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvaluationScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CohortResult" (
    "id" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "totalScore" DECIMAL(6,2) NOT NULL,
    "rank" INTEGER NOT NULL,
    "percentile" DECIMAL(5,2) NOT NULL,
    "isCertified" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CohortResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_candidateId_key" ON "User"("candidateId");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_cohortId_idx" ON "User"("cohortId");

-- CreateIndex
CREATE UNIQUE INDEX "Cohort_code_key" ON "Cohort"("code");

-- CreateIndex
CREATE INDEX "Cohort_code_idx" ON "Cohort"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Contest_slug_key" ON "Contest"("slug");

-- CreateIndex
CREATE INDEX "Contest_status_startDate_endDate_idx" ON "Contest"("status", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "Contest_cohortId_idx" ON "Contest"("cohortId");

-- CreateIndex
CREATE INDEX "ContestParticipant_contestId_status_idx" ON "ContestParticipant"("contestId", "status");

-- CreateIndex
CREATE INDEX "ContestParticipant_userId_idx" ON "ContestParticipant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ContestParticipant_contestId_userId_key" ON "ContestParticipant"("contestId", "userId");

-- CreateIndex
CREATE INDEX "Phase_contestId_status_deadline_idx" ON "Phase"("contestId", "status", "deadline");

-- CreateIndex
CREATE UNIQUE INDEX "Phase_contestId_phaseNumber_key" ON "Phase"("contestId", "phaseNumber");

-- CreateIndex
CREATE INDEX "Task_phaseId_idx" ON "Task"("phaseId");

-- CreateIndex
CREATE UNIQUE INDEX "Task_phaseId_taskNumber_key" ON "Task"("phaseId", "taskNumber");

-- CreateIndex
CREATE INDEX "Question_taskId_type_idx" ON "Question"("taskId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Question_taskId_questionNumber_key" ON "Question"("taskId", "questionNumber");

-- CreateIndex
CREATE INDEX "McqOption_questionId_idx" ON "McqOption"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "McqOption_questionId_optionKey_key" ON "McqOption"("questionId", "optionKey");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionAnswerKey_questionId_key" ON "QuestionAnswerKey"("questionId");

-- CreateIndex
CREATE INDEX "ReferenceMaterial_taskId_idx" ON "ReferenceMaterial"("taskId");

-- CreateIndex
CREATE INDEX "Submission_taskId_status_idx" ON "Submission"("taskId", "status");

-- CreateIndex
CREATE INDEX "Submission_userId_status_idx" ON "Submission"("userId", "status");

-- CreateIndex
CREATE INDEX "Submission_contestId_phaseId_finalScore_submittedAt_idx" ON "Submission"("contestId", "phaseId", "finalScore" DESC, "submittedAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Submission_taskId_userId_key" ON "Submission"("taskId", "userId");

-- CreateIndex
CREATE INDEX "SubmissionAnswer_submissionId_idx" ON "SubmissionAnswer"("submissionId");

-- CreateIndex
CREATE INDEX "SubmissionAnswer_questionId_idx" ON "SubmissionAnswer"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "SubmissionAnswer_submissionId_questionId_key" ON "SubmissionAnswer"("submissionId", "questionId");

-- CreateIndex
CREATE INDEX "RubricCriterion_taskId_idx" ON "RubricCriterion"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "RubricCriterion_taskId_name_key" ON "RubricCriterion"("taskId", "name");

-- CreateIndex
CREATE INDEX "EvaluationScore_submissionId_idx" ON "EvaluationScore"("submissionId");

-- CreateIndex
CREATE INDEX "EvaluationScore_evaluatorId_idx" ON "EvaluationScore"("evaluatorId");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationScore_submissionId_rubricId_evaluatorId_key" ON "EvaluationScore"("submissionId", "rubricId", "evaluatorId");

-- CreateIndex
CREATE INDEX "CohortResult_contestId_rank_idx" ON "CohortResult"("contestId", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "CohortResult_contestId_userId_key" ON "CohortResult"("contestId", "userId");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contest" ADD CONSTRAINT "Contest_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestParticipant" ADD CONSTRAINT "ContestParticipant_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "Contest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestParticipant" ADD CONSTRAINT "ContestParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Phase" ADD CONSTRAINT "Phase_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "Contest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "Phase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McqOption" ADD CONSTRAINT "McqOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionAnswerKey" ADD CONSTRAINT "QuestionAnswerKey_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferenceMaterial" ADD CONSTRAINT "ReferenceMaterial_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "Contest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "Phase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionAnswer" ADD CONSTRAINT "SubmissionAnswer_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionAnswer" ADD CONSTRAINT "SubmissionAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RubricCriterion" ADD CONSTRAINT "RubricCriterion_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationScore" ADD CONSTRAINT "EvaluationScore_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationScore" ADD CONSTRAINT "EvaluationScore_rubricId_fkey" FOREIGN KEY ("rubricId") REFERENCES "RubricCriterion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationScore" ADD CONSTRAINT "EvaluationScore_evaluatorId_fkey" FOREIGN KEY ("evaluatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CohortResult" ADD CONSTRAINT "CohortResult_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "Contest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CohortResult" ADD CONSTRAINT "CohortResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- =============================================================================
-- ACI Career EDGE Assess — Supabase Security, Functions, Triggers & RLS
-- =============================================================================

-- 1. Enable Row Level Security on all 16 tables
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Cohort" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Contest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContestParticipant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Phase" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Task" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Question" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "McqOption" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QuestionAnswerKey" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReferenceMaterial" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Submission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SubmissionAnswer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RubricCriterion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EvaluationScore" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CohortResult" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;

-- 2. Security Definer Helper Functions (Search path pinned)
CREATE OR REPLACE FUNCTION auth.get_user_role()
RETURNS "UserRole" AS $$
  SELECT role FROM public."User" WHERE id = auth.uid()::text LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- 3. Synchronize Supabase Auth identities into public."User"
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public."User" (id, email, name, role, "createdAt", "updatedAt")
  VALUES (
    NEW.id::text,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    ),
    'PARTICIPANT',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    "updatedAt" = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 4. Prevent User Role Self-Escalation
CREATE OR REPLACE FUNCTION public.prevent_user_role_escalation()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role <> OLD.role AND (auth.get_user_role() IS NULL OR auth.get_user_role() <> 'ADMIN') THEN
    RAISE EXCEPTION 'Unauthorized: only platform administrators can modify user roles.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON public."User";
CREATE TRIGGER trg_prevent_role_escalation
  BEFORE UPDATE ON public."User"
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_user_role_escalation();

-- 5. Prevent Participant Score Forgery on Submission
CREATE OR REPLACE FUNCTION public.check_submission_scoring_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF (auth.get_user_role() IS NULL OR auth.get_user_role() = 'PARTICIPANT') THEN
    IF NEW."autoGradeScore" IS DISTINCT FROM OLD."autoGradeScore" OR
       NEW."manualGradeScore" IS DISTINCT FROM OLD."manualGradeScore" OR
       NEW."finalScore" IS DISTINCT FROM OLD."finalScore" OR
       NEW."isLate" IS DISTINCT FROM OLD."isLate" THEN
      RAISE EXCEPTION 'Participants are not permitted to alter score or late-status metadata.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_protect_submission_scoring ON public."Submission";
CREATE TRIGGER trg_protect_submission_scoring
  BEFORE UPDATE ON public."Submission"
  FOR EACH ROW
  EXECUTE FUNCTION public.check_submission_scoring_immutable();

-- 6. Prevent Participant Score Forgery on SubmissionAnswer
CREATE OR REPLACE FUNCTION public.check_submission_answer_scoring_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF (auth.get_user_role() IS NULL OR auth.get_user_role() = 'PARTICIPANT') THEN
    IF NEW.score IS DISTINCT FROM OLD.score OR
       NEW."isCorrect" IS DISTINCT FROM OLD."isCorrect" THEN
      RAISE EXCEPTION 'Participants are not permitted to alter answer score or correctness indicators.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_protect_answer_scoring ON public."SubmissionAnswer";
CREATE TRIGGER trg_protect_answer_scoring
  BEFORE UPDATE ON public."SubmissionAnswer"
  FOR EACH ROW
  EXECUTE FUNCTION public.check_submission_answer_scoring_immutable();

-- 7. Enforce Enrollment and Deadline Validity on Submission Creation
CREATE OR REPLACE FUNCTION public.validate_submission_eligibility()
RETURNS TRIGGER AS $$
DECLARE
  v_phase_deadline TIMESTAMPTZ;
  v_phase_status "PhaseStatus";
  v_participant_status "ParticipantStatus";
BEGIN
  IF (auth.get_user_role() IS NULL OR auth.get_user_role() = 'PARTICIPANT') THEN
    SELECT cp.status INTO v_participant_status
    FROM public."ContestParticipant" cp
    WHERE cp."contestId" = NEW."contestId" AND cp."userId" = NEW."userId";

    IF v_participant_status IS NULL OR v_participant_status <> 'ACTIVE' THEN
      RAISE EXCEPTION 'User is not actively enrolled in this contest.';
    END IF;

    SELECT p.status, p.deadline INTO v_phase_status, v_phase_deadline
    FROM public."Phase" p
    WHERE p.id = NEW."phaseId";

    IF v_phase_status <> 'OPEN' THEN
      RAISE EXCEPTION 'Submissions are rejected: assessment phase is not currently OPEN.';
    END IF;

    IF NOW() > v_phase_deadline THEN
      RAISE EXCEPTION 'Submissions are rejected: phase deadline has elapsed.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_validate_submission_eligibility ON public."Submission";
CREATE TRIGGER trg_validate_submission_eligibility
  BEFORE INSERT ON public."Submission"
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_submission_eligibility();

-- 8. Portable trigger attachment on auth.users (runs if auth schema exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'auth') THEN
    DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 9. Row Level Security Policies
-- -----------------------------------------------------------------------------

-- User Policies
CREATE POLICY "Users view own profile or admins/evaluators view all"
  ON "User" FOR SELECT
  TO authenticated
  USING (id = auth.uid()::text OR auth.get_user_role() IN ('ADMIN', 'EVALUATOR'));

CREATE POLICY "Users update own profile or admins update all"
  ON "User" FOR UPDATE
  TO authenticated
  USING (id = auth.uid()::text OR auth.get_user_role() = 'ADMIN');

-- Cohort Policies
CREATE POLICY "Cohorts viewable by cohort members or admins"
  ON "Cohort" FOR SELECT
  TO authenticated
  USING (
    auth.get_user_role() = 'ADMIN'
    OR id IN (SELECT "cohortId" FROM "User" WHERE id = auth.uid()::text)
  );

CREATE POLICY "Cohorts editable only by Admins"
  ON "Cohort" FOR ALL
  TO authenticated
  USING (auth.get_user_role() = 'ADMIN');

-- Contest Policies (Enrolled / Cohort Scoped)
CREATE POLICY "Contests viewable by enrolled cohort members or admins"
  ON "Contest" FOR SELECT
  TO authenticated
  USING (
    auth.get_user_role() = 'ADMIN'
    OR (
      status IN ('LIVE', 'COMPLETED')
      AND (
        cohortId IS NULL
        OR cohortId IN (SELECT "cohortId" FROM "User" WHERE id = auth.uid()::text)
        OR id IN (SELECT "contestId" FROM "ContestParticipant" WHERE "userId" = auth.uid()::text)
      )
    )
  );

CREATE POLICY "Contests editable only by Admins"
  ON "Contest" FOR ALL
  TO authenticated
  USING (auth.get_user_role() = 'ADMIN');

-- Contest Participant Policies
CREATE POLICY "Participants view own enrollment or staff views all"
  ON "ContestParticipant" FOR SELECT
  TO authenticated
  USING (userId = auth.uid()::text OR auth.get_user_role() IN ('ADMIN', 'EVALUATOR'));

CREATE POLICY "Enrollments manageable only by Admins"
  ON "ContestParticipant" FOR ALL
  TO authenticated
  USING (auth.get_user_role() = 'ADMIN');

-- Phase & Task Policies (Public/Enrolled Read, Admin Write)
CREATE POLICY "Phases viewable by authenticated users"
  ON "Phase" FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Phases editable only by Admins"
  ON "Phase" FOR ALL
  TO authenticated
  USING (auth.get_user_role() = 'ADMIN');

CREATE POLICY "Tasks viewable by authenticated users"
  ON "Task" FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Tasks editable only by Admins"
  ON "Task" FOR ALL
  TO authenticated
  USING (auth.get_user_role() = 'ADMIN');

-- Questions & MCQ Options (Public/Enrolled Read, Admin Write)
CREATE POLICY "Questions viewable by authenticated users"
  ON "Question" FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Questions editable only by Admins"
  ON "Question" FOR ALL
  TO authenticated
  USING (auth.get_user_role() = 'ADMIN');

CREATE POLICY "MCQ Options viewable by authenticated users"
  ON "McqOption" FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "MCQ Options editable only by Admins"
  ON "McqOption" FOR ALL
  TO authenticated
  USING (auth.get_user_role() = 'ADMIN');

-- CRITICAL SECURITY: Question Answer Keys (Admins/Evaluators ONLY)
CREATE POLICY "Answer keys restricted to Admins and Evaluators"
  ON "QuestionAnswerKey" FOR ALL
  TO authenticated
  USING (auth.get_user_role() IN ('ADMIN', 'EVALUATOR'));

-- Reference Material Policies
CREATE POLICY "Reference materials viewable by enrolled participants or admins"
  ON "ReferenceMaterial" FOR SELECT
  TO authenticated
  USING (
    auth.get_user_role() IN ('ADMIN', 'EVALUATOR')
    OR EXISTS (
      SELECT 1 FROM "Task" t
      JOIN "Phase" p ON p.id = t."phaseId"
      JOIN "ContestParticipant" cp ON cp."contestId" = p."contestId"
      WHERE t.id = "ReferenceMaterial"."taskId"
        AND cp."userId" = auth.uid()::text
    )
  );

CREATE POLICY "Reference materials editable only by Admins"
  ON "ReferenceMaterial" FOR ALL
  TO authenticated
  USING (auth.get_user_role() = 'ADMIN');

-- Submission Policies (Deadlock-Free Transitions)
CREATE POLICY "Participants view own submissions or staff views all"
  ON "Submission" FOR SELECT
  TO authenticated
  USING (
    userId = auth.uid()::text 
    OR auth.get_user_role() IN ('ADMIN', 'EVALUATOR')
  );

CREATE POLICY "Participants can insert draft submissions"
  ON "Submission" FOR INSERT
  TO authenticated
  WITH CHECK (
    (userId = auth.uid()::text AND status = 'DRAFT')
    OR auth.get_user_role() = 'ADMIN'
  );

CREATE POLICY "Participants can update draft submissions or submit"
  ON "Submission" FOR UPDATE
  TO authenticated
  USING (
    (userId = auth.uid()::text AND status = 'DRAFT')
    OR auth.get_user_role() = 'ADMIN'
  )
  WITH CHECK (
    (userId = auth.uid()::text AND status IN ('DRAFT', 'SUBMITTED'))
    OR auth.get_user_role() = 'ADMIN'
  );

-- Submission Answers Policies
CREATE POLICY "Participants view own answers or staff views all"
  ON "SubmissionAnswer" FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "Submission" s
      WHERE s.id = "SubmissionAnswer"."submissionId"
        AND (s.userId = auth.uid()::text OR auth.get_user_role() IN ('ADMIN', 'EVALUATOR'))
    )
  );

CREATE POLICY "Participants save own answers while draft"
  ON "SubmissionAnswer" FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "Submission" s
      WHERE s.id = "SubmissionAnswer"."submissionId"
        AND s.userId = auth.uid()::text
        AND s.status = 'DRAFT'
    )
    OR auth.get_user_role() = 'ADMIN'
  );

-- Rubric Criteria & Evaluations
CREATE POLICY "Rubrics viewable by authenticated users"
  ON "RubricCriterion" FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Rubrics editable only by Admins"
  ON "RubricCriterion" FOR ALL
  TO authenticated
  USING (auth.get_user_role() = 'ADMIN');

-- Evaluation Scores (Evaluators & Admins write; Participants view when published)
CREATE POLICY "Evaluations writable by Evaluators and Admins"
  ON "EvaluationScore" FOR ALL
  TO authenticated
  USING (auth.get_user_role() IN ('ADMIN', 'EVALUATOR'));

CREATE POLICY "Participants view evaluations only when contest is published"
  ON "EvaluationScore" FOR SELECT
  TO authenticated
  USING (
    auth.get_user_role() IN ('ADMIN', 'EVALUATOR')
    OR EXISTS (
      SELECT 1 FROM "Submission" s
      JOIN "Contest" c ON c.id = s.contestId
      WHERE s.id = "EvaluationScore".submissionId
        AND s.userId = auth.uid()::text
        AND c.isPublished = true
    )
  );

-- Cohort Results (Leaderboard)
CREATE POLICY "Results viewable when published or by Admins/Evaluators"
  ON "CohortResult" FOR SELECT
  TO authenticated
  USING (
    auth.get_user_role() IN ('ADMIN', 'EVALUATOR')
    OR EXISTS (
      SELECT 1 FROM "Contest" c
      WHERE c.id = "CohortResult".contestId
        AND c.isPublished = true
    )
  );

CREATE POLICY "Results editable only by Admins"
  ON "CohortResult" FOR ALL
  TO authenticated
  USING (auth.get_user_role() = 'ADMIN');

-- Audit Logs (Admin read-only, System/Authenticated insert)
CREATE POLICY "Audit logs viewable only by Admins"
  ON "AuditLog" FOR SELECT
  TO authenticated
  USING (auth.get_user_role() = 'ADMIN');

CREATE POLICY "Audit logs insertable by authenticated users and system"
  ON "AuditLog" FOR INSERT
  TO authenticated
  WITH CHECK (true);
