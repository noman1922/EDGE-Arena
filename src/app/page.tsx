import React from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/ui/brand-logo";

export default function RootHomePage() {
  return (
    <div className="min-h-screen bg-surface flex flex-col justify-between">
      {/* Header */}
      <header className="h-16 w-full border-b border-[#e2e8f0] bg-surface-container-lowest/90 backdrop-blur-xl px-4 sm:px-gutter flex items-center justify-between">
        <BrandLogo showSubtitle={false} />
        <div className="flex items-center gap-space-sm font-label-xs text-secondary">
          <span className="w-2 h-2 rounded-full bg-primary-container animate-pulse"></span>
          <span className="font-medium text-on-surface">Platform Status: Active</span>
        </div>
      </header>

      {/* Main Hero / Portal Gateway */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-space-xl flex flex-col items-center text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-on-tertiary-container text-primary-container font-label-xs font-semibold mb-4 border border-primary-container/20">
          <span className="material-symbols-outlined text-[16px]">verified</span>
          ACI Career EDGE Academy Diagnostic Engine
        </div>

        <h1 className="font-display-lg text-on-surface max-w-2xl">
          Enterprise Skills Verification & Leadership Assessment Platform
        </h1>
        <p className="font-body-lg text-secondary mt-3 max-w-xl">
          Rigorous benchmarking, multi-phase innovation challenges, proctored diagnostics, and standardized academic rubric evaluations.
        </p>

        {/* Screen Access Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md w-full mt-space-xl text-left">
          {/* Card 1: Participant Experience */}
          <div className="p-space-lg bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs hover:shadow-xs transition-shadow flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded bg-primary-fixed/40 text-primary-container flex items-center justify-center mb-3">
                <span className="material-symbols-outlined text-[22px]">person</span>
              </div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-label-xs font-semibold uppercase text-secondary tracking-wider">
                  Candidate Portal
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-primary-container"></span>
              </div>
              <h2 className="font-headline-sm text-on-surface font-semibold">
                Participant Workspace
              </h2>
              <p className="font-body-sm text-secondary mt-1">
                Active challenges, submission timelines, proctored assessment flow, and certified feedback records.
              </p>
            </div>

            <div className="flex flex-col gap-2 mt-6">
              <Link
                href="/dashboard"
                className="w-full inline-flex items-center justify-between px-space-md py-2.5 rounded bg-primary-container hover:bg-[#166534] text-on-primary font-label-md font-medium transition-colors shadow-2xs"
              >
                <span>Enter Candidate Dashboard</span>
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </Link>
              <Link
                href="/assessment"
                className="w-full inline-flex items-center justify-between px-space-md py-2 rounded bg-surface-container-low hover:bg-surface-container text-on-surface font-label-sm border border-[#e2e8f0] transition-colors"
              >
                <span>Live Assessment Interface (Task 2.1)</span>
                <span className="material-symbols-outlined text-[16px]">quiz</span>
              </Link>
            </div>
          </div>

          {/* Card 2: Administrator & Evaluator Suite */}
          <div className="p-space-lg bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs hover:shadow-xs transition-shadow flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded bg-secondary-fixed/40 text-secondary flex items-center justify-center mb-3">
                <span className="material-symbols-outlined text-[22px]">admin_panel_settings</span>
              </div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-label-xs font-semibold uppercase text-secondary tracking-wider">
                  Administrative Suite
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-primary-container"></span>
              </div>
              <h2 className="font-headline-sm text-on-surface font-semibold">
                Admin & Evaluation Console
              </h2>
              <p className="font-body-sm text-secondary mt-1">
                Real-time telemetry, 75-leader cohort tracking, rubric configuration, and submission inspection drawer.
              </p>
            </div>

            <div className="flex flex-col gap-2 mt-6">
              <Link
                href="/admin"
                className="w-full inline-flex items-center justify-between px-space-md py-2.5 rounded bg-surface-container-highest hover:bg-surface-variant text-on-surface font-label-md font-medium transition-colors border border-[#e2e8f0]"
              >
                <span>Open Admin Overview</span>
                <span className="material-symbols-outlined text-[18px]">dashboard</span>
              </Link>
              <Link
                href="/admin/contests"
                className="w-full inline-flex items-center justify-between px-space-md py-2 rounded bg-surface-container-low hover:bg-surface-container text-on-surface font-label-sm border border-[#e2e8f0] transition-colors"
              >
                <span>Contest Management & Telemetry</span>
                <span className="material-symbols-outlined text-[16px]">tune</span>
              </Link>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full bg-surface-container-low py-space-md border-t border-[#e2e8f0]">
        <div className="max-w-4xl mx-auto px-4 text-center font-body-sm text-secondary">
          © 2025 ACI Career EDGE Assessment Platform. High-Stakes Evaluation System.
        </div>
      </footer>
    </div>
  );
}
