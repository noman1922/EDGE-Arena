"use client";

import React, { useState, useEffect } from "react";
import { logoutAction, getCurrentUserSession } from "@/app/actions/auth-actions";
import { useAdminContest } from "@/context/admin-contest-context";

interface AdminHeaderProps {
  onToggleMobileNav?: () => void;
}

export function AdminHeader({ onToggleMobileNav }: AdminHeaderProps) {
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [sessionUser, setSessionUser] = useState<{ name: string; email: string; role: string } | null>(null);
  const { selectedContest } = useAdminContest();

  useEffect(() => {
    getCurrentUserSession().then((session) => {
      if (session) {
        setSessionUser({
          name: session.name || "Administrator",
          email: session.email,
          role: session.role,
        });
      }
    });
  }, []);

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

  const avatarInitials = sessionUser?.name
    ? sessionUser.name
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "AD";

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

        {/* Active Contest Pill */}
        <div className="hidden sm:inline-flex items-center gap-1.5 px-space-sm py-1 rounded font-label-xs bg-surface-container border border-[#e2e8f0] text-on-surface">
          <span className="w-1.5 h-1.5 rounded-full bg-primary-container shrink-0"></span>
          <span className="font-semibold text-secondary">Active Contest:</span>
          <span className="font-bold text-on-surface truncate max-w-[200px] md:max-w-[300px]">
            {selectedContest ? selectedContest.title : "All Contests (Global Scope)"}
          </span>
        </div>

        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-label-xs bg-emerald-50 text-emerald-800 border border-emerald-200">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
          Administrator
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
            {avatarInitials}
          </div>
          <div className="hidden lg:flex flex-col text-left">
            <span className="font-label-md text-on-surface leading-tight font-medium">
              {sessionUser?.name || "Administrator"}
            </span>
            <span className="font-label-xs text-secondary leading-tight truncate max-w-[180px]">
              {sessionUser?.email || "admin@career-edge.edu"}
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
