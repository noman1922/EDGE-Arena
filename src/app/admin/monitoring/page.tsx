"use client";

import React, { Suspense } from "react";
import { MonitoringDashboardView } from "@/components/monitoring/monitoring-dashboard-view";

export default function AdminMonitoringPage() {
  return (
    <Suspense
      fallback={
        <div className="py-12 text-center text-secondary">
          <div className="inline-flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-primary-container border-t-transparent rounded-full animate-spin"></span>
            <span>Loading admin monitoring console...</span>
          </div>
        </div>
      }
    >
      <MonitoringDashboardView role="ADMIN" />
    </Suspense>
  );
}
