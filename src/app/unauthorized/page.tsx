"use client";

import React, { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BrandLogo } from "@/components/ui/brand-logo";
import { logoutAction } from "@/app/actions/auth-actions";

function UnauthorizedContent() {
  const searchParams = useSearchParams();
  const requiredRole = searchParams.get("required") || "Specific Authorization";
  const currentRole = searchParams.get("current") || "Your current account";

  let destination = "/dashboard";
  if (currentRole === "ADMIN") destination = "/admin";
  else if (currentRole === "EVALUATOR") destination = "/evaluator";

  return (
    <div className="min-h-screen bg-surface flex flex-col justify-between">
      {/* Top Header */}
      <header className="h-16 w-full border-b border-[#e2e8f0] bg-surface-container-lowest/90 backdrop-blur-xl px-4 sm:px-gutter flex items-center justify-between">
        <BrandLogo showSubtitle={false} />
        <span className="font-label-xs font-semibold px-2.5 py-1 rounded bg-error-container text-error flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">gpp_bad</span>
          Access Restricted
        </span>
      </header>

      {/* Main Alert Container */}
      <main className="max-w-xl mx-auto px-4 py-space-xl flex flex-col items-center text-center">
        <div className="w-16 h-16 rounded-full bg-error-container/60 border border-error/20 flex items-center justify-center text-error mb-4">
          <span className="material-symbols-outlined text-[32px]">shield_lock</span>
        </div>

        <h1 className="font-display-lg text-on-surface">Access Denied</h1>
        <p className="font-body-md text-secondary mt-2 max-w-md">
          This portal requires <strong className="text-on-surface font-semibold">{requiredRole}</strong> role privileges.
          You are currently signed in with <strong className="text-on-surface font-semibold">{currentRole}</strong> access.
        </p>

        {/* Diagnostic Metadata Box */}
        <div className="w-full bg-surface-container-lowest p-4 rounded-lg border border-[#e2e8f0] shadow-2xs my-6 text-left text-body-sm flex flex-col gap-1.5 font-label-xs text-secondary">
          <div className="flex justify-between">
            <span>Enforced Boundary:</span>
            <span className="font-semibold text-on-surface">Server-Side Middleware Gate</span>
          </div>
          <div className="flex justify-between">
            <span>Required Clearance:</span>
            <span className="font-semibold text-error">{requiredRole}</span>
          </div>
          <div className="flex justify-between">
            <span>Verified Database Role:</span>
            <span className="font-semibold text-primary-container">{currentRole}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full">
          <Link
            href={destination}
            className="w-full sm:flex-1 py-2.5 px-4 rounded bg-primary-container hover:bg-[#166534] text-on-primary font-label-md font-medium text-center transition-colors shadow-2xs flex items-center justify-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            <span>Return to {currentRole} Panel</span>
          </Link>
          <button
            onClick={async () => {
              await logoutAction();
              window.location.href = "/login";
            }}
            className="w-full sm:flex-1 py-2.5 px-4 rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-center transition-colors border border-[#e2e8f0]"
          >
            Switch Account
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full bg-surface-container-low py-space-md border-t border-[#e2e8f0] text-center font-body-sm text-secondary">
        © 2025 ACI Career EDGE Assessment Platform. High-Stakes Security Protocol.
      </footer>
    </div>
  );
}

export default function UnauthorizedPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-secondary">Validating authorization...</div>}>
      <UnauthorizedContent />
    </Suspense>
  );
}
