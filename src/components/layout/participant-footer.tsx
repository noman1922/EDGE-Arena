import React from "react";
import Link from "next/link";

export function ParticipantFooter() {
  return (
    <footer className="w-full bg-surface-container-low py-space-lg border-t border-[#e2e8f0]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 flex flex-col sm:flex-row items-center justify-between gap-space-md font-body-sm text-secondary">
        <span>© 2025 ACI Career EDGE Assessment Platform. High-Stakes Evaluation System.</span>
        <div className="flex items-center gap-space-lg font-label-sm">
          <Link href="#" className="hover:text-on-surface transition-colors">
            Integrity Code
          </Link>
          <Link href="#" className="hover:text-on-surface transition-colors">
            System Diagnostics
          </Link>
          <Link href="#" className="hover:text-on-surface transition-colors">
            Candidate Support
          </Link>
        </div>
      </div>
    </footer>
  );
}
