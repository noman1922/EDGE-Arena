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
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS public."UserRole" AS $$
  SELECT role FROM public."User" WHERE id = (SELECT auth.uid())::text LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '';

REVOKE EXECUTE ON FUNCTION public.get_user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated, service_role;

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 4. Prevent User Role Self-Escalation
CREATE OR REPLACE FUNCTION public.prevent_user_role_escalation()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role <> OLD.role AND (public.get_user_role() IS NULL OR public.get_user_role() <> 'ADMIN') THEN
    RAISE EXCEPTION 'Unauthorized: only platform administrators can modify user roles.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON public."User";
CREATE TRIGGER trg_prevent_role_escalation
  BEFORE UPDATE ON public."User"
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_user_role_escalation();

-- 5. Prevent Participant Score Forgery on Submission
CREATE OR REPLACE FUNCTION public.check_submission_scoring_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF (public.get_user_role() IS NULL OR public.get_user_role() = 'PARTICIPANT') THEN
    IF NEW."autoGradeScore" IS DISTINCT FROM OLD."autoGradeScore" OR
       NEW."manualGradeScore" IS DISTINCT FROM OLD."manualGradeScore" OR
       NEW."finalScore" IS DISTINCT FROM OLD."finalScore" OR
       NEW."isLate" IS DISTINCT FROM OLD."isLate" THEN
      RAISE EXCEPTION 'Participants are not permitted to alter score or late-status metadata.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS trg_protect_submission_scoring ON public."Submission";
CREATE TRIGGER trg_protect_submission_scoring
  BEFORE UPDATE ON public."Submission"
  FOR EACH ROW
  EXECUTE FUNCTION public.check_submission_scoring_immutable();

-- 6. Prevent Participant Score Forgery on SubmissionAnswer
CREATE OR REPLACE FUNCTION public.check_submission_answer_scoring_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF (public.get_user_role() IS NULL OR public.get_user_role() = 'PARTICIPANT') THEN
    IF NEW.score IS DISTINCT FROM OLD.score OR
       NEW."isCorrect" IS DISTINCT FROM OLD."isCorrect" THEN
      RAISE EXCEPTION 'Participants are not permitted to alter answer score or correctness indicators.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

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
  v_phase_status public."PhaseStatus";
  v_participant_status public."ParticipantStatus";
BEGIN
  IF (public.get_user_role() IS NULL OR public.get_user_role() = 'PARTICIPANT') THEN
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS trg_validate_submission_eligibility ON public."Submission";
CREATE TRIGGER trg_validate_submission_eligibility
  BEFORE INSERT ON public."Submission"
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_submission_eligibility();

-- 8. Supabase Auth Integration Note:
-- The function public.handle_new_user() is defined above with SECURITY DEFINER.
-- In Supabase, creating triggers directly on auth.users requires elevated privileges
-- and should be run in Supabase SQL Editor if desired:
--   CREATE TRIGGER on_auth_user_created
--     AFTER INSERT ON auth.users
--     FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
-- The application also provides server-side user synchronization upon authentication.

-- -----------------------------------------------------------------------------
-- 9. Row Level Security Policies
-- -----------------------------------------------------------------------------

-- User Policies
CREATE POLICY "Users view own profile or admins/evaluators view all"
  ON "User" FOR SELECT
  TO authenticated
  USING (id = (SELECT auth.uid())::text OR public.get_user_role() IN ('ADMIN', 'EVALUATOR'));

CREATE POLICY "Users update own profile or admins update all"
  ON "User" FOR UPDATE
  TO authenticated
  USING (id = (SELECT auth.uid())::text OR public.get_user_role() = 'ADMIN');

-- Cohort Policies
CREATE POLICY "Cohorts viewable by cohort members or admins"
  ON "Cohort" FOR SELECT
  TO authenticated
  USING (
    public.get_user_role() = 'ADMIN'
    OR id IN (SELECT "cohortId" FROM "User" WHERE id = (SELECT auth.uid())::text)
  );

CREATE POLICY "Cohorts editable only by Admins"
  ON "Cohort" FOR ALL
  TO authenticated
  USING (public.get_user_role() = 'ADMIN');

-- Contest Policies (Enrolled / Cohort Scoped)
CREATE POLICY "Contests viewable by enrolled cohort members or admins"
  ON "Contest" FOR SELECT
  TO authenticated
  USING (
    public.get_user_role() = 'ADMIN'
    OR (
      status IN ('LIVE', 'COMPLETED')
      AND (
        "cohortId" IS NULL
        OR "cohortId" IN (SELECT "cohortId" FROM "User" WHERE id = (SELECT auth.uid())::text)
        OR id IN (SELECT "contestId" FROM "ContestParticipant" WHERE "userId" = (SELECT auth.uid())::text)
      )
    )
  );

CREATE POLICY "Contests editable only by Admins"
  ON "Contest" FOR ALL
  TO authenticated
  USING (public.get_user_role() = 'ADMIN');

-- Contest Participant Policies
CREATE POLICY "Participants view own enrollment or staff views all"
  ON "ContestParticipant" FOR SELECT
  TO authenticated
  USING ("userId" = (SELECT auth.uid())::text OR public.get_user_role() IN ('ADMIN', 'EVALUATOR'));

CREATE POLICY "Enrollments manageable only by Admins"
  ON "ContestParticipant" FOR ALL
  TO authenticated
  USING (public.get_user_role() = 'ADMIN');

-- Phase & Task Policies (Public/Enrolled Read, Admin Write)
CREATE POLICY "Phases viewable by authenticated users"
  ON "Phase" FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Phases editable only by Admins"
  ON "Phase" FOR ALL
  TO authenticated
  USING (public.get_user_role() = 'ADMIN');

CREATE POLICY "Tasks viewable by authenticated users"
  ON "Task" FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Tasks editable only by Admins"
  ON "Task" FOR ALL
  TO authenticated
  USING (public.get_user_role() = 'ADMIN');

-- Questions & MCQ Options (Public/Enrolled Read, Admin Write)
CREATE POLICY "Questions viewable by authenticated users"
  ON "Question" FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Questions editable only by Admins"
  ON "Question" FOR ALL
  TO authenticated
  USING (public.get_user_role() = 'ADMIN');

CREATE POLICY "MCQ Options viewable by authenticated users"
  ON "McqOption" FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "MCQ Options editable only by Admins"
  ON "McqOption" FOR ALL
  TO authenticated
  USING (public.get_user_role() = 'ADMIN');

-- CRITICAL SECURITY: Question Answer Keys (Admins/Evaluators ONLY)
CREATE POLICY "Answer keys restricted to Admins and Evaluators"
  ON "QuestionAnswerKey" FOR ALL
  TO authenticated
  USING (public.get_user_role() IN ('ADMIN', 'EVALUATOR'));

-- Reference Material Policies
CREATE POLICY "Reference materials viewable by enrolled participants or admins"
  ON "ReferenceMaterial" FOR SELECT
  TO authenticated
  USING (
    public.get_user_role() IN ('ADMIN', 'EVALUATOR')
    OR EXISTS (
      SELECT 1 FROM "Task" t
      JOIN "Phase" p ON p.id = t."phaseId"
      JOIN "ContestParticipant" cp ON cp."contestId" = p."contestId"
      WHERE t.id = "ReferenceMaterial"."taskId"
        AND cp."userId" = (SELECT auth.uid())::text
    )
  );

CREATE POLICY "Reference materials editable only by Admins"
  ON "ReferenceMaterial" FOR ALL
  TO authenticated
  USING (public.get_user_role() = 'ADMIN');

-- Submission Policies (Deadlock-Free Transitions)
CREATE POLICY "Participants view own submissions or staff views all"
  ON "Submission" FOR SELECT
  TO authenticated
  USING (
    "userId" = (SELECT auth.uid())::text 
    OR public.get_user_role() IN ('ADMIN', 'EVALUATOR')
  );

CREATE POLICY "Participants can insert draft submissions"
  ON "Submission" FOR INSERT
  TO authenticated
  WITH CHECK (
    ("userId" = (SELECT auth.uid())::text AND status = 'DRAFT')
    OR public.get_user_role() = 'ADMIN'
  );

CREATE POLICY "Participants can update draft submissions or submit"
  ON "Submission" FOR UPDATE
  TO authenticated
  USING (
    ("userId" = (SELECT auth.uid())::text AND status = 'DRAFT')
    OR public.get_user_role() = 'ADMIN'
  )
  WITH CHECK (
    ("userId" = (SELECT auth.uid())::text AND status IN ('DRAFT', 'SUBMITTED'))
    OR public.get_user_role() = 'ADMIN'
  );

-- Submission Answers Policies
CREATE POLICY "Participants view own answers or staff views all"
  ON "SubmissionAnswer" FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "Submission" s
      WHERE s.id = "SubmissionAnswer"."submissionId"
        AND (s."userId" = (SELECT auth.uid())::text OR public.get_user_role() IN ('ADMIN', 'EVALUATOR'))
    )
  );

CREATE POLICY "Participants save own answers while draft"
  ON "SubmissionAnswer" FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "Submission" s
      WHERE s.id = "SubmissionAnswer"."submissionId"
        AND s."userId" = (SELECT auth.uid())::text
        AND s.status = 'DRAFT'
    )
    OR public.get_user_role() = 'ADMIN'
  );

-- Rubric Criteria & Evaluations
CREATE POLICY "Rubrics viewable by authenticated users"
  ON "RubricCriterion" FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Rubrics editable only by Admins"
  ON "RubricCriterion" FOR ALL
  TO authenticated
  USING (public.get_user_role() = 'ADMIN');

-- Evaluation Scores (Evaluators & Admins write; Participants view when published)
CREATE POLICY "Evaluations writable by Evaluators and Admins"
  ON "EvaluationScore" FOR ALL
  TO authenticated
  USING (public.get_user_role() IN ('ADMIN', 'EVALUATOR'));

CREATE POLICY "Participants view evaluations only when contest is published"
  ON "EvaluationScore" FOR SELECT
  TO authenticated
  USING (
    public.get_user_role() IN ('ADMIN', 'EVALUATOR')
    OR EXISTS (
      SELECT 1 FROM "Submission" s
      JOIN "Contest" c ON c.id = s."contestId"
      WHERE s.id = "EvaluationScore"."submissionId"
        AND s."userId" = (SELECT auth.uid())::text
        AND c."isPublished" = true
    )
  );

-- Cohort Results (Leaderboard)
CREATE POLICY "Results viewable when published or by Admins/Evaluators"
  ON "CohortResult" FOR SELECT
  TO authenticated
  USING (
    public.get_user_role() IN ('ADMIN', 'EVALUATOR')
    OR EXISTS (
      SELECT 1 FROM "Contest" c
      WHERE c.id = "CohortResult"."contestId"
        AND c."isPublished" = true
    )
  );

CREATE POLICY "Results editable only by Admins"
  ON "CohortResult" FOR ALL
  TO authenticated
  USING (public.get_user_role() = 'ADMIN');

-- Audit Logs (Admin read-only, System/Authenticated insert)
CREATE POLICY "Audit logs viewable only by Admins"
  ON "AuditLog" FOR SELECT
  TO authenticated
  USING (public.get_user_role() = 'ADMIN');

CREATE POLICY "Audit logs insertable by authenticated users and system"
  ON "AuditLog" FOR INSERT
  TO authenticated
  WITH CHECK (true);