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
        if (res.mustChangePassword) {
          window.location.href = "/change-password";
        } else {
          window.location.href = redirectTarget || res.redirectTo;
        }
      } else {
        setErrorMessage(res.error || "Invalid email or password.");
      }
    } catch (err) {
      console.error(err);
      setErrorMessage("Something went wrong. Please contact your system administrator.");
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
              Sign In to ACI Career EDGE Assess
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

          {/* Closed-Access Notice */}
          <div className="p-3.5 rounded-lg bg-surface-container-low border border-[#e2e8f0] text-secondary font-label-xs flex items-start gap-2.5">
            <span className="material-symbols-outlined text-[18px] text-primary-container shrink-0 mt-0.5">lock</span>
            <div className="flex flex-col gap-0.5">
              <span className="font-semibold text-on-surface">Closed-Access Platform</span>
              <span>Self-registration is disabled. Evaluator and Candidate accounts are provisioned exclusively by authorized platform administrators.</span>
            </div>
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
                Password / Passcode
              </label>
              <input
                type="password"
                required
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
          <span>Authorized access only. User roles and permissions are enforced on the server.</span>
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
