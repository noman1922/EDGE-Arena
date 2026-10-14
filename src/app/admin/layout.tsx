"use client";

import React, { useState } from "react";
import { AdminSidebar } from "@/components/layout/admin-sidebar";
import { AdminHeader } from "@/components/layout/admin-header";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="min-h-screen bg-surface">
      <AdminSidebar
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />
      <AdminHeader onToggleMobileNav={() => setMobileNavOpen(true)} />
      <div className="pl-0 lg:pl-64 pt-16">
        <main className="w-full px-4 sm:px-gutter py-space-md sm:py-space-lg min-h-[calc(100vh-64px)]">
          {children}
        </main>
      </div>
    </div>
  );
}
