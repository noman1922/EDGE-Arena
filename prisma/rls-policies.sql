-- =============================================================================
-- ACI Career EDGE Assess — Supabase Row Level Security (RLS) Policies
-- =============================================================================
-- Execute this script in your Supabase SQL Editor to enforce database-level
-- multi-tenant isolation, role authorization, and score protection.

-- 1. Enable RLS on all tables
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

-- Helper function to extract user role from JWT claims or User table
CREATE OR REPLACE FUNCTION auth.get_user_role()
RETURNS "UserRole" AS $$
  SELECT role FROM "User" WHERE id = auth.uid()::text LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- Contests, Phases & Questions (Public/Enrolled Read, Admin Write)
-- -----------------------------------------------------------------------------
CREATE POLICY "Contests viewable by authenticated users"
  ON "Contest" FOR SELECT
  TO authenticated
  USING (status IN ('LIVE', 'COMPLETED') OR auth.get_user_role() = 'ADMIN');

CREATE POLICY "Contests editable only by Admins"
  ON "Contest" FOR ALL
  TO authenticated
  USING (auth.get_user_role() = 'ADMIN');

CREATE POLICY "Phases viewable by authenticated users"
  ON "Phase" FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Questions viewable by authenticated users"
  ON "Question" FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "MCQ Options viewable by authenticated users"
  ON "McqOption" FOR SELECT
  TO authenticated
  USING (true);

-- -----------------------------------------------------------------------------
-- CRITICAL SECURITY: Question Answer Keys (Admins/Evaluators ONLY)
-- Participants must NEVER be able to read correct answer keys!
-- -----------------------------------------------------------------------------
CREATE POLICY "Answer keys restricted to Admins and Evaluators"
  ON "QuestionAnswerKey" FOR ALL
  TO authenticated
  USING (auth.get_user_role() IN ('ADMIN', 'EVALUATOR'));

-- -----------------------------------------------------------------------------
-- Submissions & Answers
-- Participants can only read/edit their OWN submissions
-- Evaluators & Admins can read all submissions for grading
-- -----------------------------------------------------------------------------
CREATE POLICY "Participants can view their own submissions"
  ON "Submission" FOR SELECT
  TO authenticated
  USING (
    userId = auth.uid()::text 
    OR auth.get_user_role() IN ('ADMIN', 'EVALUATOR')
  );

CREATE POLICY "Participants can insert/update their own submissions"
  ON "Submission" FOR ALL
  TO authenticated
  USING (
    (userId = auth.uid()::text AND status = 'DRAFT')
    OR auth.get_user_role() = 'ADMIN'
  );

CREATE POLICY "Participants can view their own answers"
  ON "SubmissionAnswer" FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "Submission" s
      WHERE s.id = "SubmissionAnswer".submissionId
        AND (s.userId = auth.uid()::text OR auth.get_user_role() IN ('ADMIN', 'EVALUATOR'))
    )
  );

CREATE POLICY "Participants can save their own answers"
  ON "SubmissionAnswer" FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "Submission" s
      WHERE s.id = "SubmissionAnswer".submissionId
        AND s.userId = auth.uid()::text
        AND s.status = 'DRAFT'
    )
    OR auth.get_user_role() = 'ADMIN'
  );

-- -----------------------------------------------------------------------------
-- Evaluation Scores & Rubrics
-- Evaluators & Admins write evaluations; Participants can only view when published
-- -----------------------------------------------------------------------------
CREATE POLICY "Rubrics viewable by authenticated users"
  ON "RubricCriterion" FOR SELECT
  TO authenticated
  USING (true);

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

-- -----------------------------------------------------------------------------
-- Cohort Results (Leaderboard)
-- Participants can only view results after admin marks isPublished = true
-- -----------------------------------------------------------------------------
CREATE POLICY "Results viewable when published or by Admins"
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

-- -----------------------------------------------------------------------------
-- Audit Logs (Admin read-only, System insert)
-- -----------------------------------------------------------------------------
CREATE POLICY "Audit logs viewable only by Admins"
  ON "AuditLog" FOR SELECT
  TO authenticated
  USING (auth.get_user_role() = 'ADMIN');
