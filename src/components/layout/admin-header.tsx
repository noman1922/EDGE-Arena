"use client";

import React from "react";
import Link from "next/link";
import { DEMO_EVALUATOR } from "@/lib/demo-data";

interface AdminHeaderProps {
  onToggleMobileNav?: () => void;
}

export function AdminHeader({ onToggleMobileNav }: AdminHeaderProps) {
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

        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-label-xs bg-amber-50 text-amber-800 border border-amber-200">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
          Demo Environment
        </span>

        <div className="hidden md:flex items-center gap-space-xs px-space-sm py-1.5 rounded bg-surface-container-low text-secondary font-label-sm border border-[#e2e8f0]">
          <span className="material-symbols-outlined text-[18px]">search</span>
          <span className="text-secondary/80">Search demo benchmarks, tags...</span>
          <kbd className="ml-space-md px-1.5 py-0.5 bg-surface-container-lowest text-secondary rounded font-label-xs border border-[#e2e8f0] shadow-2xs">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Right: Role Switcher & Profile */}
      <div className="flex items-center gap-3 sm:gap-gutter">
        {/* Role Switcher Pill */}
        <div className="inline-flex items-center p-0.5 rounded bg-surface-container-high border border-[#e2e8f0] text-on-surface-variant font-label-xs">
          <span className="px-space-sm py-1 rounded bg-primary-container text-on-primary font-medium shadow-xs">
            Admin View
          </span>
          <Link
            href="/dashboard"
            className="px-space-sm py-1 rounded text-secondary hover:text-on-surface hover:bg-surface-container transition-colors"
          >
            Participant View
          </Link>
        </div>

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
              {DEMO_EVALUATOR.name}
            </span>
            <span className="font-label-xs text-secondary leading-tight">
              {DEMO_EVALUATOR.title}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
