"use client";

import React, { useState, useEffect } from "react";

export function LiveDateTime() {
  const [mounted, setMounted] = useState(false);
  const [dateTime, setDateTime] = useState<{ date: string; time: string }>({
    date: "",
    time: "",
  });

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setDateTime({
        date: now.toLocaleDateString("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric",
        }),
        time: now.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        }),
      });
    };

    updateTime();
    setMounted(true);

    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  if (!mounted) {
    return (
      <div
        className="inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded bg-surface-container-low border border-[#e2e8f0] font-label-xs text-secondary/40 min-h-[28px]"
        aria-hidden="true"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0"></span>
        <span className="w-20 sm:w-36 h-3 bg-slate-200/70 rounded"></span>
      </div>
    );
  }

  return (
    <div
      className="inline-flex items-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 py-1 rounded bg-surface-container-low border border-[#e2e8f0] font-label-xs text-secondary select-none"
      title="Current Date & Live Time"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
      <span className="material-symbols-outlined text-[15px] text-secondary shrink-0 hidden xs:inline">
        schedule
      </span>
      <span className="hidden sm:inline text-secondary font-medium tracking-tight">
        {dateTime.date}
      </span>
      <span className="hidden sm:inline text-outline/60">•</span>
      <span className="font-semibold text-on-surface font-mono text-[11px] sm:text-label-xs tabular-nums tracking-normal">
        {dateTime.time}
      </span>
    </div>
  );
}

