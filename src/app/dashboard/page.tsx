"use client";

import React from "react";
import Link from "next/link";
import { ParticipantHeader } from "@/components/layout/participant-header";
import { ParticipantFooter } from "@/components/layout/participant-footer";

export default function ParticipantDashboardPage() {
  return (
    <div className="min-h-screen bg-surface flex flex-col justify-between">
      <ParticipantHeader />

      <main className="w-full pt-16 bg-surface min-h-[calc(100vh-80px)]">
        <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 py-space-lg sm:py-space-xl flex flex-col gap-space-xl">
          {/* Welcome Header Section */}
          <header className="flex flex-col md:flex-row md:items-end justify-between gap-space-md bg-surface-container-lowest p-space-lg sm:p-space-xl rounded-lg border border-[#e2e8f0] shadow-2xs relative overflow-hidden">
            <div className="flex flex-col gap-space-xs z-10">
              <div className="inline-flex items-center gap-space-xs font-label-xs uppercase tracking-wider text-secondary">
                <span>Candidate ID: ACI-8942-EL</span>
                <span>·</span>
                <span>Cohort Delta</span>
              </div>
              <h1 className="font-display-lg text-on-surface tracking-tight">
                Welcome back, Eleanor
              </h1>
              <p className="font-body-md text-secondary">
                ACI Career EDGE Academy · Campus Leadership Programme 2025
              </p>
            </div>

            <div className="z-10 flex items-center gap-space-sm bg-surface-container-low px-space-md py-space-sm rounded border border-[#e2e8f0] self-start md:self-auto">
              <span className="w-2 h-2 rounded-full bg-primary-container animate-pulse"></span>
              <div className="flex flex-col">
                <span className="font-label-xs text-on-surface-variant font-semibold">
                  Stage 2 Evaluation in Progress
                </span>
                <span className="font-label-xs text-secondary">
                  Top 75 Campus Leaders Cohort
                </span>
              </div>
            </div>
          </header>

          {/* Main Content Area: Assigned Contests */}
          <section className="flex flex-col gap-space-lg">
            <div className="flex items-center justify-between pb-space-xs">
              <div className="flex items-baseline gap-space-sm">
                <h2 className="font-headline-lg text-on-surface tracking-tight">
                  Assigned Contests
                </h2>
                <span className="font-label-sm text-secondary bg-surface-container-high px-space-sm py-0.5 rounded-full border border-[#e2e8f0]">
                  2 Active
                </span>
              </div>
              <span className="font-label-sm text-secondary hidden sm:inline-block">
                Timezone: UTC+08:00 (Singapore / Standard)
              </span>
            </div>

            {/* Contest Cards Stack */}
            <div className="flex flex-col gap-space-lg">
              {/* Card 1: Primary Active */}
              <article className="bg-surface-container-lowest rounded-lg p-space-lg sm:p-space-xl border border-[#e2e8f0] shadow-2xs flex flex-col gap-space-lg hover:shadow-xs transition-shadow relative overflow-hidden">
                <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-primary-container"></div>
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-space-md pl-1">
                  <div className="flex flex-col gap-space-xs max-w-2xl">
                    <div className="flex flex-wrap items-center gap-space-sm">
                      <span className="bg-tertiary-fixed text-on-tertiary-fixed font-label-xs px-2.5 py-0.5 rounded-full font-semibold">
                        Stage 2 · Mandatory Evaluation
                      </span>
                      <span className="font-label-xs text-secondary flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">
                          lock_clock
                        </span>
                        Proctored Session
                      </span>
                    </div>
                    <h3 className="font-headline-lg text-on-surface tracking-tight pt-1">
                      National Campus Innovation Challenge 2025
                    </h3>
                    <p className="font-body-md text-secondary">
                      Task 2.1: Campus ESG Transformation Strategy & Execution Blueprint
                    </p>
                  </div>

                  {/* Deadline Callout Box */}
                  <div className="bg-surface-container-low px-space-md py-space-sm rounded border border-[#e2e8f0] flex items-center gap-space-sm shrink-0 self-start">
                    <span className="material-symbols-outlined text-primary-container text-[20px]">
                      calendar_clock
                    </span>
                    <div className="flex flex-col">
                      <span className="font-label-xs text-secondary font-medium uppercase tracking-wider">
                        Submission Due
                      </span>
                      <span className="font-label-sm text-on-surface font-semibold">
                        Fri, Feb 28 · 11:59 PM
                      </span>
                      <span className="font-label-xs text-primary-container font-semibold">
                        4 days remaining
                      </span>
                    </div>
                  </div>
                </div>

                {/* Progress Track */}
                <div className="flex flex-col gap-space-xs bg-surface-container-low p-space-md rounded border border-[#e2e8f0] ml-1">
                  <div className="flex items-center justify-between font-label-sm">
                    <span className="text-on-surface font-medium flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-primary-container text-[16px]">
                        edit_note
                      </span>
                      Question 2 of 4 In Progress
                    </span>
                    <span className="text-secondary font-medium tabular-nums">50% Completed</span>
                  </div>
                  <div className="w-full bg-surface-variant h-1.5 rounded-full overflow-hidden">
                    <div className="bg-primary-container h-full rounded-full transition-all duration-500 w-1/2"></div>
                  </div>
                  <div className="flex items-center justify-between text-secondary font-label-xs pt-0.5">
                    <span>Section A: Diagnostic Quantitative Model (Saved)</span>
                    <span>Est. time to finish: 45 mins</span>
                  </div>
                </div>

                {/* Actions Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-md pt-space-xs ml-1">
                  <button
                    onClick={() => alert("Guidelines and PDF case brief viewer ready.")}
                    className="inline-flex items-center gap-space-xs font-label-md text-secondary hover:text-on-surface transition-colors text-left"
                  >
                    <span className="material-symbols-outlined text-[18px]">article</span>
                    <span>View Challenge Guidelines & Case Brief</span>
                  </button>
                  <Link
                    href="/assessment"
                    className="inline-flex items-center justify-center gap-space-sm px-space-lg py-2.5 rounded bg-primary-container hover:bg-[#166534] text-on-primary font-label-md transition-colors shadow-2xs text-center font-medium active:scale-[0.98]"
                  >
                    <span>Continue Assessment</span>
                    <span className="material-symbols-outlined text-[18px]">
                      arrow_forward
                    </span>
                  </Link>
                </div>
              </article>

              {/* Card 2: Upcoming / Collaborative */}
              <article className="bg-surface-container-lowest rounded-lg p-space-lg sm:p-space-xl border border-[#e2e8f0] shadow-2xs flex flex-col gap-space-lg hover:shadow-xs transition-shadow">
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-space-md">
                  <div className="flex flex-col gap-space-xs max-w-2xl">
                    <div className="flex flex-wrap items-center gap-space-sm">
                      <span className="bg-surface-container-high text-secondary font-label-xs px-2.5 py-0.5 rounded-full font-medium border border-[#e2e8f0]">
                        Stage 1 · Collaborative
                      </span>
                      <span className="font-label-xs text-secondary flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">groups</span>
                        Team Capstone (4 Members)
                      </span>
                    </div>
                    <h3 className="font-headline-lg text-on-surface tracking-tight pt-1">
                      Sustainable Enterprise Ideation Hackathon
                    </h3>
                    <p className="font-body-md text-secondary">
                      Task 1: Team Formation, Stakeholder Mapping & Problem Statement
                    </p>
                  </div>

                  <div className="bg-surface-container-low px-space-md py-space-sm rounded border border-[#e2e8f0] flex items-center gap-space-sm shrink-0 self-start">
                    <span className="material-symbols-outlined text-secondary text-[20px]">
                      event_upcoming
                    </span>
                    <div className="flex flex-col">
                      <span className="font-label-xs text-secondary font-medium uppercase tracking-wider">
                        Schedule
                      </span>
                      <span className="font-label-sm text-on-surface font-semibold">
                        Opens March 10, 2025
                      </span>
                      <span className="font-label-xs text-secondary">Access locks until start</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-space-sm text-secondary font-label-sm bg-surface-container-low/60 px-space-md py-space-sm rounded border border-[#e2e8f0]">
                  <span className="w-2 h-2 rounded-full bg-secondary"></span>
                  <span>Status: Not Started · Roster confirmations pending administrative sign-off</span>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-md pt-space-xs">
                  <button
                    onClick={() => alert("Team Member Management roster dialog.")}
                    className="inline-flex items-center gap-space-xs font-label-md text-secondary hover:text-on-surface transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">group_add</span>
                    <span>Manage Team Members (3/4 Assigned)</span>
                  </button>
                  <button
                    onClick={() => alert("Reference materials preparation package.")}
                    className="inline-flex items-center justify-center gap-space-xs px-space-lg py-2 rounded bg-surface-container-high hover:bg-surface-variant text-on-surface font-label-md transition-colors text-center border border-[#e2e8f0]"
                  >
                    <span>Prepare Materials</span>
                    <span className="material-symbols-outlined text-[18px]">description</span>
                  </button>
                </div>
              </article>
            </div>
          </section>

          {/* Completed Evaluations Section */}
          <section className="flex flex-col gap-space-md pt-space-md">
            <div className="flex items-center justify-between">
              <h2 className="font-headline-sm text-on-surface tracking-tight">
                Completed Evaluations
              </h2>
              <span className="font-label-xs text-secondary">1 Archive Record</span>
            </div>

            <div className="bg-surface-container-lowest rounded-lg p-space-lg border border-[#e2e8f0] shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-space-md">
              <div className="flex items-start gap-space-md">
                <div className="w-10 h-10 rounded bg-surface-container-low border border-[#e2e8f0] flex items-center justify-center shrink-0 text-primary-container">
                  <span className="material-symbols-outlined text-[24px]">verified</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-space-sm">
                    <span className="font-label-xs font-semibold px-2 py-0.5 rounded-full bg-on-tertiary-container text-primary-container">
                      Final Passed
                    </span>
                    <span className="font-label-xs text-secondary">Jan 10, 2025</span>
                  </div>
                  <span className="font-label-md text-on-surface font-semibold">
                    Q1 Ethical Leadership Case Study
                  </span>
                  <span className="font-body-sm text-secondary">
                    Final Score: <strong className="text-on-surface font-semibold tabular-nums">92/100</strong> (Top 5th Percentile)
                  </span>
                </div>
              </div>

              <button
                onClick={() => alert("Viewing verified evaluation score sheet and rubric feedback.")}
                className="inline-flex items-center gap-space-xs px-space-md py-2 rounded bg-surface-container-low hover:bg-surface-container text-on-surface font-label-sm transition-colors border border-[#e2e8f0] self-start md:self-center shrink-0"
              >
                <span>View Evaluation & Feedback</span>
                <span className="material-symbols-outlined text-[16px]">visibility</span>
              </button>
            </div>
          </section>

          {/* Help & Support Callout */}
          <aside className="bg-surface-container-low p-space-lg rounded-lg border border-[#e2e8f0] flex flex-col sm:flex-row sm:items-center justify-between gap-space-md font-body-sm text-secondary">
            <div className="flex items-center gap-space-sm">
              <span className="material-symbols-outlined text-secondary text-[20px]">
                help_outline
              </span>
              <span>
                Need assistance with assessment access? Contact Academy Support or review the Student Code of Conduct.
              </span>
            </div>
            <div className="flex items-center gap-space-xs font-label-xs text-secondary shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-container"></span>
              <span className="font-medium">System Status: Fully Operational</span>
            </div>
          </aside>
        </div>
      </main>

      <ParticipantFooter />
    </div>
  );
}
