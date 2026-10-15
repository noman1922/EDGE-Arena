"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLogo } from "@/components/ui/brand-logo";
import { DEMO_CANDIDATE } from "@/lib/demo-data";
import { logoutAction } from "@/app/actions/auth-actions";

export function ParticipantHeader() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const navLinks = [
    { label: "My Contests", href: "/dashboard" },
    { label: "Assessment", href: "/assessment" },
    { label: "My Profile", href: "/dashboard" },
  ];

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
    <header className="fixed top-0 w-full z-50 bg-surface-container-lowest/95 backdrop-blur-xl border-b border-[#e2e8f0]">
      <div className="h-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 flex items-center justify-between">
        {/* Logo and Nav */}
        <div className="flex items-center gap-space-md sm:gap-space-xl">
          <Link href="/dashboard" className="flex items-center">
            <BrandLogo subtitleText="Candidate Portal" />
          </Link>

          <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded font-label-xs bg-emerald-50 text-emerald-800 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
            Participant Workspace
          </span>

          <nav className="hidden md:flex items-center gap-space-xs">
            {navLinks.map((link) => {
              const isActive =
                link.href === "/dashboard"
                  ? pathname === "/dashboard"
                  : pathname.startsWith(link.href);

              return (
                <Link
                  key={link.label}
                  href={link.href}
                  className={`px-space-md py-1.5 rounded font-label-md transition-colors ${
                    isActive
                      ? "bg-surface-container-high text-on-surface font-semibold"
                      : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-space-sm sm:gap-space-md">
          {/* Notifications */}
          <button
            aria-label="Notifications"
            className="p-1.5 text-secondary hover:text-on-surface rounded hover:bg-surface-container transition-colors"
          >
            <span className="material-symbols-outlined text-[22px]">notifications</span>
          </button>

          {/* Profile Lockup */}
          <div className="flex items-center gap-space-sm pl-space-xs border-l border-[#e2e8f0]">
            <div className="w-8 h-8 rounded-full bg-primary-fixed text-on-primary-fixed flex items-center justify-center font-label-sm font-semibold shrink-0">
              {DEMO_CANDIDATE.avatarInitials}
            </div>
            <div className="hidden sm:flex flex-col text-left">
              <span className="font-label-sm text-on-surface font-medium leading-tight">
                {DEMO_CANDIDATE.name}
              </span>
              <span className="font-label-xs text-secondary leading-tight">
                Candidate
              </span>
            </div>
          </div>

          {/* Sign Out Button */}
          <button
            onClick={handleLogout}
            disabled={isLoggingOut}
            title="Sign Out of Candidate Workspace"
            className="ml-1 px-2.5 py-1.5 rounded bg-surface-container-low hover:bg-surface-container-high text-secondary hover:text-error font-label-xs border border-[#e2e8f0] flex items-center gap-1 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">logout</span>
            <span className="hidden sm:inline">Sign Out</span>
          </button>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-1.5 text-secondary hover:text-on-surface rounded hover:bg-surface-container"
            aria-label="Toggle mobile menu"
          >
            <span className="material-symbols-outlined text-[24px]">
              {mobileMenuOpen ? "close" : "menu"}
            </span>
          </button>
        </div>
      </div>

      {/* Mobile Nav Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-[#e2e8f0] bg-surface-container-lowest px-4 py-3 flex flex-col gap-1 shadow-md">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              onClick={() => setMobileMenuOpen(false)}
              className={`px-3 py-2 rounded font-label-md ${
                pathname === link.href
                  ? "bg-primary-container text-on-primary font-medium"
                  : "text-on-surface hover:bg-surface-container"
              }`}
            >
              {link.label}
            </Link>
          ))}
          <button
            onClick={handleLogout}
            className="mt-2 text-left px-3 py-2 rounded font-label-md text-error hover:bg-surface-container flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[18px]">logout</span>
            <span>Sign Out</span>
          </button>
        </div>
      )}
    </header>
  );
}
