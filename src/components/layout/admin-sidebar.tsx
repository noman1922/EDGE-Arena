"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLogo } from "@/components/ui/brand-logo";
import { useAdminContest } from "@/context/admin-contest-context";

interface AdminSidebarProps {
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export function AdminSidebar({ mobileOpen = false, onCloseMobile }: AdminSidebarProps) {
  const pathname = usePathname();
  const { contests, selectedContestId, setSelectedContestId } = useAdminContest();

  const navItems = [
    { label: "Overview", href: "/admin", icon: "grid_view" },
    { label: "Contest Management", href: "/admin/contests", icon: "award_star" },
    { label: "Participants", href: "/admin/participants", icon: "group" },
    { label: "Evaluators", href: "/admin/evaluators", icon: "badge" },
    { label: "Phases & Tasks", href: "/admin/tasks", icon: "assignment" },
    { label: "Submissions", href: "/admin/submissions", icon: "rule" },
    { label: "Monitoring", href: "/admin/monitoring", icon: "sensors" },
    { label: "Leaderboards & Results", href: "/admin/results", icon: "leaderboard" },
    { label: "Audit Log", href: "/admin/audit", icon: "history" },
    { label: "System Errors", href: "/admin/errors", icon: "bug_report" },
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
        className={`fixed left-0 top-0 h-full w-64 bg-surface-container-lowest border-r border-[#e2e8f0] z-50 flex flex-col transition-transform duration-200 ease-in-out ${
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {/* Header / Brand */}
        <div className="h-16 flex items-center justify-between px-gutter border-b border-[#e2e8f0]">
          <BrandLogo subtitleText="Admin Suite" />
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

        {/* Active Contest Selector */}
        <div className="px-gutter py-space-sm border-b border-[#f1f5f9]">
          <label className="text-[10px] uppercase tracking-wider text-secondary font-semibold block mb-1">
            Active Scope
          </label>
          <div className="relative">
            <select
              value={selectedContestId}
              onChange={(e) => setSelectedContestId(e.target.value)}
              className="w-full bg-surface-container-low text-on-surface font-label-xs font-semibold rounded border border-[#e2e8f0] py-1.5 pl-2 pr-6 appearance-none focus:outline-none focus:border-primary-container truncate"
              title="Filter administrator view by active contest"
            >
              <option value="ALL">All Contests (Global Scope)</option>
              {contests.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
            <span className="material-symbols-outlined absolute right-1.5 top-1/2 -translate-y-1/2 text-[16px] text-secondary pointer-events-none">
              expand_more
            </span>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-space-sm py-space-xs flex flex-col gap-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive =
              item.href === "/admin"
                ? pathname === "/admin" || pathname === "/admin/overview"
                : pathname.startsWith(item.href);

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

        {/* Bottom Integrity Badge */}
        <Link
          href="/admin/errors"
          className="p-space-sm bg-surface-container-low mx-space-sm mb-space-sm rounded border border-[#e2e8f0] hover:bg-surface-container transition-colors block"
          title="View system errors, audit logs, and diagnostic telemetry"
        >
          <div className="flex items-center justify-between text-secondary font-label-xs uppercase tracking-wider mb-0.5 font-semibold">
            <span className="flex items-center gap-1 text-primary-container">
              <span className="material-symbols-outlined text-[15px]">verified_user</span>
              System Telemetry
            </span>
            <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
              Operational
            </span>
          </div>
          <p className="text-[11px] text-secondary">Audit Logging & Diagnostics Console</p>
        </Link>
      </aside>
    </>
  );
}
