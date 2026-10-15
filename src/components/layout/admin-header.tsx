"use client";

import React, { useState } from "react";
import { DEMO_EVALUATOR } from "@/lib/demo-data";
import { logoutAction } from "@/app/actions/auth-actions";

interface AdminHeaderProps {
  onToggleMobileNav?: () => void;
}

export function AdminHeader({ onToggleMobileNav }: AdminHeaderProps) {
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      await logoutAction();
      window.location.href = "/login";
    } catch (err) {
      console.error("Logout failed:", err);
      window.location.href = "/login";
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <header className="fixed top-0 left-0 lg:left-64 right-0 h-16 bg-surface-container-lowest/95 backdrop-blur-xl border-b border-[#e2e8f0] z-40 px-4 sm:px-gutter flex items-center justify-between">
      {/* Left: Mobile trigger & Search */}
      <div className="flex items-center gap-space-sm sm:gap-space-md">
        {onToggleMobileNav && (
          <button
            onClick={onToggleMobileNav}
            className="lg:hidden p-2 rounded hover:bg-surface-container text-secondary"
            aria-label="Open navigation menu"
          >
            <span className="material-symbols-outlined text-[22px]">menu</span>
          </button>
        )}

        <span className="hidden sm:inline-flex items-center px-space-sm py-0.5 rounded font-label-xs bg-tertiary-fixed text-on-tertiary-fixed font-semibold tracking-wide border border-[#e2e8f0]">
          {DEMO_EVALUATOR.cohort}
        </span>

        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-label-xs bg-purple-50 text-purple-800 border border-purple-200">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-600"></span>
          Admin Authorized
        </span>

        <div className="hidden md:flex items-center gap-space-xs px-space-sm py-1.5 rounded bg-surface-container-low text-secondary font-label-sm border border-[#e2e8f0]">
          <span className="material-symbols-outlined text-[18px]">search</span>
          <span className="text-secondary/80">Search contests, rubrics, cohorts...</span>
          <kbd className="ml-space-md px-1.5 py-0.5 bg-surface-container-lowest text-secondary rounded font-label-xs border border-[#e2e8f0] shadow-2xs">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Right: Notifications & Profile & Logout */}
      <div className="flex items-center gap-3 sm:gap-gutter">
        {/* Notifications */}
        <button
          aria-label="Notifications"
          className="relative p-1.5 text-secondary hover:text-on-surface rounded hover:bg-surface-container transition-colors"
        >
          <span className="material-symbols-outlined text-[22px]">notifications</span>
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary-container ring-2 ring-surface-container-lowest"></span>
        </button>

        {/* Profile Lockup */}
        <div className="flex items-center gap-space-sm pl-space-xs sm:pl-space-sm border-l border-[#e2e8f0]">
          <div className="w-8 h-8 rounded-full bg-secondary-fixed text-on-secondary-fixed flex items-center justify-center font-label-sm font-semibold overflow-hidden shrink-0">
            {DEMO_EVALUATOR.avatarInitials}
          </div>
          <div className="hidden lg:flex flex-col text-left">
            <span className="font-label-md text-on-surface leading-tight font-medium">
              Administrator
            </span>
            <span className="font-label-xs text-secondary leading-tight">
              admin.demo@example.com
            </span>
          </div>
        </div>

        {/* Sign Out Button */}
        <button
          onClick={handleLogout}
          disabled={isLoggingOut}
          title="Sign Out of Administrator Panel"
          className="px-2.5 py-1.5 rounded bg-surface-container-low hover:bg-surface-container-high text-secondary hover:text-error font-label-xs border border-[#e2e8f0] flex items-center gap-1 transition-colors cursor-pointer"
        >
          <span className="material-symbols-outlined text-[16px]">logout</span>
          <span className="hidden sm:inline">Sign Out</span>
        </button>
      </div>
    </header>
  );
}
