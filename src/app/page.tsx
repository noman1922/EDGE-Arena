import React from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/ui/brand-logo";

export default function RootHomePage() {
  return (
    <div className="min-h-screen bg-surface flex flex-col justify-between">
      {/* Header */}
      <header className="h-16 w-full border-b border-[#e2e8f0] bg-surface-container-lowest/90 backdrop-blur-xl px-4 sm:px-gutter flex items-center justify-between">
        <BrandLogo showSubtitle={false} />
        <Link
          href="/login"
          className="px-3.5 py-1.5 rounded bg-primary-container hover:bg-[#166534] text-on-primary font-label-sm font-medium transition-colors shadow-2xs"
        >
          Sign In
        </Link>
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
          Role-isolated benchmarking, multi-phase innovation challenges, proctored diagnostics, and standardized academic rubric evaluations.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row items-center gap-4">
          <Link
            href="/login"
            className="px-6 py-3 rounded-lg bg-primary-container hover:bg-[#166534] text-on-primary font-label-md font-semibold transition-colors shadow-xs flex items-center gap-2"
          >
            <span>Proceed to Sign In</span>
            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
          </Link>
        </div>

        {/* Role Separation Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md w-full mt-space-xl text-left">
          {/* Admin Panel Card */}
          <div className="p- space-lg p-5 bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs flex flex-col justify-between">
            <div>
              <div className="w-9 h-9 rounded bg-secondary-fixed/40 text-secondary flex items-center justify-center mb-3">
                <span className="material-symbols-outlined text-[20px]">admin_panel_settings</span>
              </div>
              <h2 className="font-label-md text-on-surface font-semibold">
                Administrator Panel
              </h2>
              <p className="font-body-xs text-secondary mt-1">
                Contest creation, participant enrollment, evaluator assignment, and official result certification.
              </p>
            </div>
            <span className="mt-4 font-mono font-bold text-xs text-secondary">Route: /admin</span>
          </div>

          {/* Evaluator Panel Card */}
          <div className="p- space-lg p-5 bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs flex flex-col justify-between">
            <div>
              <div className="w-9 h-9 rounded bg-primary-fixed/40 text-primary-container flex items-center justify-center mb-3">
                <span className="material-symbols-outlined text-[20px]">rate_review</span>
              </div>
              <h2 className="font-label-md text-on-surface font-semibold">
                Evaluator Console
              </h2>
              <p className="font-body-xs text-secondary mt-1">
                Assigned submissions, standardized rubric scoring matrix, qualitative commentary, and evaluation tracking.
              </p>
            </div>
            <span className="mt-4 font-mono font-bold text-xs text-primary-container">Route: /evaluator</span>
          </div>

          {/* Participant Panel Card */}
          <div className="p- space-lg p-5 bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs flex flex-col justify-between">
            <div>
              <div className="w-9 h-9 rounded bg-tertiary-fixed/40 text-on-tertiary-fixed flex items-center justify-center mb-3">
                <span className="material-symbols-outlined text-[20px]">person</span>
              </div>
              <h2 className="font-label-md text-on-surface font-semibold">
                Participant Workspace
              </h2>
              <p className="font-body-xs text-secondary mt-1">
                Enrolled benchmark challenges, live timed assessments, draft auto-saving, and certified scorecards.
              </p>
            </div>
            <span className="mt-4 font-mono font-bold text-xs text-tertiary">Route: /dashboard</span>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full bg-surface-container-low py-space-md border-t border-[#e2e8f0]">
        <div className="max-w-4xl mx-auto px-4 text-center font-body-sm text-secondary">
          © 2026 ACI Career EDGE Assess. Enterprise Assessment Platform.
        </div>
      </footer>
    </div>
  );
}
