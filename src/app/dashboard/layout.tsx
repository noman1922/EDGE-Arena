"use client";

import React, { useState } from "react";
import { ParticipantSidebar } from "@/components/layout/participant-sidebar";
import { ParticipantHeader } from "@/components/layout/participant-header";

export default function ParticipantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="min-h-screen bg-surface">
      <ParticipantSidebar
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />
      <ParticipantHeader
        showSidebarOffset={true}
        onToggleMobileNav={() => setMobileNavOpen(true)}
      />
      <div className="pl-0 lg:pl-64 pt-16">
        <main className="w-full min-h-[calc(100vh-64px)]">
          {children}
        </main>
      </div>
    </div>
  );
}
