"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { getAdminContestOptions, type AdminContestOption } from "@/app/actions/contest-actions";

interface AdminContestContextValue {
  contests: AdminContestOption[];
  selectedContestId: string; // "ALL" or specific contest ID
  selectedContest: AdminContestOption | null;
  setSelectedContestId: (contestId: string) => void;
  isLoadingContests: boolean;
  refreshContests: () => Promise<void>;
}

const STORAGE_KEY = "edge_arena_admin_selected_contest";

const AdminContestContext = createContext<AdminContestContextValue | undefined>(undefined);

export function AdminContestProvider({ children }: { children: React.ReactNode }) {
  const [contests, setContests] = useState<AdminContestOption[]>([]);
  const [selectedContestId, setSelectedContestIdState] = useState<string>("ALL");
  const [isLoadingContests, setIsLoadingContests] = useState(true);

  // Initialize from localStorage once on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setSelectedContestIdState(stored);
      }
    } catch {
      // Ignore localStorage read errors in non-browser/SSR environments
    }
  }, []);

  const refreshContests = useCallback(async () => {
    try {
      setIsLoadingContests(true);
      const list = await getAdminContestOptions();
      setContests(list);
    } catch (err) {
      console.error("Failed to fetch contest options for admin context:", err);
    } finally {
      setIsLoadingContests(false);
    }
  }, []);

  useEffect(() => {
    refreshContests();
  }, [refreshContests]);

  const setSelectedContestId = useCallback((id: string) => {
    const nextId = id || "ALL";
    setSelectedContestIdState(nextId);
    try {
      localStorage.setItem(STORAGE_KEY, nextId);
    } catch {
      // Ignore localStorage write errors
    }
  }, []);

  const selectedContest = useMemo(() => {
    if (!selectedContestId || selectedContestId === "ALL") {
      return null;
    }
    return contests.find((c) => c.id === selectedContestId) || null;
  }, [contests, selectedContestId]);

  const value = useMemo<AdminContestContextValue>(
    () => ({
      contests,
      selectedContestId,
      selectedContest,
      setSelectedContestId,
      isLoadingContests,
      refreshContests,
    }),
    [contests, selectedContestId, selectedContest, setSelectedContestId, isLoadingContests, refreshContests]
  );

  return <AdminContestContext.Provider value={value}>{children}</AdminContestContext.Provider>;
}

export function useAdminContest(): AdminContestContextValue {
  const context = useContext(AdminContestContext);
  if (!context) {
    throw new Error("useAdminContest must be used within an AdminContestProvider");
  }
  return context;
}
