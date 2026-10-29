# ACI Career EDGE Assess

Assessment and Contest Management Platform for the ACI Career EDGE Academy / Campus Leadership Programme.

## Overview

**ACI Career EDGE Assess** is an enterprise multi-role contest and evaluation platform engineered with Next.js (App Router), TypeScript, Tailwind CSS, Prisma, and PostgreSQL (Supabase).

The platform features three isolated roles:
- **Admin (`/admin`):** Contest creation, curriculum management (phases, tasks, questions, rubrics), candidate and evaluator provisioning, allocations, live proctoring telemetry, audit logging, system error diagnostics, and official result certification.
- **Evaluator (`/evaluator`):** Dedicated grading workbench for assigned candidates, standardized rubric scoring, qualitative commentary, and evaluation finalization.
- **Participant (`/dashboard`, `/assessment`):** Timed assessment reader, auto-saved drafts, multiple-choice questions, essay submissions, private PDF document uploads, and certified published leaderboards.

## Core Commands

```bash
# Start development server
npm run dev

# Run TypeScript compilation check
npx tsc --noEmit

# Run ESLint check
npm run lint

# Run automated integration and regression test suites
npm run test

# Build production bundle
npm run build

# Apply PostgreSQL database migrations
npm run prisma:migrate

# Provision initial platform administrator
npm run provision:admin
```

## Documentation

Comprehensive architecture, database schema, security policies, and workflow documentation are available in [docs/PROJECT_ARCHITECTURE_AUDIT.md](docs/PROJECT_ARCHITECTURE_AUDIT.md).
