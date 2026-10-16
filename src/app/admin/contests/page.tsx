"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { DEMO_METRICS } from "@/lib/demo-data";
import {
  getAdminContests,
  createContestAction,
  updateContestAction,
  updateContestStatusAction,
  assignParticipantAction,
  removeParticipantAction,
  deleteContestAction,
  getAvailableParticipantsAction,
  batchEnrollParticipantsAction,
  bulkEnrollParticipantsCsvAction,
  previewEnrollmentCsvAction,
  type AdminContestListItem,
  type AvailableParticipantOption,
  type BulkEnrollSummary,
  type BulkEnrollPreviewResult,
} from "@/app/actions/contest-actions";
import {
  getContestMonitoringSettingsAction,
  saveContestMonitoringSettingsAction,
} from "@/app/actions/monitoring-actions";
import {
  type ContestMonitoringSettings,
  DEFAULT_MONITORING_SETTINGS,
} from "@/lib/monitoring";
import { DeleteConfirmationModal } from "@/components/modals/delete-confirmation-modal";

/**
 * Returns a YYYY-MM-DDTHH:mm string in Asia/Dhaka timezone (UTC+6)
 */
function getDhakaDateTimeString(d: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(d);
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value || "";
  const year = getPart("year");
  const month = getPart("month");
  const day = getPart("day");
  const hour = getPart("hour");
  const minute = getPart("minute");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export default function ContestManagementPage() {
  const [contests, setContests] = useState<AdminContestListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | "Live" | "Completed" | "Draft">("All");
  const [selectedContest, setSelectedContest] = useState<AdminContestListItem | null>(null);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  // Create Contest Modal State (Runtime dynamic dates in Asia/Dhaka)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newTrack, setNewTrack] = useState("Track B · Operational Excellence & AI");
  const [newDescription, setNewDescription] = useState("");
  const [newStartDate, setNewStartDate] = useState("");
  const [newEndDate, setNewEndDate] = useState("");
  const [newStatus, setNewStatus] = useState<"LIVE" | "DRAFT">("LIVE");
  const [newEnforceSequentialProgress, setNewEnforceSequentialProgress] = useState(true);
  const [isSubmittingContest, setIsSubmittingContest] = useState(false);

  // Participant Enrollment State (inside drawer)
  const [enrollTab, setEnrollTab] = useState<"SELECT" | "CSV" | "SINGLE">("SELECT");
  const [availableParticipants, setAvailableParticipants] = useState<AvailableParticipantOption[]>([]);
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([]);
  const [participantSearch, setParticipantSearch] = useState("");
  const [isEnrollingBatch, setIsEnrollingBatch] = useState(false);
  const [enrollBatchMsg, setEnrollBatchMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // CSV Enrollment State
  const [csvText, setCsvText] = useState("");
  const [isUploadingCsv, setIsUploadingCsv] = useState(false);
  const [isPreviewingCsv, setIsPreviewingCsv] = useState(false);
  const [bulkCsvResult, setBulkCsvResult] = useState<BulkEnrollSummary | null>(null);
  const [csvPreview, setCsvPreview] = useState<BulkEnrollPreviewResult | null>(null);
  const [previewDetailTab, setPreviewDetailTab] = useState<"READY" | "ALREADY_ENROLLED" | "INVALID">("READY");

  // Single Quick Assign Form State
  const [assignEmail, setAssignEmail] = useState("");
  const [assignName, setAssignName] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);
  const [assignMessage, setAssignMessage] = useState<string | null>(null);

  // Edit Contest Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editId, setEditId] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editTrack, setEditTrack] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [editStatus, setEditStatus] = useState<"DRAFT" | "LIVE" | "COMPLETED" | "ARCHIVED">("LIVE");
  const [editEnforceSequentialProgress, setEditEnforceSequentialProgress] = useState(true);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [monitoringSettings, setMonitoringSettings] = useState<ContestMonitoringSettings>(DEFAULT_MONITORING_SETTINGS);
  const [isSavingMonitoring, setIsSavingMonitoring] = useState(false);
  const [monitoringSaveSuccess, setMonitoringSaveSuccess] = useState(false);

  // Universal Delete Confirmation Modal State
  const [deleteModalState, setDeleteModalState] = useState<{
    isOpen: boolean;
    title: string;
    itemDescription: string;
    warningDetails?: string;
    confirmLabel?: string;
    onConfirm: () => Promise<void>;
  }>({
    isOpen: false,
    title: "",
    itemDescription: "",
    confirmLabel: "Delete Permanently",
    onConfirm: async () => {},
  });
  const [isDeletingContest, setIsDeletingContest] = useState(false);

  // Load available participants when drawer contest changes
  const loadAvailableParticipants = async (cId: string) => {
    try {
      const list = await getAvailableParticipantsAction(cId);
      setAvailableParticipants(list);
      setSelectedParticipantIds([]);
      setEnrollBatchMsg(null);
      setBulkCsvResult(null);
    } catch (err) {
      console.error("Failed to load available participants:", err);
    }
  };

  useEffect(() => {
    if (selectedContest?.id) {
      let isMounted = true;
      getContestMonitoringSettingsAction(selectedContest.id).then((settings) => {
        if (isMounted) {
          setMonitoringSettings(settings);
          setMonitoringSaveSuccess(false);
        }
      });
      loadAvailableParticipants(selectedContest.id);
      return () => {
        isMounted = false;
      };
    }
  }, [selectedContest?.id]);

  const handleSaveMonitoringSettings = async () => {
    if (!selectedContest) return;
    try {
      setIsSavingMonitoring(true);
      const res = await saveContestMonitoringSettingsAction(selectedContest.id, monitoringSettings);
      if (res.success) {
        setMonitoringSaveSuccess(true);
        setTimeout(() => setMonitoringSaveSuccess(false), 3000);
      } else {
        alert(res.error || "Failed to save monitoring settings");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingMonitoring(false);
    }
  };

  const fetchContests = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await getAdminContests();
      setContests(data);
      // If a contest is currently selected in drawer, update its reference
      setSelectedContest((prev) => {
        if (!prev) return null;
        return data.find((c) => c.id === prev.id) || null;
      });
    } catch (err) {
      console.error("Failed to load contests from database:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContests();
  }, [fetchContests]);

  const openCreateModal = () => {
    setNewTitle("");
    setNewDescription("");
    setNewStartDate(getDhakaDateTimeString(new Date()));
    setNewEndDate(getDhakaDateTimeString(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)));
    setIsCreateModalOpen(true);
  };

  const filteredContests = contests.filter((c) => {
    const matchesFilter = statusFilter === "All" || c.status === statusFilter;
    const matchesSearch =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.stage.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.track.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const toggleSelectAll = () => {
    if (selectedRows.length === filteredContests.length) {
      setSelectedRows([]);
    } else {
      setSelectedRows(filteredContests.map((c) => c.id));
    }
  };

  const toggleSelectRow = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedRows((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]
    );
  };

  const handleCreateContest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    if (new Date(newEndDate) <= new Date(newStartDate)) {
      alert("Contest end date and time must be after the start date and time.");
      return;
    }

    try {
      setIsSubmittingContest(true);
      const res = await createContestAction({
        title: newTitle.trim(),
        track: newTrack,
        description: newDescription.trim() || undefined,
        startDate: new Date(newStartDate).toISOString(),
        endDate: new Date(newEndDate).toISOString(),
        status: newStatus,
        cohortCode: "CLP-2025",
        enforceSequentialProgress: newEnforceSequentialProgress,
      });

      if (res.success) {
        setIsCreateModalOpen(false);
        setNewTitle("");
        setNewDescription("");
        await fetchContests();
      } else {
        alert(`Failed to create contest: ${res.error}`);
      }
    } catch (err) {
      console.error(err);
      alert("Error occurred while creating contest.");
    } finally {
      setIsSubmittingContest(false);
    }
  };

  // Participant Checkbox selection handlers
  const handleToggleParticipant = (id: string) => {
    setSelectedParticipantIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const eligibleUnenrolled = availableParticipants.filter(
    (p) =>
      !p.isEnrolled &&
      (p.name.toLowerCase().includes(participantSearch.toLowerCase()) ||
        p.email.toLowerCase().includes(participantSearch.toLowerCase()) ||
        (p.candidateId && p.candidateId.toLowerCase().includes(participantSearch.toLowerCase())))
  );

  const handleSelectAllEligible = () => {
    const allEligibleIds = eligibleUnenrolled.map((p) => p.id);
    setSelectedParticipantIds(allEligibleIds);
  };

  const handleClearSelection = () => {
    setSelectedParticipantIds([]);
  };

  const handleBatchEnroll = async () => {
    if (!selectedContest || selectedParticipantIds.length === 0) return;

    try {
      setIsEnrollingBatch(true);
      setEnrollBatchMsg(null);
      const res = await batchEnrollParticipantsAction(selectedContest.id, selectedParticipantIds);

      if (res.success) {
        setEnrollBatchMsg({
          type: "success",
          text: `Enrolled ${res.enrolledCount} participant(s) successfully.${res.alreadyEnrolledCount ? ` (${res.alreadyEnrolledCount} already enrolled)` : ""}`,
        });
        setSelectedParticipantIds([]);
        await fetchContests();
        await loadAvailableParticipants(selectedContest.id);
      } else {
        setEnrollBatchMsg({ type: "error", text: res.error || "Batch enrollment failed." });
      }
    } catch (err) {
      console.error(err);
      setEnrollBatchMsg({ type: "error", text: "Unexpected network error during batch enrollment." });
    } finally {
      setIsEnrollingBatch(false);
    }
  };

  // Bulk CSV Enrollment
  const handlePreviewCsv = async () => {
    if (!selectedContest || !csvText.trim()) return;

    try {
      setIsPreviewingCsv(true);
      setBulkCsvResult(null);
      const res = await previewEnrollmentCsvAction(selectedContest.id, csvText.trim());
      setCsvPreview(res);
      if (res.readyCount > 0) {
        setPreviewDetailTab("READY");
      } else if (res.invalidCount > 0) {
        setPreviewDetailTab("INVALID");
      } else {
        setPreviewDetailTab("ALREADY_ENROLLED");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsPreviewingCsv(false);
    }
  };

  const handleProcessCsvEnrollment = async () => {
    if (!selectedContest || !csvText.trim()) return;

    try {
      setIsUploadingCsv(true);
      setBulkCsvResult(null);
      const res = await bulkEnrollParticipantsCsvAction(selectedContest.id, csvText.trim());
      setBulkCsvResult(res);
      setCsvPreview(null);

      if (res.success && res.enrolledCount > 0) {
        await fetchContests();
        await loadAvailableParticipants(selectedContest.id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsUploadingCsv(false);
    }
  };

  const handleDownloadCsvTemplate = () => {
    const csvContent =
      "# EDGE-Arena Contest Participant Enrollment Template\n" +
      "# INSTRUCTION: Only existing PARTICIPANT accounts created by Admin (via Admin > Participants) can be enrolled.\n" +
      "# COLUMNS: Email (required if no CandidateId), CandidateId (required if no Email), Notes (optional)\n" +
      "# You may supply Email, CandidateId, or both (if both are provided, they must match the same account).\n" +
      "# Replace this line with registered participant records:\n" +
      "Email,CandidateId,Notes\n";
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "contest_participant_enrollment_template.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleAssignParticipant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContest || !assignEmail.trim()) return;

    try {
      setIsAssigning(true);
      setAssignMessage(null);
      const res = await assignParticipantAction(
        selectedContest.id,
        assignEmail.trim(),
        assignName.trim() || undefined
      );

      if (res.success) {
        setAssignEmail("");
        setAssignName("");
        setAssignMessage(`Enrolled ${res.user?.name} (${res.user?.email}) successfully.`);
        await fetchContests();
        await loadAvailableParticipants(selectedContest.id);
      } else {
        setAssignMessage(`Error: ${res.error}`);
      }
    } catch (err) {
      console.error(err);
      setAssignMessage("Failed to assign participant.");
    } finally {
      setIsAssigning(false);
    }
  };

  const openEditModal = (c: AdminContestListItem) => {
    setEditId(c.id);
    setEditTitle(c.name);
    setEditTrack(c.track);
    setEditDescription(c.description || "");
    setEditStatus(c.status as "DRAFT" | "LIVE" | "COMPLETED" | "ARCHIVED");
    setEditEnforceSequentialProgress(c.enforceSequentialProgress ?? true);
    try {
      if (c.startDateIso) {
        setEditStartDate(getDhakaDateTimeString(new Date(c.startDateIso)));
      }
      if (c.endDateIso) {
        setEditEndDate(getDhakaDateTimeString(new Date(c.endDateIso)));
      }
    } catch {
      // fallback
    }
    setIsEditModalOpen(true);
  };

  const handleUpdateContest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editId || !editTitle.trim()) return;

    if (editStartDate && editEndDate && new Date(editEndDate) <= new Date(editStartDate)) {
      alert("Contest end date and time must be after the start date and time.");
      return;
    }

    try {
      setIsSubmittingEdit(true);
      const res = await updateContestAction(editId, {
        title: editTitle.trim(),
        track: editTrack.trim(),
        description: editDescription.trim() || undefined,
        status: editStatus,
        enforceSequentialProgress: editEnforceSequentialProgress,
        ...(editStartDate ? { startDate: new Date(editStartDate).toISOString() } : {}),
        ...(editEndDate ? { endDate: new Date(editEndDate).toISOString() } : {}),
      });

      if (res.success) {
        setIsEditModalOpen(false);
        await fetchContests();
      } else {
        alert(`Failed to update contest: ${res.error}`);
      }
    } catch (err) {
      console.error(err);
      alert("Error updating contest.");
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const handleChangeStatus = async (contestId: string, status: "DRAFT" | "LIVE" | "COMPLETED" | "ARCHIVED") => {
    try {
      const res = await updateContestStatusAction(contestId, status);
      if (res.success) {
        await fetchContests();
      } else {
        alert(`Failed to update status: ${res.error}`);
      }
    } catch (err) {
      console.error(err);
      alert("Error changing contest status.");
    }
  };

  const handleRemoveParticipant = (contestId: string, participantRecordId: string, participantName?: string) => {
    setDeleteModalState({
      isOpen: true,
      title: "Unenroll Participant",
      itemDescription: participantName || "Participant Record",
      warningDetails: "This will remove the candidate from this active contest cohort. Any existing draft answers for this contest will be unlinked.",
      confirmLabel: "Unenroll Participant",
      onConfirm: async () => {
        try {
          setIsDeletingContest(true);
          const res = await removeParticipantAction(contestId, participantRecordId);
          if (res.success) {
            setDeleteModalState((prev) => ({ ...prev, isOpen: false }));
            await fetchContests();
            if (selectedContest?.id === contestId) {
              await loadAvailableParticipants(contestId);
            }
          } else {
            alert(`Failed to remove participant: ${res.error}`);
          }
        } catch (err) {
          console.error(err);
          alert("Error removing participant.");
        } finally {
          setIsDeletingContest(false);
        }
      },
    });
  };

  const handleDeleteContest = (contestId: string, contestTitle?: string) => {
    setDeleteModalState({
      isOpen: true,
      title: "Delete Contest & Curriculum",
      itemDescription: contestTitle || "Contest Benchmark",
      warningDetails: "This will permanently delete this contest, all assessment phases, tasks, questions, rubrics, and enrolled participant submissions. This action cannot be reversed.",
      confirmLabel: "Delete Contest",
      onConfirm: async () => {
        try {
          setIsDeletingContest(true);
          const res = await deleteContestAction(contestId);
          if (res.success) {
            setDeleteModalState((prev) => ({ ...prev, isOpen: false }));
            setSelectedContest(null);
            await fetchContests();
          } else {
            alert(`Failed to delete contest: ${res.error}`);
          }
        } catch (err) {
          console.error(err);
          alert("Error deleting contest.");
        } finally {
          setIsDeletingContest(false);
        }
      },
    });
  };

  return (
    <div className="flex flex-col w-full pb-space-xl">
      {/* Top Breadcrumb & Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-space-sm pb-space-sm border-b border-[#e2e8f0]">
        <div className="flex items-center gap-space-xs font-label-xs text-secondary">
          <span>ADMINISTRATION</span>
          <span className="material-symbols-outlined text-[14px]">chevron_right</span>
          <span>CONTESTS</span>
          <span className="material-symbols-outlined text-[14px]">chevron_right</span>
          <span className="text-primary-container font-semibold">MANAGEMENT</span>
        </div>
        <div className="flex items-center gap-space-xs font-label-xs text-on-surface-variant">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          <span className="font-semibold text-on-surface">System Status:</span>
          <span className="text-secondary">Operational</span>
        </div>
      </div>

      {/* Header Section */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-space-md mt-space-sm mb-space-lg">
        <div>
          <div className="flex items-center gap-space-sm">
            <h1 className="font-display-lg text-on-surface tracking-tight">Contests</h1>
            <span className="px-space-sm py-0.5 rounded-full bg-surface-container-high border border-[#e2e8f0] text-secondary font-label-xs font-semibold tabular-nums">
              {contests.length} {contests.length === 1 ? "Contest" : "Contests"}
            </span>
          </div>
          <p className="font-body-md text-secondary mt-1 max-w-2xl">
            Manage contests, assessment phases, evaluation rubrics, and candidate assignments.
          </p>
        </div>

        {/* Actions Group */}
        <div className="flex items-center gap-space-sm flex-wrap">
          <button
            onClick={() => fetchContests()}
            className="h-10 px-space-md bg-surface-container-lowest hover:bg-surface-container text-on-surface rounded border border-[#e2e8f0] shadow-2xs flex items-center gap-space-xs font-label-md transition-colors"
          >
            <span className="material-symbols-outlined text-[18px] text-secondary">
              refresh
            </span>
            <span>Refresh</span>
          </button>
          <button
            onClick={openCreateModal}
            className="h-10 px-space-md bg-primary-container hover:bg-[#166534] text-on-primary rounded shadow-2xs flex items-center gap-space-xs font-label-md font-medium transition-all active:scale-[0.98]"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            <span>Create Contest</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs p-space-sm mb-space-md flex flex-col md:flex-row items-stretch md:items-center justify-between gap-space-sm">
        <div className="flex-1 flex items-center gap-space-sm px-space-sm">
          <span className="material-symbols-outlined text-[20px] text-secondary">search</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter by challenge name, phase, rubric tags (e.g. 'ESG', 'Strategy')..."
            className="w-full bg-transparent text-on-surface placeholder:text-secondary font-body-md focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-space-xs flex-wrap">
          {/* Segment Controls */}
          <div className="flex items-center bg-surface-container-low p-0.5 rounded border border-[#e2e8f0]">
            {(["All", "Live", "Completed", "Draft"] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-space-sm py-1 rounded font-label-xs transition-colors ${
                  statusFilter === status
                    ? "bg-surface-container-lowest text-on-surface font-semibold shadow-2xs"
                    : "text-secondary hover:text-on-surface"
                }`}
              >
                {status}{" "}
                {status !== "All" &&
                  `(${contests.filter((c) => c.status === status).length})`}
              </button>
            ))}
          </div>

          <div className="px-space-sm py-1 bg-surface-container-low rounded border border-[#e2e8f0] font-label-xs text-on-surface flex items-center gap-1">
            <span className="material-symbols-outlined text-[16px] text-secondary">groups</span>
            <span>Cohort CLP-2025</span>
          </div>
        </div>
      </div>

      {/* Structured Data Table Card */}
      <div className="bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs overflow-hidden flex flex-col">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low h-10 text-secondary font-label-xs tracking-wider uppercase border-b border-[#e2e8f0]">
                <th className="py-2 px-space-md font-medium w-8">
                  <input
                    type="checkbox"
                    checked={
                      selectedRows.length === filteredContests.length &&
                      filteredContests.length > 0
                    }
                    onChange={toggleSelectAll}
                    aria-label="Select all"
                    className="w-4 h-4 rounded accent-primary cursor-pointer"
                  />
                </th>
                <th className="py-2 px-space-md font-medium">Contest Name & Phase</th>
                <th className="py-2 px-space-md font-medium">Status</th>
                <th className="py-2 px-space-md font-medium">Enrolled Cohort</th>
                <th className="py-2 px-space-md font-medium min-w-[200px]">Submission Progress</th>
                <th className="py-2 px-space-md font-medium">Window / Dates</th>
                <th className="py-2 px-space-md font-medium text-right pr-space-lg">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f5f9] text-on-surface font-body-md">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-secondary">
                    <div className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-primary-container border-t-transparent rounded-full animate-spin"></span>
                      <span>Loading contests...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredContests.length > 0 ? (
                filteredContests.map((c) => {
                  const percent = c.total > 0 ? Math.round((c.submitted / c.total) * 100) : 0;
                  const isSelected = selectedRows.includes(c.id);

                  return (
                    <tr
                      key={c.id}
                      onClick={() => setSelectedContest(c)}
                      className="group hover:bg-surface-container-low/60 transition-colors cursor-pointer"
                    >
                      <td className="py-4 px-space-md" onClick={(e) => toggleSelectRow(c.id, e)}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          aria-label="Select Row"
                          className="w-4 h-4 rounded accent-primary cursor-pointer"
                        />
                      </td>
                      <td className="py-4 px-space-md">
                        <div className="flex items-start gap-space-sm">
                          <div
                            className={`w-8 h-8 rounded ${c.iconBg} flex items-center justify-center ${c.iconColor} mt-0.5 shrink-0`}
                          >
                            <span className="material-symbols-outlined text-[18px]">
                              {c.icon}
                            </span>
                          </div>
                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-space-xs">
                              <span className="font-headline-sm text-on-surface group-hover:text-primary-container transition-colors truncate">
                                {c.name}
                              </span>
                              <span className="material-symbols-outlined text-[14px] text-secondary opacity-0 group-hover:opacity-100 transition-opacity">
                                open_in_new
                              </span>
                            </div>
                            <span className="font-label-sm text-secondary truncate mt-0.5">
                              {c.stage}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-space-md whitespace-nowrap">
                        {c.status === "Live" && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-on-tertiary-container text-on-primary-fixed-variant font-label-xs font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary-container animate-pulse"></span>
                            Live
                          </span>
                        )}
                        {c.status === "Completed" && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-xs font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
                            Completed
                          </span>
                        )}
                        {c.status === "Draft" && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-container-high text-secondary font-label-xs font-medium">
                            Draft
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-space-md whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="font-label-md font-medium">{c.cohortText}</span>
                          <span className="font-label-xs text-secondary">{c.cohortSubtext}</span>
                        </div>
                      </td>
                      <td className="py-4 px-space-md">
                        {c.status !== "Draft" ? (
                          <div className="flex flex-col gap-1.5">
                            <div className="flex justify-between items-center font-label-xs">
                              <span className="font-medium text-on-surface">
                                {c.submitted} / {c.total} Submitted
                              </span>
                              <span className="font-semibold text-primary-container tabular-nums">
                                {percent}%
                              </span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-surface-container overflow-hidden">
                              <div
                                className="h-full bg-primary-container rounded-full transition-all duration-500"
                                style={{ width: `${percent}%` }}
                              ></div>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-space-xs font-label-sm text-secondary">
                            <span className="material-symbols-outlined text-[16px]">edit_note</span>
                            <span>Drafting Challenge Config</span>
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-space-md whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-label-sm text-on-surface">
                          <span className="material-symbols-outlined text-[16px] text-secondary">
                            date_range
                          </span>
                          <span>{c.dates}</span>
                        </div>
                      </td>
                      <td
                        className="py-4 px-space-md text-right pr-space-lg whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-space-xs">
                          <button
                            onClick={() => setSelectedContest(c)}
                            className="px-space-sm py-1.5 rounded bg-primary-container hover:bg-[#166534] text-on-primary font-label-xs font-medium transition-colors"
                          >
                            Manage
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="py-12 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center text-secondary mb-3">
                        <span className="material-symbols-outlined text-[24px]">search_off</span>
                      </div>
                      <h4 className="font-headline-sm font-semibold text-on-surface">No Contests Found</h4>
                      <p className="font-body-sm text-secondary mt-1">
                        No benchmarks match &quot;{searchQuery}&quot;.
                      </p>
                      <button
                        onClick={() => {
                          setSearchQuery("");
                          setStatusFilter("All");
                        }}
                        className="mt-3 px-3.5 py-1.5 rounded bg-surface-container-low hover:bg-surface-container text-on-surface font-label-sm border border-[#e2e8f0]"
                      >
                        Reset Search
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer */}
        <div className="p-space-sm px-space-md bg-surface-container-low flex flex-col sm:flex-row items-center justify-between gap-space-sm font-label-sm text-secondary border-t border-[#e2e8f0]">
          <div className="flex items-center gap-space-sm">
            <span>
              Showing <strong className="text-on-surface">{filteredContests.length}</strong> of{" "}
              <strong className="text-on-surface">{contests.length}</strong> database benchmarks
            </span>
            <span className="text-secondary/40">•</span>
            <span className="hidden sm:inline">Click row to open participant assignment & inspector</span>
          </div>
        </div>
      </div>

      {/* Operational Bento Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md mt-space-lg">
        <div className="p-space-md bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-secondary mb-space-sm">
            <span className="font-label-xs uppercase tracking-wider">Evaluation Velocity</span>
            <span className="material-symbols-outlined text-[18px] text-primary-container">
              speed
            </span>
          </div>
          <div className="flex items-baseline gap-space-xs">
            <span className="font-display-lg text-on-surface tabular-nums">
              {DEMO_METRICS.evaluationVelocity.value}
            </span>
            <span className="font-label-xs text-primary-container font-semibold flex items-center">
              <span className="material-symbols-outlined text-[14px]">arrow_upward</span>
              {DEMO_METRICS.evaluationVelocity.change}
            </span>
          </div>
          <p className="font-body-sm text-secondary mt-1">
            Real-time auto-grading and rubric matrix synchronization.
          </p>
        </div>

        <div className="p-space-md bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-secondary mb-space-sm">
            <span className="font-label-xs uppercase tracking-wider">Database Security Index</span>
            <span className="material-symbols-outlined text-[18px] text-tertiary">security</span>
          </div>
          <div className="flex items-baseline gap-space-xs">
            <span className="font-display-lg text-on-surface tabular-nums">
              100%
            </span>
            <span className="font-label-xs text-primary-container font-medium">
              RLS & Triggers Verified
            </span>
          </div>
          <p className="font-body-sm text-secondary mt-1">
            Answer key isolation, role integrity checks, and deadline enforcement active.
          </p>
        </div>

        <div className="p-space-md bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-secondary mb-space-sm">
            <span className="font-label-xs uppercase tracking-wider">Active Cohort Enrollment</span>
            <span className="material-symbols-outlined text-[18px] text-secondary">
              groups
            </span>
          </div>
          <div className="flex items-baseline gap-space-xs">
            <span className="font-display-lg text-on-surface tabular-nums">
              {contests.reduce((acc, c) => acc + c.participants.length, 0)}
            </span>
            <span className="font-label-xs text-secondary font-medium">
              Assigned Leaders
            </span>
          </div>
          <p className="font-body-sm text-secondary mt-1">
            Campus Leadership Programme 2025 cohort roster.
          </p>
        </div>
      </div>

      {/* Create Contest Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-inverse-surface/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-lg border border-[#e2e8f0] max-w-lg w-full p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#e2e8f0]">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary-container">add_circle</span>
                <h3 className="font-headline-sm font-semibold text-on-surface">
                  Create New Assessment Contest
                </h3>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 rounded text-secondary hover:text-on-surface"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <form onSubmit={handleCreateContest} className="flex flex-col gap-3 font-body-sm">
              <div>
                <label className="font-label-xs text-secondary uppercase font-semibold block mb-1">
                  Contest Title *
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. AI-Driven Supply Chain Strategy 2025"
                  className="w-full px-3 py-2 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface font-body-sm focus:outline-none focus:border-primary-container"
                />
              </div>

              <div>
                <label className="font-label-xs text-secondary uppercase font-semibold block mb-1">
                  Track / Discipline *
                </label>
                <input
                  type="text"
                  required
                  value={newTrack}
                  onChange={(e) => setNewTrack(e.target.value)}
                  placeholder="e.g. Track B · Operational Strategy"
                  className="w-full px-3 py-2 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface font-body-sm focus:outline-none focus:border-primary-container"
                />
              </div>

              <div>
                <label className="font-label-xs text-secondary uppercase font-semibold block mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Summary of benchmark challenge objectives..."
                  className="w-full px-3 py-2 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface font-body-sm focus:outline-none focus:border-primary-container resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-label-xs text-secondary uppercase font-semibold block mb-1">
                    Start Date & Time (Asia/Dhaka) *
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={newStartDate}
                    onChange={(e) => setNewStartDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface font-label-xs focus:outline-none focus:border-primary-container"
                  />
                  <span className="text-[10px] text-secondary mt-0.5 block">Defaults to current time</span>
                </div>
                <div>
                  <label className="font-label-xs text-secondary uppercase font-semibold block mb-1">
                    End Date & Time (Asia/Dhaka) *
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={newEndDate}
                    onChange={(e) => setNewEndDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface font-label-xs focus:outline-none focus:border-primary-container"
                  />
                  <span className="text-[10px] text-secondary mt-0.5 block">Must be after start time</span>
                </div>
              </div>

              <div>
                <label className="font-label-xs text-secondary uppercase font-semibold block mb-1">
                  Initial Status
                </label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-1.5 cursor-pointer text-on-surface">
                    <input
                      type="radio"
                      name="status"
                      checked={newStatus === "LIVE"}
                      onChange={() => setNewStatus("LIVE")}
                      className="accent-primary-container"
                    />
                    <span>Live (Active for Participants)</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer text-on-surface">
                    <input
                      type="radio"
                      name="status"
                      checked={newStatus === "DRAFT"}
                      onChange={() => setNewStatus("DRAFT")}
                      className="accent-primary-container"
                    />
                    <span>Draft</span>
                  </label>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-surface-container-low border border-[#e2e8f0] flex items-center justify-between gap-3">
                <div className="flex flex-col">
                  <span className="font-label-xs font-semibold uppercase text-secondary">
                    Sequential Progression
                  </span>
                  <span className="text-xs text-on-surface">
                    Enforce Sequential Progression (Lock upcoming units until current is completed)
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={newEnforceSequentialProgress}
                  onChange={(e) => setNewEnforceSequentialProgress(e.target.checked)}
                  className="w-4 h-4 text-primary-container accent-[#15803d] rounded cursor-pointer shrink-0"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#e2e8f0]">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded bg-surface-container-high hover:bg-surface-container text-on-surface font-label-md border border-[#e2e8f0]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingContest}
                  className="px-5 py-2 rounded bg-primary-container hover:bg-[#166534] text-on-primary font-label-md font-medium shadow-2xs flex items-center gap-1.5"
                >
                  {isSubmittingContest && (
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  )}
                  <span>Save Contest to Database</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Linear-Style Slide-Over Drawer */}
      {selectedContest && (
        <div
          className="fixed inset-0 bg-inverse-surface/40 backdrop-blur-xs z-50 flex justify-end transition-opacity"
          onClick={() => setSelectedContest(null)}
        >
          <div
            className="w-full max-w-xl bg-surface-container-lowest h-full shadow-2xl p-space-lg flex flex-col justify-between border-l border-[#e2e8f0]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col overflow-y-auto pr-1">
              {/* Drawer Header */}
              <div className="flex items-center justify-between pb-space-md border-b border-[#f1f5f9]">
                <div className="flex items-center gap-space-xs flex-wrap">
                  <select
                    value={selectedContest.status}
                    onChange={(e) =>
                      handleChangeStatus(
                        selectedContest.id,
                        e.target.value as "DRAFT" | "LIVE" | "COMPLETED" | "ARCHIVED"
                      )
                    }
                    className="px-2 py-0.5 rounded bg-surface-container font-label-xs font-semibold text-on-surface border border-[#e2e8f0] focus:outline-none"
                    title="Change Contest Lifecycle Status"
                  >
                    <option value="DRAFT">DRAFT</option>
                    <option value="LIVE">LIVE</option>
                    <option value="COMPLETED">COMPLETED</option>
                    <option value="ARCHIVED">ARCHIVED</option>
                  </select>
                  <button
                    onClick={() => openEditModal(selectedContest)}
                    className="px-2 py-0.5 rounded bg-surface-container-high hover:bg-surface-container text-on-surface font-label-xs font-medium border border-[#e2e8f0] flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[13px]">edit</span>
                    Edit
                  </button>
                  <span className="font-label-xs text-secondary font-mono truncate max-w-[140px]">
                    ID: {selectedContest.id.slice(0, 8)}...
                  </span>
                </div>
                <button
                  onClick={() => setSelectedContest(null)}
                  className="p-1 rounded text-secondary hover:text-on-surface hover:bg-surface-container"
                  aria-label="Close inspector"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>

              {/* Title Lockup */}
              <h2 className="font-headline-lg text-on-surface tracking-tight mt-3">
                {selectedContest.name}
              </h2>
              <p className="font-body-md text-secondary mt-1">{selectedContest.stage}</p>

              {/* Metric Strip */}
              <div className="grid grid-cols-2 gap-space-sm my-space-md">
                <div className="p-space-sm bg-surface-container-low rounded border border-[#e2e8f0]">
                  <span className="font-label-xs text-secondary block">Participation Rate</span>
                  <span className="font-headline-md text-primary-container font-bold tabular-nums">
                    {selectedContest.total > 0
                      ? Math.round((selectedContest.submitted / selectedContest.total) * 100)
                      : 0}
                    %
                  </span>
                  <span className="font-label-xs text-secondary">
                    {selectedContest.submitted} of {selectedContest.total} enrolled
                  </span>
                </div>
                <div className="p-space-sm bg-surface-container-low rounded border border-[#e2e8f0]">
                  <span className="font-label-xs text-secondary block">Benchmark Track</span>
                  <span className="font-headline-md text-on-surface font-bold truncate block">
                    {selectedContest.track}
                  </span>
                  <span className="font-label-xs text-primary-container font-medium">
                    {selectedContest.dates}
                  </span>
                </div>
              </div>

              {/* Sequential Progression Quick Toggle */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-surface-container-low border border-[#e2e8f0] my-2">
                <div className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-[18px] text-secondary">
                    {selectedContest.enforceSequentialProgress ? "lock" : "lock_open"}
                  </span>
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-on-surface">
                      {selectedContest.enforceSequentialProgress
                        ? "Sequential Progression Enforced"
                        : "Flexible Progression (All Units Open)"}
                    </span>
                    <span className="text-[10px] text-secondary">
                      {selectedContest.enforceSequentialProgress
                        ? "Upcoming units are locked until preceding units are completed"
                        : "Candidates can jump freely between any phase and unit"}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    const nextVal = !selectedContest.enforceSequentialProgress;
                    const res = await updateContestAction(selectedContest.id, { enforceSequentialProgress: nextVal });
                    if (res.success) {
                      await fetchContests();
                    }
                  }}
                  className="px-2.5 py-1 rounded text-xs font-semibold border border-[#e2e8f0] bg-surface-container-high hover:bg-surface-container text-on-surface transition-colors cursor-pointer shrink-0"
                >
                  {selectedContest.enforceSequentialProgress ? "Disable Lock" : "Enable Lock"}
                </button>
              </div>

              {/* Participant Enrollment Hub */}
              <div className="bg-surface-container-low p-4 rounded-lg border border-[#e2e8f0] my-2">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-label-xs uppercase tracking-wider text-secondary font-semibold flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px] text-primary-container">group_add</span>
                    Participant Enrollment
                  </span>
                  {/* Tab switcher */}
                  <div className="flex items-center bg-surface-container p-0.5 rounded border border-[#e2e8f0]">
                    <button
                      type="button"
                      onClick={() => setEnrollTab("SELECT")}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                        enrollTab === "SELECT"
                          ? "bg-surface-container-lowest text-on-surface font-semibold shadow-2xs"
                          : "text-secondary hover:text-on-surface"
                      }`}
                    >
                      Search & Select {selectedParticipantIds.length > 0 && `(${selectedParticipantIds.length})`}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEnrollTab("CSV")}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                        enrollTab === "CSV"
                          ? "bg-surface-container-lowest text-on-surface font-semibold shadow-2xs"
                          : "text-secondary hover:text-on-surface"
                      }`}
                    >
                      Bulk CSV
                    </button>
                    <button
                      type="button"
                      onClick={() => setEnrollTab("SINGLE")}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                        enrollTab === "SINGLE"
                          ? "bg-surface-container-lowest text-on-surface font-semibold shadow-2xs"
                          : "text-secondary hover:text-on-surface"
                      }`}
                    >
                      Single Account
                    </button>
                  </div>
                </div>

                {/* TAB 1: Search & Multi-Select */}
                {enrollTab === "SELECT" && (
                  <div className="flex flex-col gap-2.5">
                    {/* Search and Quick Selection Actions */}
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[16px] text-secondary">
                          search
                        </span>
                        <input
                          type="text"
                          value={participantSearch}
                          onChange={(e) => setParticipantSearch(e.target.value)}
                          placeholder="Search participants by name, email, or candidate ID..."
                          className="w-full pl-8 pr-2.5 py-1.5 rounded bg-surface-container-lowest border border-[#e2e8f0] font-label-xs text-on-surface focus:outline-none focus:border-primary-container"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleSelectAllEligible}
                        className="px-2 py-1.5 rounded bg-surface-container hover:bg-surface-container-high border border-[#e2e8f0] text-secondary hover:text-on-surface text-[11px] font-medium whitespace-nowrap cursor-pointer"
                        title="Select all unenrolled participants in the filtered list"
                      >
                        Select All
                      </button>
                      <button
                        type="button"
                        onClick={handleClearSelection}
                        disabled={selectedParticipantIds.length === 0}
                        className="px-2 py-1.5 rounded bg-surface-container hover:bg-surface-container-high border border-[#e2e8f0] text-secondary hover:text-on-surface text-[11px] font-medium whitespace-nowrap disabled:opacity-50 cursor-pointer"
                      >
                        Clear
                      </button>
                    </div>

                    {/* Participant Checklist */}
                    <div className="max-h-52 overflow-y-auto rounded border border-[#e2e8f0] bg-surface-container-lowest divide-y divide-[#f1f5f9]">
                      {availableParticipants.length === 0 ? (
                        <div className="p-3 text-center text-secondary text-xs">
                          No participant accounts found in the database.
                        </div>
                      ) : (
                        availableParticipants
                          .filter((p) => {
                            const query = participantSearch.toLowerCase();
                            return (
                              p.name.toLowerCase().includes(query) ||
                              p.email.toLowerCase().includes(query) ||
                              (p.candidateId && p.candidateId.toLowerCase().includes(query))
                            );
                          })
                          .map((p) => {
                            const isSelected = selectedParticipantIds.includes(p.id);
                            return (
                              <label
                                key={p.id}
                                className={`flex items-center justify-between p-2 text-xs transition-colors cursor-pointer ${
                                  p.isEnrolled
                                    ? "bg-surface-container-low/50 opacity-70 cursor-not-allowed"
                                    : isSelected
                                    ? "bg-primary-container/10"
                                    : "hover:bg-surface-container-low"
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <input
                                    type="checkbox"
                                    disabled={p.isEnrolled}
                                    checked={p.isEnrolled || isSelected}
                                    onChange={() => !p.isEnrolled && handleToggleParticipant(p.id)}
                                    className="w-4 h-4 rounded text-primary-container accent-primary-container cursor-pointer disabled:cursor-not-allowed"
                                  />
                                  <div className="flex flex-col min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-semibold text-on-surface truncate">{p.name}</span>
                                      {p.candidateId && (
                                        <span className="px-1.5 py-0.2 rounded bg-surface-container text-secondary text-[10px] font-mono">
                                          {p.candidateId}
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-secondary text-[11px] truncate">{p.email}</span>
                                  </div>
                                </div>
                                <div>
                                  {p.isEnrolled ? (
                                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase">
                                      Enrolled
                                    </span>
                                  ) : isSelected ? (
                                    <span className="px-2 py-0.5 rounded-full bg-primary-container/20 text-primary-container text-[10px] font-semibold">
                                      Selected
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-secondary">Eligible</span>
                                  )}
                                </div>
                              </label>
                            );
                          })
                      )}
                    </div>

                    {/* Feedback and Batch Enroll Action */}
                    <div className="flex items-center justify-between pt-1">
                      {enrollBatchMsg ? (
                        <span
                          className={`text-xs font-medium ${
                            enrollBatchMsg.type === "success" ? "text-emerald-700" : "text-error"
                          }`}
                        >
                          {enrollBatchMsg.text}
                        </span>
                      ) : (
                        <span className="text-[11px] text-secondary">
                          {selectedParticipantIds.length} candidate(s) selected
                        </span>
                      )}
                      <button
                        type="button"
                        disabled={selectedParticipantIds.length === 0 || isEnrollingBatch}
                        onClick={handleBatchEnroll}
                        className="px-3.5 py-1.5 rounded bg-primary-container hover:bg-[#166534] text-on-primary font-label-xs font-semibold shadow-2xs flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      >
                        {isEnrollingBatch && (
                          <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                        )}
                        <span>Enroll Selected ({selectedParticipantIds.length})</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* TAB 2: Bulk CSV Upload */}
                {enrollTab === "CSV" && (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-col gap-1">
                        <p className="text-[11px] text-secondary leading-tight">
                          Upload or paste a CSV file to enroll participants. <strong className="text-on-surface">Only existing PARTICIPANT accounts</strong> created by Admin in the Participants Directory can be enrolled.
                        </p>
                        <p className="text-[10px] text-secondary">
                          Columns: <code className="bg-surface-container-high px-1 py-0.5 rounded font-mono text-[10px]">Email</code>, <code className="bg-surface-container-high px-1 py-0.5 rounded font-mono text-[10px]">CandidateId</code>, <code className="bg-surface-container-high px-1 py-0.5 rounded font-mono text-[10px]">Notes</code> (optional). Supply Email, CandidateId, or both.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleDownloadCsvTemplate}
                        className="px-2.5 py-1 rounded bg-surface-container hover:bg-surface-container-high border border-[#e2e8f0] text-secondary hover:text-on-surface text-[11px] font-medium flex items-center gap-1 whitespace-nowrap cursor-pointer shrink-0"
                      >
                        <span className="material-symbols-outlined text-[14px]">download</span>
                        Template
                      </button>
                    </div>

                    <textarea
                      rows={4}
                      value={csvText}
                      onChange={(e) => {
                        setCsvText(e.target.value);
                        setCsvPreview(null);
                        setBulkCsvResult(null);
                      }}
                      placeholder={`Email,CandidateId,Notes\n# Example with real accounts (replace with existing participants):\nalice@campus.edu,ACI-1001,Leadership Track\nbob@campus.edu,,Operations Track\n,ACI-2002,`}
                      className="w-full px-3 py-2 rounded bg-surface-container-lowest border border-[#e2e8f0] text-on-surface font-mono text-xs focus:outline-none focus:border-primary-container resize-none"
                    />

                    {/* Action buttons bar */}
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[11px] text-secondary flex items-center gap-1 cursor-pointer hover:text-on-surface">
                        <span className="material-symbols-outlined text-[16px]">upload_file</span>
                        <span>Choose CSV file</span>
                        <input
                          type="file"
                          accept=".csv,text/csv"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = (evt) => {
                                const content = evt.target?.result;
                                if (typeof content === "string") {
                                  setCsvText(content);
                                  setCsvPreview(null);
                                  setBulkCsvResult(null);
                                }
                              };
                              reader.readAsText(file);
                            }
                          }}
                        />
                      </label>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={!csvText.trim() || isPreviewingCsv || isUploadingCsv}
                          onClick={handlePreviewCsv}
                          className="px-3 py-1.5 rounded bg-surface-container hover:bg-surface-container-high border border-[#e2e8f0] text-on-surface font-label-xs font-semibold shadow-2xs flex items-center gap-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                          {isPreviewingCsv ? (
                            <span className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin"></span>
                          ) : (
                            <span className="material-symbols-outlined text-[14px]">preview</span>
                          )}
                          <span>Preview CSV</span>
                        </button>

                        <button
                          type="button"
                          disabled={!csvText.trim() || isUploadingCsv || isPreviewingCsv}
                          onClick={handleProcessCsvEnrollment}
                          className="px-3.5 py-1.5 rounded bg-primary-container hover:bg-[#166534] text-on-primary font-label-xs font-semibold shadow-2xs flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                          {isUploadingCsv && (
                            <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                          )}
                          <span>Enroll CSV</span>
                        </button>
                      </div>
                    </div>

                    {/* CSV Pre-Enrollment Preview Card */}
                    {csvPreview && (
                      <div className="p-3 rounded border border-primary/20 bg-primary/5 flex flex-col gap-2.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-on-surface text-xs flex items-center gap-1">
                            <span className="material-symbols-outlined text-[15px] text-primary">fact_check</span>
                            Enrollment Preview
                          </span>
                          {csvPreview.readyCount > 0 && (
                            <button
                              type="button"
                              disabled={isUploadingCsv}
                              onClick={handleProcessCsvEnrollment}
                              className="px-2.5 py-1 rounded bg-primary-container hover:bg-[#166534] text-on-primary font-label-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                            >
                              {isUploadingCsv && (
                                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                              )}
                              <span>Enroll Matched ({csvPreview.readyCount})</span>
                            </button>
                          )}
                        </div>

                        {csvPreview.error && (
                          <div className="p-2 bg-rose-50 border border-rose-200 text-rose-700 rounded text-[11px]">
                            {csvPreview.error}
                          </div>
                        )}

                        <div className="grid grid-cols-4 gap-2 text-center">
                          <div className="p-1.5 bg-surface-container-low rounded border border-[#e2e8f0]">
                            <span className="text-[10px] text-secondary block">Total Rows</span>
                            <span className="font-bold text-on-surface">{csvPreview.totalRows}</span>
                          </div>
                          <div
                            onClick={() => setPreviewDetailTab("READY")}
                            className={`p-1.5 rounded border cursor-pointer transition-all ${
                              previewDetailTab === "READY"
                                ? "bg-emerald-100 border-emerald-400 ring-1 ring-emerald-400"
                                : "bg-emerald-50 border-emerald-200"
                            }`}
                          >
                            <span className="text-[10px] text-emerald-800 block">Ready to Enroll</span>
                            <span className="font-bold text-emerald-700">{csvPreview.readyCount}</span>
                          </div>
                          <div
                            onClick={() => setPreviewDetailTab("ALREADY_ENROLLED")}
                            className={`p-1.5 rounded border cursor-pointer transition-all ${
                              previewDetailTab === "ALREADY_ENROLLED"
                                ? "bg-amber-100 border-amber-400 ring-1 ring-amber-400"
                                : "bg-amber-50 border-amber-200"
                            }`}
                          >
                            <span className="text-[10px] text-amber-800 block">Already Enrolled</span>
                            <span className="font-bold text-amber-700">{csvPreview.alreadyEnrolledCount}</span>
                          </div>
                          <div
                            onClick={() => setPreviewDetailTab("INVALID")}
                            className={`p-1.5 rounded border cursor-pointer transition-all ${
                              previewDetailTab === "INVALID"
                                ? "bg-rose-100 border-rose-400 ring-1 ring-rose-400"
                                : "bg-rose-50 border-rose-200"
                            }`}
                          >
                            <span className="text-[10px] text-rose-800 block">Invalid</span>
                            <span className="font-bold text-rose-700">{csvPreview.invalidCount}</span>
                          </div>
                        </div>

                        {/* Interactive Preview Details List */}
                        <div className="max-h-36 overflow-y-auto space-y-1 text-[11px] pt-1">
                          {previewDetailTab === "READY" && (
                            <>
                              {csvPreview.ready.length === 0 ? (
                                <p className="text-secondary italic text-center py-2 text-[11px]">No rows ready for new enrollment.</p>
                              ) : (
                                csvPreview.ready.map((r, idx) => (
                                  <div key={`ready-${idx}`} className="flex items-center justify-between p-1 rounded bg-white border border-emerald-100 text-emerald-900">
                                    <span className="font-medium">
                                      Row {r.row}: {r.name || r.identifier}
                                    </span>
                                    <span className="text-[10px] text-secondary">
                                      {r.email} {r.candidateId ? `· ${r.candidateId}` : ""}
                                    </span>
                                  </div>
                                ))
                              )}
                            </>
                          )}

                          {previewDetailTab === "ALREADY_ENROLLED" && (
                            <>
                              {csvPreview.alreadyEnrolled.length === 0 ? (
                                <p className="text-secondary italic text-center py-2 text-[11px]">No duplicate or already-enrolled participants.</p>
                              ) : (
                                csvPreview.alreadyEnrolled.map((s, idx) => (
                                  <div key={`already-${idx}`} className="flex items-center justify-between p-1 rounded bg-white border border-amber-100 text-amber-800">
                                    <span className="truncate">Row {s.row}: {s.name || s.identifier}</span>
                                    <span className="text-[10px] font-medium shrink-0 ml-2">{s.reason}</span>
                                  </div>
                                ))
                              )}
                            </>
                          )}

                          {previewDetailTab === "INVALID" && (
                            <>
                              {csvPreview.invalid.length === 0 ? (
                                <p className="text-secondary italic text-center py-2 text-[11px]">Zero invalid rows detected.</p>
                              ) : (
                                csvPreview.invalid.map((inv, idx) => (
                                  <div key={`inv-${idx}`} className="flex items-start justify-between p-1 rounded bg-white border border-rose-100 text-rose-700 gap-2">
                                    <span className="font-medium shrink-0">Row {inv.row}: {inv.identifier}</span>
                                    <span className="text-[10px] text-right">{inv.reason}</span>
                                  </div>
                                ))
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    {/* CSV Summary Report Card */}
                    {bulkCsvResult && (
                      <div className="p-3 rounded border border-[#e2e8f0] bg-surface-container-lowest flex flex-col gap-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-on-surface text-xs flex items-center gap-1">
                            <span className="material-symbols-outlined text-[15px] text-primary-container">task_alt</span>
                            Enrollment Results
                          </span>
                          <span className="text-[11px] text-secondary">
                            {bulkCsvResult.enrolledCount > 0 ? "Enrollment completed" : "No new accounts enrolled"}
                          </span>
                        </div>

                        <div className="grid grid-cols-4 gap-2 text-center">
                          <div className="p-1.5 bg-surface-container-low rounded border border-[#e2e8f0]">
                            <span className="text-[10px] text-secondary block">Total Rows</span>
                            <span className="font-bold text-on-surface">{bulkCsvResult.totalRows}</span>
                          </div>
                          <div className="p-1.5 bg-emerald-50 rounded border border-emerald-200">
                            <span className="text-[10px] text-emerald-800 block">Enrolled</span>
                            <span className="font-bold text-emerald-700">{bulkCsvResult.enrolledCount}</span>
                          </div>
                          <div className="p-1.5 bg-amber-50 rounded border border-amber-200">
                            <span className="text-[10px] text-amber-800 block">Skipped</span>
                            <span className="font-bold text-amber-700">{bulkCsvResult.skippedCount}</span>
                          </div>
                          <div className="p-1.5 bg-rose-50 rounded border border-rose-200">
                            <span className="text-[10px] text-rose-800 block">Invalid</span>
                            <span className="font-bold text-rose-700">{bulkCsvResult.invalidCount}</span>
                          </div>
                        </div>

                        {/* Details of skipped / invalid rows */}
                        {(bulkCsvResult.skipped.length > 0 || bulkCsvResult.invalid.length > 0) && (
                          <div className="max-h-28 overflow-y-auto space-y-1 text-[11px] pt-1">
                            {bulkCsvResult.skipped.map((s, idx) => (
                              <div key={`skip-${idx}`} className="flex items-center justify-between text-amber-700">
                                <span className="truncate">Row {s.row} ({s.identifier})</span>
                                <span className="font-medium text-[10px]">{s.reason}</span>
                              </div>
                            ))}
                            {bulkCsvResult.invalid.map((inv, idx) => (
                              <div key={`inv-${idx}`} className="flex items-center justify-between text-rose-700">
                                <span className="truncate">Row {inv.row} ({inv.identifier})</span>
                                <span className="font-medium text-[10px]">{inv.reason}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 3: Single Quick Assign */}
                {enrollTab === "SINGLE" && (
                  <form onSubmit={handleAssignParticipant} className="flex flex-col gap-2">
                    <p className="text-[11px] text-secondary">
                      Enroll an existing participant account directly by entering their registered email.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="email"
                        required
                        value={assignEmail}
                        onChange={(e) => setAssignEmail(e.target.value)}
                        placeholder="Candidate Email (e.g. user@acme.edu)"
                        className="px-2.5 py-1.5 rounded bg-surface-container-lowest border border-[#e2e8f0] font-label-xs text-on-surface focus:outline-none focus:border-primary-container"
                      />
                      <input
                        type="text"
                        value={assignName}
                        onChange={(e) => setAssignName(e.target.value)}
                        placeholder="Candidate Name (Optional)"
                        className="px-2.5 py-1.5 rounded bg-surface-container-lowest border border-[#e2e8f0] font-label-xs text-on-surface focus:outline-none focus:border-primary-container"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      {assignMessage && (
                        <span className="font-label-xs text-primary-container truncate">{assignMessage}</span>
                      )}
                      <button
                        type="submit"
                        disabled={isAssigning}
                        className="ml-auto px-3.5 py-1.5 rounded bg-primary-container hover:bg-[#166534] text-on-primary font-label-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        {isAssigning && (
                          <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                        )}
                        <span>Enroll Candidate</span>
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Enrolled Participants List */}
              <div className="mt-space-md flex flex-col gap-space-xs">
                <span className="font-label-xs uppercase tracking-wider text-secondary font-semibold">
                  Enrolled Participants ({selectedContest.participants.length})
                </span>
                <div className="divide-y divide-[#f1f5f9] text-body-sm max-h-48 overflow-y-auto">
                  {selectedContest.participants.length > 0 ? (
                    selectedContest.participants.map((p) => (
                      <div key={p.id} className="py-2 flex items-center justify-between">
                        <div className="flex items-center gap-space-xs">
                          <div className="w-6 h-6 rounded-full bg-primary-fixed flex items-center justify-center font-label-xs font-bold text-on-primary-fixed">
                            {p.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="flex flex-col">
                            <span className="text-on-surface font-medium text-xs">{p.name}</span>
                            <span className="text-secondary text-[10px]">{p.email}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-label-xs px-2 py-0.5 rounded-full bg-surface-container font-medium text-secondary">
                            {p.status}
                          </span>
                          <button
                            onClick={() => handleRemoveParticipant(selectedContest.id, p.id, p.name)}
                            className="p-1 text-secondary hover:text-error hover:bg-error/10 rounded transition-colors cursor-pointer"
                            title="Unenroll participant"
                          >
                            <span className="material-symbols-outlined text-[16px]">person_remove</span>
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="py-2 text-secondary font-body-sm italic">
                      No candidates enrolled yet. Use the form above to assign.
                    </p>
                  )}
                </div>
              </div>

              {/* Evaluation Rubrics */}
              <div className="flex flex-col gap-space-sm mt-space-md">
                <span className="font-label-xs uppercase tracking-wider text-secondary font-semibold">
                  Evaluation Rubric Matrix
                </span>
                <div className="space-y-space-sm">
                  {selectedContest.rubrics.map((rubric) => (
                    <div key={rubric.name}>
                      <div className="flex justify-between font-label-xs mb-1">
                        <span className="text-on-surface font-medium">{rubric.name}</span>
                        <span className="text-secondary tabular-nums">
                          {rubric.weight}% weight
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-surface-container rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary-container rounded-full"
                          style={{ width: `${rubric.passRate}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Contest-Specific Monitoring & Telemetry Settings */}
              <div className="bg-surface-container-low p-4 rounded-lg border border-[#e2e8f0] mt-space-md">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-label-xs uppercase tracking-wider text-secondary font-semibold flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px] text-primary-container">sensors</span>
                    Contest Monitoring & Proctoring Policies
                  </span>
                  {monitoringSaveSuccess && (
                    <span className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">check</span> Saved
                    </span>
                  )}
                </div>

                <p className="text-[11px] text-secondary mb-3 leading-relaxed">
                  Configure active candidate telemetry rules. Candidates must acknowledge these policies before entering the assessment.
                </p>

                <div className="flex flex-col gap-2.5 text-xs font-body-sm">
                  {/* 1. Camera */}
                  <label className="flex items-center justify-between p-2 rounded bg-surface-container-lowest border border-[#e2e8f0] cursor-pointer hover:border-primary-container/40">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px] text-secondary">videocam</span>
                      <div className="flex flex-col">
                        <span className="font-semibold text-on-surface">Camera / Webcam Permission</span>
                        <span className="text-[10px] text-secondary">Verify camera availability & permission state</span>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={monitoringSettings.cameraEnabled}
                      onChange={(e) => setMonitoringSettings((prev) => ({ ...prev, cameraEnabled: e.target.checked }))}
                      className="w-4 h-4 text-primary-container rounded cursor-pointer"
                    />
                  </label>

                  {/* 2. Microphone */}
                  <label className="flex items-center justify-between p-2 rounded bg-surface-container-lowest border border-[#e2e8f0] cursor-pointer hover:border-primary-container/40">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px] text-secondary">mic</span>
                      <div className="flex flex-col">
                        <span className="font-semibold text-on-surface">Microphone Telemetry</span>
                        <span className="text-[10px] text-secondary">Verify audio permission & capture status</span>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={monitoringSettings.micEnabled}
                      onChange={(e) => setMonitoringSettings((prev) => ({ ...prev, micEnabled: e.target.checked }))}
                      className="w-4 h-4 text-primary-container rounded cursor-pointer"
                    />
                  </label>

                  {/* 3. Fullscreen Tracking */}
                  <label className="flex items-center justify-between p-2 rounded bg-surface-container-lowest border border-[#e2e8f0] cursor-pointer hover:border-primary-container/40">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px] text-secondary">fullscreen</span>
                      <div className="flex flex-col">
                        <span className="font-semibold text-on-surface">Fullscreen Requirement</span>
                        <span className="text-[10px] text-secondary">Enforce fullscreen view and track exit events</span>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={monitoringSettings.fullscreenEnabled}
                      onChange={(e) => setMonitoringSettings((prev) => ({ ...prev, fullscreenEnabled: e.target.checked }))}
                      className="w-4 h-4 text-primary-container rounded cursor-pointer"
                    />
                  </label>

                  {/* 4. Tab Switch Tracking */}
                  <label className="flex items-center justify-between p-2 rounded bg-surface-container-lowest border border-[#e2e8f0] cursor-pointer hover:border-primary-container/40">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px] text-secondary">tab</span>
                      <div className="flex flex-col">
                        <span className="font-semibold text-on-surface">Tab Switch & Focus Detection</span>
                        <span className="text-[10px] text-secondary">Track browser window blur and visibility changes</span>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={monitoringSettings.tabSwitchEnabled}
                      onChange={(e) => setMonitoringSettings((prev) => ({ ...prev, tabSwitchEnabled: e.target.checked }))}
                      className="w-4 h-4 text-primary-container rounded cursor-pointer"
                    />
                  </label>

                  {/* 5. Live Screen Sharing */}
                  <div className="flex items-center justify-between p-2 rounded bg-surface-container-lowest/60 border border-[#e2e8f0] opacity-75">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px] text-secondary">screen_share</span>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-on-surface">Live Screen Streaming</span>
                          <span className="px-1.5 py-0.2 bg-amber-100 text-amber-800 rounded text-[9px] font-bold uppercase">Not Available</span>
                        </div>
                        <span className="text-[10px] text-secondary">Requires WebRTC cluster. Telemetry events active instead.</span>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      disabled
                      checked={false}
                      className="w-4 h-4 text-secondary rounded cursor-not-allowed"
                    />
                  </div>

                  {/* 6. Live Webcam Streaming */}
                  <div className="flex items-center justify-between p-2 rounded bg-surface-container-lowest/60 border border-[#e2e8f0] opacity-75">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px] text-secondary">nest_cam_wired_stand</span>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-on-surface">Live Video Broadcasting</span>
                          <span className="px-1.5 py-0.2 bg-amber-100 text-amber-800 rounded text-[9px] font-bold uppercase">Not Available</span>
                        </div>
                        <span className="text-[10px] text-secondary">Requires media gateway. Telemetry events active instead.</span>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      disabled
                      checked={false}
                      className="w-4 h-4 text-secondary rounded cursor-not-allowed"
                    />
                  </div>

                  <div className="pt-2 flex items-center justify-end">
                    <button
                      type="button"
                      disabled={isSavingMonitoring}
                      onClick={handleSaveMonitoringSettings}
                      className="px-3 py-1.5 rounded bg-primary-container hover:bg-[#166534] text-on-primary font-label-xs font-semibold shadow-2xs flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      {isSavingMonitoring ? "Saving..." : "Save Monitoring Settings"}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Drawer Footer Actions */}
            <div className="pt-space-md flex items-center justify-between border-t border-[#f1f5f9]">
              <button
                onClick={() => handleDeleteContest(selectedContest.id, selectedContest.name)}
                className="px-3 py-1.5 rounded text-error hover:bg-error/10 font-label-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">delete</span>
                Delete
              </button>
              <div className="flex items-center gap-space-sm">
                <Link
                  href={`/admin/monitoring?contestId=${selectedContest.id}`}
                  className="px-3 py-1.5 rounded bg-surface-container-high hover:bg-surface-container text-on-surface font-label-xs font-medium border border-[#e2e8f0] flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[14px] text-primary-container">sensors</span>
                  Monitoring Roster
                </Link>
                <Link
                  href="/admin/tasks"
                  className="px-3 py-1.5 rounded bg-surface-container-high hover:bg-surface-container text-on-surface font-label-xs font-medium border border-[#e2e8f0] flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[14px]">account_tree</span>
                  Task Builder
                </Link>
                <button
                  onClick={() => setSelectedContest(null)}
                  className="px-space-md py-2 rounded bg-surface-container-high hover:bg-surface-container text-on-surface font-label-md transition-colors border border-[#e2e8f0]"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EDIT CONTEST MODAL */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-inverse-surface/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-xl max-w-lg w-full p-space-lg">
            <div className="flex items-center justify-between pb-space-sm border-b border-[#e2e8f0] mb-space-md">
              <h3 className="font-headline-sm font-semibold text-on-surface">Edit Contest Configuration</h3>
              <button onClick={() => setIsEditModalOpen(false)} className="text-secondary hover:text-on-surface">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <form onSubmit={handleUpdateContest} className="space-y-3 font-body-sm">
              <div>
                <label className="font-label-xs text-secondary uppercase font-semibold block mb-1">
                  Contest Title *
                </label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface font-body-sm focus:outline-none focus:border-primary-container"
                />
              </div>
              <div>
                <label className="font-label-xs text-secondary uppercase font-semibold block mb-1">
                  Track / Discipline *
                </label>
                <input
                  type="text"
                  required
                  value={editTrack}
                  onChange={(e) => setEditTrack(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface font-body-sm focus:outline-none focus:border-primary-container"
                />
              </div>
              <div>
                <label className="font-label-xs text-secondary uppercase font-semibold block mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface font-body-sm focus:outline-none focus:border-primary-container resize-none"
                />
              </div>
              <div>
                <label className="font-label-xs text-secondary uppercase font-semibold block mb-1">
                  Lifecycle Status
                </label>
                <select
                  value={editStatus}
                  onChange={(e) =>
                    setEditStatus(e.target.value as "DRAFT" | "LIVE" | "COMPLETED" | "ARCHIVED")
                  }
                  className="w-full px-3 py-2 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface font-body-sm focus:outline-none"
                >
                  <option value="DRAFT">DRAFT</option>
                  <option value="LIVE">LIVE</option>
                  <option value="COMPLETED">COMPLETED</option>
                  <option value="ARCHIVED">ARCHIVED</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-label-xs text-secondary uppercase font-semibold block mb-1">
                    Start Date & Time (Asia/Dhaka)
                  </label>
                  <input
                    type="datetime-local"
                    value={editStartDate}
                    onChange={(e) => setEditStartDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface font-label-xs focus:outline-none focus:border-primary-container"
                  />
                  <span className="text-[10px] text-secondary mt-0.5 block">Asia/Dhaka time (UTC+6)</span>
                </div>
                <div>
                  <label className="font-label-xs text-secondary uppercase font-semibold block mb-1">
                    End Date & Time (Asia/Dhaka)
                  </label>
                  <input
                    type="datetime-local"
                    value={editEndDate}
                    onChange={(e) => setEditEndDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface font-label-xs focus:outline-none focus:border-primary-container"
                  />
                  <span className="text-[10px] text-secondary mt-0.5 block">Participant timers auto-adjust</span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-surface-container-low border border-[#e2e8f0] flex items-center justify-between gap-3">
                <div className="flex flex-col">
                  <span className="font-label-xs font-semibold uppercase text-secondary">
                    Sequential Progression
                  </span>
                  <span className="text-xs text-on-surface">
                    Enforce Sequential Progression (Lock upcoming units until current is completed)
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={editEnforceSequentialProgress}
                  onChange={(e) => setEditEnforceSequentialProgress(e.target.checked)}
                  className="w-4 h-4 text-primary-container accent-[#15803d] rounded cursor-pointer shrink-0"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#e2e8f0]">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 rounded bg-surface-container-high text-on-surface font-label-md border border-[#e2e8f0]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEdit}
                  className="px-5 py-2 rounded bg-primary-container hover:bg-[#166534] text-on-primary font-label-md font-medium"
                >
                  {isSubmittingEdit ? "Updating..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Universal Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={deleteModalState.isOpen}
        title={deleteModalState.title}
        itemDescription={deleteModalState.itemDescription}
        warningDetails={deleteModalState.warningDetails}
        confirmLabel={deleteModalState.confirmLabel}
        isDeleting={isDeletingContest}
        onConfirm={deleteModalState.onConfirm}
        onClose={() => setDeleteModalState((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
