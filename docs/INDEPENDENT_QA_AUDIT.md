# Independent QA Audit — ACI Career EDGE Assess

**Audit date:** 29 October 2026  
**Scope:** Read-only review of the current working tree  
**Recommendation:** **Do not release until the high-severity session-key and participant data-scope findings are resolved and verified.**

## Executive summary

The application is a Next.js 16 App Router / React 19 / TypeScript platform using Prisma 6 and PostgreSQL. It separates admin, evaluator, and participant workflows through server actions, signed-cookie sessions, and database-backed contest records. Static review found two high-severity security defects: a known fallback HMAC key makes session forgery possible when deployment secrets are absent, and a participant dashboard action permits selecting another participant by email. A further access-control gap exists for session revocation and the file/reference route has an edge case for unassociated reference files.

TypeScript and ESLint checks passed. Database-backed application tests, browser workflows, production build, migration status, and dependency vulnerability checks were not run. The test fixture writes/upserts records against Prisma and the configured database must be treated as production; no account credentials or safe isolated database were provided. The repository already contained extensive uncommitted changes at audit start; this report describes that state and does not attribute those changes to the audit.

## Architecture and workflow overview

- **Framework:** Next.js 16.4.1 App Router, React 19.3, TypeScript 5, Tailwind CSS 4.
- **Persistence:** Prisma 6 with PostgreSQL. Core models cover users, cohorts, contests, participants, evaluator assignments, phases, tasks, questions, submissions, answers, rubrics, scores, results, audit logs, and system-error logs (`prisma/schema.prisma`).
- **Authentication:** Password hashing and login in `src/lib/credentials.ts` and `src/app/actions/auth-actions.ts`; HMAC-signed `edge_session` cookie and role checks in `src/lib/auth.ts`; route middleware in `src/middleware.ts`.
- **Role workflows:** Admin management under `/admin`; evaluator grading under `/evaluator`; participant dashboard and assessment under `/dashboard` and `/assessment`. Mutations and most data reads are server actions in `src/app/actions/`.
- **Files:** Upload validation and storage integration in `src/app/actions/file-actions.ts`; downloads stream through `src/app/api/files/[...fileKey]/route.ts`.
- **Database policy:** `prisma/rls-policies.sql` contains RLS setup and policy SQL, but it is separate from the listed Prisma migrations. Its application to the live database was not verified.
- **Current-tree caveat:** `git status --short` showed many modified tracked files and untracked migrations, scripts, and docs. The exact deployed commit and whether these changes are intended were not established.

## Findings

### Security findings

#### High — Known default secret permits session forgery when deployment secrets are missing

- **Affected:** `src/lib/auth.ts:4-7`, `src/lib/auth.ts:46-49`, `src/lib/auth.ts:87-110`.
- **Evidence:** `SESSION_SECRET` falls back from `SESSION_SECRET` to `SUPABASE_SERVICE_ROLE_KEY` and then to the literal `aci-career-edge-assess-production-session-secret-2025-secure`. The token verifier accepts any correctly HMAC-signed, unexpired payload without querying the user record.
- **Impact:** If both environment variables are unset, an attacker who knows the published fallback can sign a session payload claiming `ADMIN`, then access actions that rely on `requireRole`. This is a conditional but release-blocking authentication bypass.
- **Reproduction:** In a local isolated environment with both variables unset, use the fallback literal to sign a non-expired payload with `role: "ADMIN"`; send it as the `edge_session` cookie and request an admin-only server action. This was not attempted against the configured application or database.
- **Remediation:** Fail application startup when a strong, dedicated session secret is absent. Do not derive session signing from a database service-role key. Rotate any deployment secret that may have used the fallback and invalidate existing sessions.

#### High — Participant dashboard accepts a caller-selected participant email

- **Affected:** `src/app/actions/assessment-actions.ts:75-100` (data returned from approximately line 376).
- **Evidence:** The action requires only the `PARTICIPANT` role, then chooses `userEmailParam || session.email` and loads that user's profile, cohort, enrollments, assessment progress, and submission data. The same file's task-loading path instead uses `session.email` directly at lines 491-496.
- **Impact:** An authenticated participant can call this exposed server action with another participant's email and receive their profile and contest/progress information. This is an insecure direct object reference and privacy breach.
- **Reproduction:** Sign in as a participant and invoke the action with a different known participant email; compare the returned `candidate` and `contests` to the target user's records. No live account was used.
- **Remediation:** Derive the participant identity only from the verified session. If staff access is required, expose a separate action restricted to the appropriate staff role and audit that access.

#### Medium — Deactivated users retain valid sessions until token expiry

- **Affected:** `src/lib/auth.ts:87-110`, `src/lib/auth.ts:141-149`, `src/lib/auth.ts:169-183`; `src/app/actions/auth-actions.ts`.
- **Evidence:** Session verification checks signature and expiry only; `requireRole` authorizes the role claim and does not reload the user or check `isActive`. Session cookies have a seven-day maximum age (`src/lib/auth.ts:208-214`). Login/account code has an `isActive` field, but that does not revoke a token already issued.
- **Impact:** An administrator disabling an account cannot immediately prevent use of an existing token; access can continue for up to the remaining token lifetime.
- **Reproduction:** Issue a session, set the corresponding user inactive, then call a role-protected action with the still-valid token. Not exercised against a running app.
- **Remediation:** Add server-side session revocation/versioning or check current account status during authorization; consider shorter sessions for privileged roles.

#### Medium — Reference-file authorization can allow an unassociated reference to any authenticated non-admin role

- **Affected:** `src/app/api/files/[...fileKey]/route.ts` (reference-material branch around lines 78-143).
- **Evidence:** Reference materials may have nullable `taskId` (`prisma/schema.prisma`, `ReferenceMaterial`). For a participant, denial is conditional on `!isEnrolled && contest?.isPublished === false`. When the reference has no task/contest, the latter expression is false, so the route proceeds to storage download. Published-contest references also bypass enrollment verification.
- **Impact:** If an unassociated reference record exists and its key is known, any authenticated participant can retrieve the file. Published references are available to any participant regardless of enrollment; confirm whether that is intended policy.
- **Reproduction:** With an isolated record, request `/api/files/<known-reference-key>` as a participant for a reference with `taskId = null`; verify whether the file is returned. Not tested against live storage.
- **Remediation:** Require an explicit authorization outcome for every role and file type. Reject references without an associated access policy; check active enrollment even for published contests unless public access is an explicit product rule.

### General quality and deployment findings

#### Medium — RLS deployment is not coupled to Prisma migrations

- **Affected:** `prisma/rls-policies.sql:1-20, 184-417`; `prisma/migrations/`.
- **Evidence:** The SQL file enables RLS and defines policies, while the migration set contains the baseline and two later schema migrations but no migration that applies this policy file. `npm run prisma:migrate` invokes `prisma migrate deploy`, which applies migrations rather than arbitrary SQL files.
- **Impact:** A fresh or migrated production database will not receive these policies through the documented migration command alone. The app's Prisma server actions still have application authorization checks, but any direct Supabase client path or database access assumptions relying on RLS may not be protected as intended.
- **Reproduction:** On a disposable database, run the documented migration command and inspect `pg_class.relrowsecurity` and `pg_policies`; do not run this against the current configured database.
- **Remediation:** Version and deploy the RLS SQL through a reviewed migration, or document and automate an explicit separate deployment step. Verify policy behavior using the actual production role/connection configuration.

#### Low — Test suite setup mutates persistent domain records

- **Affected:** `src/test/ensure-pilot-contest.ts:15-292`; many tests import this helper.
- **Evidence:** The shared fixture upserts users, contests, enrollments, evaluator assignments, phases, tasks, and questions; it changes statuses and scheduled dates as well as creating records.
- **Impact:** `npm test` is unsafe when `DATABASE_URL` points at production or a shared database. The package script does not visibly select an isolated test database.
- **Reproduction:** Static inspection of test imports and fixture writes; no test command was run.
- **Remediation:** Require an explicit test-only database URL and fail closed unless it is isolated; use disposable per-run databases or mocked repositories for unit tests.

## Test and check results

| Check | Result | Evidence / limitation |
|---|---|---|
| Repository and architecture inspection | Passed | Inspected package scripts, README, Prisma schema/migrations, server actions, auth, upload route, and project documentation. |
| TypeScript | Passed | `cmd /c npx tsc --noEmit` exited 0. |
| ESLint | Passed | `cmd /c npm run lint` exited 0. |
| Automated test suite | Blocked | Shared fixtures write to the configured Prisma database; no isolated test DB was supplied. |
| Admin/evaluator/participant browser journeys | Not tested | No authorized test credentials or safe running test environment was provided. |
| Production build | Not tested | `npm run build` runs Prisma generation and Next build, which write generated/build artifacts; it was outside the strictly read-only audit checks. |
| Dependency vulnerability scan | Not tested | No offline vulnerability database/tool result was available; network audit was not run. |
| Database migration/RLS verification | Not tested | Would require connecting to a database treated as production. |
| Upload and download integration | Not tested | Requires a safe isolated database and storage backend. |

## Coverage and maintainability observations

- Existing automated tests cover multiple workflow and authorization areas, but the test harness is coupled to mutable Prisma fixtures and is not safely runnable without a dedicated database.
- No browser-based end-to-end suite or CI configuration was identified in the inspected repository file inventory; validate whether CI is defined externally before release.
- `src/app/actions/assessment-actions.ts` and `src/app/actions/evaluator-actions.ts` contain broad workflow responsibilities. Consider splitting query/read models from mutations and extracting tested domain services after security defects are fixed.
- The schema uses separate `contestId`, `phaseId`, and `taskId` foreign keys on `Submission`; the database does not encode that these three references must belong to the same contest/phase/task chain. Application-side consistency enforcement should be reviewed and tested.
- `prisma/seed-demo.ts` and `scripts/execute-production-cleanup.ts` are operationally sensitive. The latter deletes most business records; restrict access and require explicit environment/confirmation safeguards. It was inspected only and never executed.
- The README has useful local commands and links to architecture documentation, but should document environment prerequisites, safe test database setup, and the actual RLS/migration deployment sequence.

## Prioritized remediation plan

### Release blockers

1. Remove the default signing key and fail closed on missing session secret; rotate secrets and invalidate potentially affected tokens.
2. Remove caller-controlled participant identity from participant-facing data actions; add regression coverage for cross-user access denial.
3. Verify all direct database/storage access paths and make RLS installation part of a reproducible deployment migration where applicable.

### Fix before production

1. Ensure account deactivation revokes existing sessions promptly.
2. Close the unassociated reference-file authorization path and define enrollment rules for published references.
3. Make automated tests require an isolated database and document the test setup.
4. Run browser workflows for the three roles, contest lifecycle, scoring/ties, deadlines, uploads, and error states using authorized test accounts in a dedicated environment.

### Improvements for the next release

1. Split large server-action modules into smaller domain/query/mutation units and add validation schemas at every server-action boundary.
2. Add CI checks for type checking, lint, tests against disposable PostgreSQL, and production build.
3. Add schema-level integrity constraints (or transaction-level checks) for matching submission contest/phase/task relationships.
4. Document deployment variables, migration/RLS sequence, storage setup, backup/rollback, and operational use of sensitive scripts.

## Limitations

- No app code, database records, migrations, environment variables, or deployment configuration were changed. This report is the only new file.
- The actual `.env` was not read or disclosed. Therefore the session-key finding is conditional on the deployment omitting `SESSION_SECRET`; the current deployment configuration was not verified.
- No production database, storage service, browser session, or authorized test accounts were accessed.
- No database-backed tests, destructive cleanup, seed/provision scripts, migrations, production build, or external attack simulation were run.
- The audit reflects the working tree on 29 October 2026, which was already substantially modified; findings should be rechecked against the exact release commit.

## Five most important risks

1. Missing session secret falls back to a known key, enabling forged admin sessions.
2. Participant dashboard data can be queried for another participant by email.
3. Disabled accounts can continue using an existing session until expiry.
4. Some reference file records may lack an authorization context, allowing authenticated participant access by known key.
5. RLS policy SQL is not applied by the documented Prisma migration command, so database-level safeguards may be absent unless deployed separately.

**Approval requested:** Please approve or reject a remediation pass for the findings above. No fixes were made during this discovery audit.
