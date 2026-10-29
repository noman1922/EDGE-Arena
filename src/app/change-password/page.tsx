"use client";

import React, { useState } from "react";
import { BrandLogo } from "@/components/ui/brand-logo";
import { changePasswordAction, logoutAction } from "@/app/actions/auth-actions";

export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const isMinLength = newPassword.length >= 8;
  const isMatching = newPassword.length > 0 && newPassword === confirmPassword;
  const isDifferent = newPassword.length > 0 && newPassword !== currentPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!currentPassword) {
      setErrorMessage("Please enter your current password.");
      return;
    }
    if (!isMinLength) {
      setErrorMessage("New password must be at least 8 characters long.");
      return;
    }
    if (!isMatching) {
      setErrorMessage("New passwords do not match.");
      return;
    }
    if (!isDifferent) {
      setErrorMessage("New password must be different from your current password.");
      return;
    }

    try {
      setIsLoading(true);
      const res = await changePasswordAction(currentPassword, newPassword, confirmPassword);
      if (res.success && res.redirectTo) {
        setIsSuccess(true);
        setTimeout(() => {
          window.location.href = res.redirectTo!;
        }, 1200);
      } else {
        setErrorMessage(res.error || "Failed to change password. Please check your current password.");
      }
    } catch {
      setErrorMessage("Something went wrong. Please contact your system administrator.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    await logoutAction();
    window.location.href = "/login";
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col justify-between">
      {/* Header */}
      <header className="h-16 w-full border-b border-[#e2e8f0] bg-surface-container-lowest/90 backdrop-blur-xl px-4 sm:px-gutter flex items-center justify-between">
        <BrandLogo showSubtitle={false} />
        <div className="flex items-center gap-2 font-label-xs text-secondary">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
          <span className="font-semibold text-on-surface">Security Verification</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-md w-full mx-auto px-4 py-space-xl flex flex-col items-center">
        <div className="w-full bg-surface-container-lowest p-6 sm:p-8 rounded-lg border border-[#e2e8f0] shadow-2xs flex flex-col gap-6">
          <div className="text-center">
            <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-700 flex items-center justify-center mx-auto mb-3">
              <span className="material-symbols-outlined text-[24px]">key</span>
            </div>
            <h1 className="font-headline-lg text-on-surface font-semibold tracking-tight">
              Change Initial Password
            </h1>
            <p className="font-body-sm text-secondary mt-1">
              You are signed in with a temporary password. You must set a permanent password before accessing the platform.
            </p>
          </div>

          {errorMessage && (
            <div className="p-3 rounded bg-error-container/60 border border-error/20 text-error font-label-xs flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">error</span>
              <span>{errorMessage}</span>
            </div>
          )}

          {isSuccess && (
            <div className="p-3 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 font-label-xs flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">check_circle</span>
              <span>Password updated successfully! Redirecting to your panel...</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4 font-body-sm">
            <div>
              <label className="font-label-xs text-secondary uppercase font-semibold block mb-1">
                Current / Temporary Password
              </label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Current password"
                className="w-full px-3 py-2 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface font-body-sm focus:outline-none focus:border-primary-container"
              />
            </div>

            <div>
              <label className="font-label-xs text-secondary uppercase font-semibold block mb-1">
                New Password
              </label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full px-3 py-2 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface font-body-sm focus:outline-none focus:border-primary-container"
              />
            </div>

            <div>
              <label className="font-label-xs text-secondary uppercase font-semibold block mb-1">
                Confirm New Password
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                className="w-full px-3 py-2 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface font-body-sm focus:outline-none focus:border-primary-container"
              />
            </div>

            {/* Password Validation Checklist */}
            <div className="p-3 rounded bg-surface-container-low border border-[#e2e8f0] text-xs flex flex-col gap-1.5">
              <div className={`flex items-center gap-2 ${isMinLength ? "text-emerald-700 font-medium" : "text-secondary"}`}>
                <span className="material-symbols-outlined text-[14px]">
                  {isMinLength ? "check_circle" : "radio_button_unchecked"}
                </span>
                <span>Minimum 8 characters</span>
              </div>
              <div className={`flex items-center gap-2 ${isMatching ? "text-emerald-700 font-medium" : "text-secondary"}`}>
                <span className="material-symbols-outlined text-[14px]">
                  {isMatching ? "check_circle" : "radio_button_unchecked"}
                </span>
                <span>Passwords match</span>
              </div>
              <div className={`flex items-center gap-2 ${isDifferent ? "text-emerald-700 font-medium" : "text-secondary"}`}>
                <span className="material-symbols-outlined text-[14px]">
                  {isDifferent ? "check_circle" : "radio_button_unchecked"}
                </span>
                <span>Different from current password</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || isSuccess}
              className="mt-2 w-full py-2.5 rounded bg-primary-container hover:bg-[#166534] text-on-primary font-label-md font-medium shadow-2xs transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isLoading && (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              )}
              <span>Update Password & Continue</span>
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="text-center font-label-xs text-secondary hover:text-on-surface underline transition-colors cursor-pointer"
            >
              Cancel and Sign Out
            </button>
          </form>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full bg-surface-container-low py-space-md border-t border-[#e2e8f0] text-center font-body-sm text-secondary">
        © 2026 ACI Career EDGE Assess. Enterprise Assessment Platform.
      </footer>
    </div>
  );
}
