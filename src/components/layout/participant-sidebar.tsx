"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLogo } from "@/components/ui/brand-logo";

interface ParticipantSidebarProps {
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export function ParticipantSidebar({
  mobileOpen = false,
  onCloseMobile,
}: ParticipantSidebarProps) {
  const pathname = usePathname();

  const navItems = [
    { label: "Dashboard", href: "/dashboard", exact: true, icon: "space_dashboard" },
    { label: "My Contests", href: "/dashboard/contests", exact: false, icon: "emoji_events" },
    { label: "Tasks / Assessment", href: "/assessment", exact: false, icon: "assignment" },
    { label: "Leaderboard", href: "/dashboard/leaderboard", exact: false, icon: "leaderboard" },
    { label: "My Results / Scorecard", href: "/dashboard/results", exact: false, icon: "workspace_premium" },
    { label: "Profile / Account", href: "/dashboard/profile", exact: false, icon: "account_circle" },
  ];

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-inverse-surface/40 backdrop-blur-xs z-40 lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`fixed left-0 top-0 h-full w-64 bg-surface-container-lowest border-r border-[#e2e8f0] z-50 flex flex-col justify-between transition-transform duration-200 ease-in-out ${
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="flex flex-col">
          {/* Header / Brand */}
          <div className="h-16 flex items-center justify-between px-gutter border-b border-[#e2e8f0]">
            <BrandLogo subtitleText="Candidate Portal" />
            {onCloseMobile && (
              <button
                onClick={onCloseMobile}
                className="lg:hidden p-1 rounded hover:bg-surface-container text-secondary"
                aria-label="Close menu"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            )}
          </div>

          {/* Enrolled Status Pill */}
          <div className="px-gutter py-space-sm">
            <div className="px-space-sm py-1.5 bg-surface-container-low rounded border border-[#e2e8f0] text-on-secondary-container font-label-xs flex items-center justify-between">
              <span className="truncate font-medium">Candidate Workspace</span>
              <span className="w-1.5 h-1.5 rounded-full bg-primary-container animate-pulse"></span>
            </div>
          </div>

          {/* Navigation Items */}
          <nav className="px-space-sm py-space-xs flex flex-col gap-1">
            {navItems.map((item) => {
              const isActive = item.exact
                ? pathname === item.href
                : pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));

              return (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={onCloseMobile}
                  className={`flex items-center gap-space-sm px-space-sm py-2 rounded font-label-md transition-colors ${
                    isActive
                      ? "bg-primary-container text-on-primary font-medium shadow-xs"
                      : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                  }`}
                >
                  <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Bottom Integrity Badge */}
        <div className="p-space-md bg-surface-container-low mx-space-sm mb-space-sm rounded border border-[#e2e8f0]">
          <div className="flex items-center gap-space-xs text-primary-container font-label-xs uppercase tracking-wider mb-1 font-semibold">
            <span className="material-symbols-outlined text-[16px]">verified_user</span>
            Assessment Verified
          </div>
          <p className="font-body-sm text-secondary">Candidate diagnostic session active</p>
        </div>
      </aside>
    </>
  );
}
