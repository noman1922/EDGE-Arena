"use client";

import React, { Suspense, useState, useEffect } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/ui/brand-logo";
import { MonitoringDashboardView } from "@/components/monitoring/monitoring-dashboard-view";
import { logoutAction, getCurrentUserSession } from "@/app/actions/auth-actions";
import { LiveDateTime } from "@/components/ui/live-date-time";

export default function EvaluatorMonitoringPage() {
  const [session, setSession] = useState<{ name: string; email: string } | null>(null);

  useEffect(() => {
    getCurrentUserSession().then((s) => {
      if (s) {
        setSession({
          name: s.name || "Evaluator",
          email: s.email,
        });
      }
    });
  }, []);

  const evaluatorInitials = session?.name
    ? session.name
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "EV";

  return (
    <div className="min-h-screen bg-surface flex flex-col justify-between">
      {/* Top Header */}
      <header className="h-16 w-full border-b border-[#e2e8f0] bg-surface-container-lowest/90 backdrop-blur-xl px-4 sm:px-gutter flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-4">
          <BrandLogo showSubtitle={true} subtitleText="Evaluator Console" />
          <nav className="hidden md:flex items-center gap-1 pl-4 border-l border-[#e2e8f0]">
            <Link
              href="/evaluator"
              className="px-3 py-1.5 rounded font-label-xs font-medium bg-surface-container-low hover:bg-surface-container-high text-on-surface border border-[#e2e8f0] transition-colors"
            >
              Grading
            </Link>
            <Link
              href="/evaluator/monitoring"
              className="px-3 py-1.5 rounded font-label-xs font-semibold bg-primary-container text-on-primary shadow-xs flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">sensors</span>
              <span>Monitoring</span>
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-2.5 sm:gap-3">
          {/* Live Date and Time */}
          <LiveDateTime />

          {/* Role Badge */}
          <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded font-label-xs bg-emerald-50 text-emerald-800 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
            <span className="font-semibold">Evaluator</span>
          </span>

          {/* Profile Lockup */}
          <div className="flex items-center gap-space-sm pl-space-xs border-l border-[#e2e8f0]">
            <div className="w-8 h-8 rounded-full bg-secondary-fixed text-on-secondary-fixed flex items-center justify-center font-label-sm font-semibold shrink-0">
              {evaluatorInitials}
            </div>
            <div className="hidden lg:flex flex-col text-left">
              <span className="font-label-sm text-on-surface font-medium leading-tight">
                {session?.name || "Evaluator"}
              </span>
              <span className="font-label-xs text-secondary leading-tight truncate max-w-[150px]">
                {session?.email || "evaluator@career-edge.edu"}
              </span>
            </div>
          </div>

          <button
            onClick={async () => {
              await logoutAction();
              window.location.href = "/login";
            }}
            className="px-2.5 py-1.5 rounded bg-surface-container-low hover:bg-surface-container-high text-secondary hover:text-error font-label-xs border border-[#e2e8f0] flex items-center gap-1 transition-colors cursor-pointer"
            title="Sign Out of Evaluator Console"
          >
            <span className="material-symbols-outlined text-[16px]">logout</span>
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-space-lg flex flex-col flex-1">
        <Suspense
          fallback={
            <div className="py-12 text-center text-secondary">
              <div className="inline-flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-primary-container border-t-transparent rounded-full animate-spin"></span>
                <span>Loading assigned contest monitoring...</span>
              </div>
            </div>
          }
        >
          <MonitoringDashboardView role="EVALUATOR" />
        </Suspense>
      </main>

      {/* Footer */}
      <footer className="w-full bg-surface-container-low py-space-md border-t border-[#e2e8f0] text-center font-body-sm text-secondary">
        © 2025 ACI Career EDGE Assessment Platform. High-Stakes Proctoring Console.
      </footer>
    </div>
  );
}
