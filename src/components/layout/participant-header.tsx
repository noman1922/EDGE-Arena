"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLogo } from "@/components/ui/brand-logo";

export function ParticipantHeader() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { label: "My Contests", href: "/dashboard" },
    { label: "Assessment", href: "/assessment" },
    { label: "Leaderboard", href: "/admin/contests" },
    { label: "My Profile", href: "/dashboard" },
  ];

  return (
    <header className="fixed top-0 w-full z-50 bg-surface-container-lowest/95 backdrop-blur-xl border-b border-[#e2e8f0]">
      <div className="h-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 flex items-center justify-between">
        {/* Logo and Nav */}
        <div className="flex items-center gap-space-md sm:gap-space-xl">
          <Link href="/dashboard" className="flex items-center">
            <BrandLogo subtitleText="Candidate Portal" />
          </Link>

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
        <div className="flex items-center gap-space-sm sm:gap-space-lg">
          {/* Role Switcher Pill */}
          <div className="inline-flex items-center p-0.5 rounded bg-surface-container-high border border-[#e2e8f0] text-on-surface-variant font-label-xs">
            <Link
              href="/admin"
              className="px-space-sm py-1 rounded text-secondary hover:text-on-surface hover:bg-surface-container transition-colors"
            >
              Admin View
            </Link>
            <span className="px-space-sm py-1 rounded bg-primary-container text-on-primary font-medium shadow-xs">
              Participant View
            </span>
          </div>

          <button
            aria-label="Notifications"
            className="p-1.5 text-secondary hover:text-on-surface rounded hover:bg-surface-container transition-colors"
          >
            <span className="material-symbols-outlined text-[22px]">notifications</span>
          </button>

          <div className="flex items-center gap-space-sm pl-space-xs border-l border-[#e2e8f0]">
            <div className="w-8 h-8 rounded-full bg-primary-fixed text-on-primary-fixed flex items-center justify-center font-label-sm font-semibold shrink-0">
              EV
            </div>
            <span className="hidden sm:inline-block font-label-md text-on-surface font-medium">
              Eleanor Vance
            </span>
          </div>

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
        </div>
      )}
    </header>
  );
}
