"use client";

import React, { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { BrandLogo } from "@/components/ui/brand-logo";
import { loginAction } from "@/app/actions/auth-actions";

function LoginContent() {
  const searchParams = useSearchParams();
  const redirectTarget = searchParams.get("redirect") || "";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLogin = async (targetEmail: string) => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      const res = await loginAction(targetEmail, password);

      if (res.success && res.redirectTo) {
        // If a redirect parameter was provided and matches permissions, or use canonical role destination
        window.location.href = redirectTarget || res.redirectTo;
      } else {
        setErrorMessage(res.error || "Authentication failed.");
      }
    } catch (err) {
      console.error(err);
      setErrorMessage("An unexpected network error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    handleLogin(email.trim());
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col justify-between">
      {/* Header */}
      <header className="h-16 w-full border-b border-[#e2e8f0] bg-surface-container-lowest/90 backdrop-blur-xl px-4 sm:px-gutter flex items-center justify-between">
        <BrandLogo showSubtitle={false} />
        <div className="flex items-center gap-2 font-label-xs text-secondary">
          <span className="w-2 h-2 rounded-full bg-primary-container animate-pulse"></span>
          <span className="font-semibold text-on-surface">Enterprise Auth Gateway</span>
        </div>
      </header>

      {/* Main Authentication Card */}
      <main className="max-w-md w-full mx-auto px-4 py-space-xl flex flex-col items-center">
        <div className="w-full bg-surface-container-lowest p-6 sm:p-8 rounded-lg border border-[#e2e8f0] shadow-2xs flex flex-col gap-6">
          <div className="text-center">
            <div className="w-12 h-12 rounded-full bg-primary-fixed/40 text-primary-container flex items-center justify-center mx-auto mb-3">
              <span className="material-symbols-outlined text-[24px]">verified_user</span>
            </div>
            <h1 className="font-headline-lg text-on-surface font-semibold tracking-tight">
              Sign In to EDGE-Arena
            </h1>
            <p className="font-body-sm text-secondary mt-1">
              Select your verified role profile or enter your enrolled institution email.
            </p>
          </div>

          {errorMessage && (
            <div className="p-3 rounded bg-error-container/60 border border-error/20 text-error font-label-xs flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">error</span>
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Quick Demo Role Cards */}
          <div className="flex flex-col gap-2.5">
            <span className="font-label-xs uppercase tracking-wider text-secondary font-semibold">
              Quick Demo Access
            </span>

            {/* Admin Profile */}
            <button
              type="button"
              disabled={isLoading}
              onClick={() => {
                setEmail("admin.demo@example.com");
                handleLogin("admin.demo@example.com");
              }}
              className="p-3 rounded-lg border border-[#e2e8f0] bg-surface-container-low hover:bg-surface-container-high text-left transition-colors flex items-center justify-between group cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded bg-secondary-fixed/50 text-secondary flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[18px]">admin_panel_settings</span>
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="font-label-sm font-semibold text-on-surface truncate">
                    Platform Administrator
                  </span>
                  <span className="font-label-xs text-secondary truncate">
                    admin.demo@example.com → /admin
                  </span>
                </div>
              </div>
              <span className="material-symbols-outlined text-[16px] text-secondary group-hover:text-primary-container group-hover:translate-x-0.5 transition-transform">
                arrow_forward
              </span>
            </button>

            {/* Evaluator Profile */}
            <button
              type="button"
              disabled={isLoading}
              onClick={() => {
                setEmail("evaluator.demo@example.com");
                handleLogin("evaluator.demo@example.com");
              }}
              className="p-3 rounded-lg border border-[#e2e8f0] bg-surface-container-low hover:bg-surface-container-high text-left transition-colors flex items-center justify-between group cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded bg-primary-fixed/50 text-primary-container flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[18px]">rate_review</span>
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="font-label-sm font-semibold text-on-surface truncate">
                    Academic Evaluator
                  </span>
                  <span className="font-label-xs text-secondary truncate">
                    evaluator.demo@example.com → /evaluator
                  </span>
                </div>
              </div>
              <span className="material-symbols-outlined text-[16px] text-secondary group-hover:text-primary-container group-hover:translate-x-0.5 transition-transform">
                arrow_forward
              </span>
            </button>

            {/* Candidate Profile */}
            <button
              type="button"
              disabled={isLoading}
              onClick={() => {
                setEmail("candidate.demo@example.com");
                handleLogin("candidate.demo@example.com");
              }}
              className="p-3 rounded-lg border border-[#e2e8f0] bg-surface-container-low hover:bg-surface-container-high text-left transition-colors flex items-center justify-between group cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded bg-tertiary-fixed/50 text-on-tertiary-fixed flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[18px]">person</span>
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="font-label-sm font-semibold text-on-surface truncate">
                    Candidate Participant
                  </span>
                  <span className="font-label-xs text-secondary truncate">
                    candidate.demo@example.com → /dashboard
                  </span>
                </div>
              </div>
              <span className="material-symbols-outlined text-[16px] text-secondary group-hover:text-primary-container group-hover:translate-x-0.5 transition-transform">
                arrow_forward
              </span>
            </button>
          </div>

          <div className="relative flex items-center justify-center">
            <div className="border-t border-[#e2e8f0] w-full"></div>
            <span className="bg-surface-container-lowest px-3 text-[11px] font-label-xs uppercase text-secondary shrink-0">
              Or Custom Sign In
            </span>
          </div>

          {/* Custom Form */}
          <form onSubmit={handleFormSubmit} className="flex flex-col gap-3 font-body-sm">
            <div>
              <label className="font-label-xs text-secondary uppercase font-semibold block mb-1">
                Enrolled Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@institution.edu"
                className="w-full px-3 py-2 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface font-body-sm focus:outline-none focus:border-primary-container"
              />
            </div>

            <div>
              <label className="font-label-xs text-secondary uppercase font-semibold block mb-1">
                Password / Passcode (Optional for Demo)
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface font-body-sm focus:outline-none focus:border-primary-container"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="mt-2 w-full py-2.5 rounded bg-primary-container hover:bg-[#166534] text-on-primary font-label-md font-medium shadow-2xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              {isLoading && (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              )}
              <span>Authenticate & Enter Panel</span>
            </button>
          </form>
        </div>

        {/* Security Disclaimers */}
        <div className="mt-6 text-center text-secondary font-label-xs max-w-sm">
          <span>Security Protocol: Role routing is enforced server-side from PostgreSQL. Client tampering and role spoofing are rejected.</span>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full bg-surface-container-low py-space-md border-t border-[#e2e8f0] text-center font-body-sm text-secondary">
        © 2025 ACI Career EDGE Assessment Platform. High-Stakes Security Protocol.
      </footer>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-secondary">Loading authentication...</div>}>
      <LoginContent />
    </Suspense>
  );
}
