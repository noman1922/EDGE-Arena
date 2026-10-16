"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  getAdminParticipants,
  createParticipantAccountAction,
  updateParticipantStatusAction,
  bulkImportUsersAction,
  type AdminParticipantItem,
  type BulkImportResult,
} from "@/app/actions/participant-actions";
import { getAdminContests, type AdminContestListItem } from "@/app/actions/contest-actions";

export default function AdminParticipantsPage() {
  const [participants, setParticipants] = useState<AdminParticipantItem[]>([]);
  const [contests, setContests] = useState<AdminContestListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"ALL" | "PARTICIPANT" | "EVALUATOR">("ALL");

  // Single Create Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"PARTICIPANT" | "EVALUATOR">("PARTICIPANT");
  const [institution, setInstitution] = useState("National Campus Leadership");
  const [candidateId, setCandidateId] = useState("");
  const [initialPassword, setInitialPassword] = useState("");
  const [assignContestId, setAssignContestId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Bulk Import Modal State
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkCsvText, setBulkCsvText] = useState("");
  const [bulkAssignContestId, setBulkAssignContestId] = useState("");
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkImportResult | null>(null);
  const [bulkGeneralError, setBulkGeneralError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Status Action State
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [parts, contestList] = await Promise.all([
        getAdminParticipants(searchQuery),
        getAdminContests(),
      ]);
      setParticipants(parts);
      setContests(contestList);
    } catch (err) {
      console.error("Error loading participants:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [searchQuery]);

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;

    try {
      setIsSubmitting(true);
      setModalError(null);
      const res = await createParticipantAccountAction({
        name: name.trim(),
        email: email.trim(),
        role,
        institution,
        candidateId: candidateId.trim() || undefined,
        assignContestId: assignContestId || undefined,
        initialPassword: initialPassword.trim() || undefined,
      });

      if (res.success) {
        setIsCreateModalOpen(false);
        setName("");
        setEmail("");
        setCandidateId("");
        setInitialPassword("");
        setActionSuccess(`Account successfully created for ${email}`);
        await loadData();
      } else {
        setModalError(res.error || "Failed to create account.");
      }
    } catch (err) {
      console.error("Create account error:", err);
      setModalError("Unexpected network error.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadTemplate = () => {
    const csvContent =
      "Name,Email,Role,CandidateId,Institution,InitialPassword\n" +
      '"Sarah Jenkins","s.jenkins@campus.edu","PARTICIPANT","ACI-3001-SJ","Faculty of Science","SecureEdge#2025"\n' +
      '"Dr. Aris Thorne","a.thorne@faculty.edu","EVALUATOR","","Academic Examination Board","EvalAccess#2025"\n';

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "edge_arena_users_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setBulkCsvText(text || "");
      setBulkResult(null);
      setBulkGeneralError(null);
    };
    reader.readAsText(file);
  };

  const handleBulkImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkCsvText.trim()) {
      setBulkGeneralError("Please upload a CSV file or paste CSV content.");
      return;
    }

    try {
      setIsBulkSubmitting(true);
      setBulkGeneralError(null);
      setBulkResult(null);

      const res = await bulkImportUsersAction(bulkCsvText, bulkAssignContestId || undefined);
      setBulkResult(res);

      if (res.importedCount > 0) {
        setActionSuccess(`Successfully imported ${res.importedCount} user accounts.`);
        await loadData();
      }
      if (!res.success && res.errors.length > 0) {
        setBulkGeneralError(`Import completed with ${res.errors.length} issue(s). Review details below.`);
      }
    } catch (err) {
      console.error("Bulk import error:", err);
      setBulkGeneralError("An unexpected server error occurred during bulk import.");
    } finally {
      setIsBulkSubmitting(false);
    }
  };

  const handleStatusChange = async (userId: string, newStatus: "ACTIVE" | "DISQUALIFIED" | "WITHDRAWN") => {
    try {
      const res = await updateParticipantStatusAction(userId, newStatus);
      if (res.success) {
        setActionSuccess(`Participant status updated to ${newStatus}`);
        await loadData();
      } else {
        alert(res.error || "Status update failed.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const filteredParticipants = participants.filter((p) => {
    const matchesRole = roleFilter === "ALL" || p.role === roleFilter;
    return matchesRole;
  });

  return (
    <div className="flex flex-col w-full pb-space-xl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-md pt-space-xs pb-space-lg">
        <div>
          <div className="flex items-center gap-space-xs text-secondary font-label-xs uppercase tracking-wider mb-1">
            <span>Administration Suite</span>
            <span>/</span>
            <span className="text-primary-container font-semibold">Enrolled Cohort</span>
          </div>
          <h1 className="font-display-lg text-on-surface">Participants & Accounts</h1>
          <p className="font-body-md text-secondary mt-1">
            Closed-access platform: provision student candidates, academic evaluators, and assign to contests.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          {/* Download Template */}
          <button
            onClick={handleDownloadTemplate}
            type="button"
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-surface-container hover:bg-surface-container-high text-on-surface font-label-sm font-medium rounded border border-[#e2e8f0] transition-colors cursor-pointer"
            title="Download CSV format template"
          >
            <span className="material-symbols-outlined text-[18px] text-secondary">download</span>
            <span>CSV Template</span>
          </button>

          {/* Bulk Import */}
          <button
            onClick={() => {
              setBulkResult(null);
              setBulkGeneralError(null);
              setBulkCsvText("");
              setIsBulkModalOpen(true);
            }}
            type="button"
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-surface-container hover:bg-surface-container-high text-on-surface font-label-sm font-medium rounded border border-[#e2e8f0] transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px] text-primary-container">upload_file</span>
            <span>Bulk CSV Import</span>
          </button>

          {/* Enroll Single */}
          <button
            onClick={() => {
              setModalError(null);
              setIsCreateModalOpen(true);
            }}
            type="button"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-container hover:bg-[#166534] text-on-primary font-label-md font-medium rounded shadow-2xs transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">person_add</span>
            <span>Enroll New Account</span>
          </button>
        </div>
      </div>

      {actionSuccess && (
        <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded font-label-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-emerald-600">check_circle</span>
            {actionSuccess}
          </span>
          <button onClick={() => setActionSuccess(null)} className="text-emerald-700 hover:text-emerald-900 cursor-pointer">
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-surface-container-lowest p-4 rounded-lg border border-[#e2e8f0] shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3 mb-space-md">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative w-full sm:w-80">
            <span className="absolute left-3 top-2.5 material-symbols-outlined text-[18px] text-secondary">search</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, email, candidate ID..."
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface focus:outline-none focus:border-primary-container"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <span className="font-label-xs text-secondary uppercase">Role:</span>
          <div className="inline-flex rounded bg-surface-container-low p-0.5 border border-[#e2e8f0] font-label-xs">
            {(["ALL", "PARTICIPANT", "EVALUATOR"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRoleFilter(r)}
                className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                  roleFilter === r
                    ? "bg-surface-container-lowest text-on-surface font-semibold shadow-2xs"
                    : "text-secondary hover:text-on-surface"
                }`}
              >
                {r === "ALL" ? "All Users" : r}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Participant Table */}
      <div className="bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#e2e8f0] bg-surface-container-low/50 text-secondary font-label-xs uppercase">
                <th className="py-3 px-4 font-semibold">User / Profile</th>
                <th className="py-3 px-4 font-semibold">Role</th>
                <th className="py-3 px-4 font-semibold">Candidate ID</th>
                <th className="py-3 px-4 font-semibold">Institution</th>
                <th className="py-3 px-4 font-semibold">Assigned Contests</th>
                <th className="py-3 px-4 font-semibold">Submissions</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e2e8f0] font-body-sm text-on-surface">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-secondary">
                    <div className="inline-flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-primary-container border-t-transparent rounded-full animate-spin"></span>
                      <span>Loading enrolled accounts...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredParticipants.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-secondary font-body-md">
                    No participants or accounts match your query.
                  </td>
                </tr>
              ) : (
                filteredParticipants.map((p) => (
                  <tr key={p.id} className="hover:bg-surface-container-low/30 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex flex-col">
                        <span className="font-label-sm font-semibold text-on-surface">{p.name}</span>
                        <span className="text-secondary text-xs">{p.email}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded font-label-xs font-semibold ${
                          p.role === "ADMIN"
                            ? "bg-purple-100 text-purple-800"
                            : p.role === "EVALUATOR"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        {p.role}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-secondary">{p.candidateId || "—"}</td>
                    <td className="py-3 px-4 text-xs text-secondary max-w-xs truncate">{p.institution}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-on-surface">{p.enrolledContestsCount}</span>
                        <span className="text-secondary text-xs">assigned</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-on-surface">{p.completedSubmissionsCount}</span>
                        <span className="text-secondary text-xs">submitted</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full font-label-xs font-semibold ${
                          p.status === "ACTIVE"
                            ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                            : p.status === "DISQUALIFIED"
                            ? "bg-red-50 text-red-800 border border-red-200"
                            : "bg-amber-50 text-amber-800 border border-amber-200"
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {p.role === "PARTICIPANT" && (
                        <div className="inline-flex items-center gap-1">
                          {p.status !== "DISQUALIFIED" ? (
                            <button
                              onClick={() => handleStatusChange(p.id, "DISQUALIFIED")}
                              title="Flag or Disqualify Participant"
                              className="px-2 py-1 text-xs rounded bg-red-50 hover:bg-red-100 text-red-700 transition-colors cursor-pointer"
                            >
                              Disqualify
                            </button>
                          ) : (
                            <button
                              onClick={() => handleStatusChange(p.id, "ACTIVE")}
                              title="Reactivate Participant"
                              className="px-2 py-1 text-xs rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition-colors cursor-pointer"
                            >
                              Activate
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Enroll Single Account Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest max-w-md w-full rounded-lg border border-[#e2e8f0] shadow-xl p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#e2e8f0]">
              <h2 className="font-headline-sm text-on-surface font-semibold">Enroll New Account</h2>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-secondary hover:text-on-surface cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {modalError && (
              <div className="p-2.5 rounded bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px]">error</span>
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleCreateAccount} className="flex flex-col gap-3 text-xs font-body-sm">
              <div>
                <label className="font-label-xs uppercase text-secondary font-semibold block mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Johnathan Doe"
                  className="w-full px-3 py-2 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface focus:outline-none focus:border-primary-container"
                />
              </div>

              <div>
                <label className="font-label-xs uppercase text-secondary font-semibold block mb-1">
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="candidate@university.edu"
                  className="w-full px-3 py-2 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface focus:outline-none focus:border-primary-container"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-label-xs uppercase text-secondary font-semibold block mb-1">
                    Role
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as any)}
                    className="w-full px-2.5 py-2 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface focus:outline-none focus:border-primary-container"
                  >
                    <option value="PARTICIPANT">Participant</option>
                    <option value="EVALUATOR">Evaluator</option>
                  </select>
                </div>
                <div>
                  <label className="font-label-xs uppercase text-secondary font-semibold block mb-1">
                    Candidate ID
                  </label>
                  <input
                    type="text"
                    value={candidateId}
                    onChange={(e) => setCandidateId(e.target.value)}
                    placeholder="Auto-generated if blank"
                    className="w-full px-3 py-2 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface focus:outline-none focus:border-primary-container"
                  />
                </div>
              </div>

              <div>
                <label className="font-label-xs uppercase text-secondary font-semibold block mb-1">
                  Initial Password (Optional / Defaults to Secure Default)
                </label>
                <input
                  type="text"
                  value={initialPassword}
                  onChange={(e) => setInitialPassword(e.target.value)}
                  placeholder="Leave blank for auto-generated initial password"
                  className="w-full px-3 py-2 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface focus:outline-none focus:border-primary-container"
                />
              </div>

              <div>
                <label className="font-label-xs uppercase text-secondary font-semibold block mb-1">
                  Institution / Campus
                </label>
                <input
                  type="text"
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                  placeholder="e.g. Dhaka University Faculty of Engineering"
                  className="w-full px-3 py-2 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface focus:outline-none focus:border-primary-container"
                />
              </div>

              <div>
                <label className="font-label-xs uppercase text-secondary font-semibold block mb-1">
                  Assign to Active Contest (Optional)
                </label>
                <select
                  value={assignContestId}
                  onChange={(e) => setAssignContestId(e.target.value)}
                  className="w-full px-2.5 py-2 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface focus:outline-none focus:border-primary-container"
                >
                  <option value="">-- No initial contest assignment --</option>
                  {contests.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.status})
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-[#e2e8f0]">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-3 py-1.5 rounded bg-surface-container-high hover:bg-surface-container text-on-surface font-label-sm cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 rounded bg-primary-container hover:bg-[#166534] text-on-primary font-label-sm font-semibold shadow-2xs flex items-center gap-1.5 cursor-pointer"
                >
                  {isSubmitting && (
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  )}
                  <span>Create Account</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Import CSV Modal */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest max-w-2xl w-full rounded-lg border border-[#e2e8f0] shadow-xl p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#e2e8f0]">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary-container text-[22px]">upload_file</span>
                <h2 className="font-headline-sm text-on-surface font-semibold">Bulk Import Users from CSV</h2>
              </div>
              <button
                onClick={() => setIsBulkModalOpen(false)}
                className="text-secondary hover:text-on-surface cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <p className="font-body-sm text-secondary">
              Upload or paste user data. Expected columns: <code>Name, Email, Role, CandidateId, Institution, InitialPassword</code>. Role must be <code>PARTICIPANT</code> or <code>EVALUATOR</code>.
            </p>

            {bulkGeneralError && (
              <div className="p-3 rounded bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-2">
                <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5">error</span>
                <span>{bulkGeneralError}</span>
              </div>
            )}

            {bulkResult && (
              <div
                className={`p-3.5 rounded-lg border text-xs flex flex-col gap-2 ${
                  bulkResult.failedCount === 0
                    ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                    : "bg-amber-50 border-amber-200 text-amber-900"
                }`}
              >
                <div className="font-semibold flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">
                    {bulkResult.failedCount === 0 ? "task_alt" : "warning"}
                  </span>
                  <span>
                    Import Summary: {bulkResult.importedCount} successfully enrolled, {bulkResult.failedCount} failed out of {bulkResult.totalRows} records.
                  </span>
                </div>

                {bulkResult.errors.length > 0 && (
                  <div className="mt-2 bg-white/80 p-2.5 rounded border border-amber-200 max-h-48 overflow-y-auto">
                    <span className="font-semibold block mb-1 text-red-800">Row-Level Errors:</span>
                    <ul className="list-disc list-inside space-y-1 text-xs text-red-700 font-mono">
                      {bulkResult.errors.map((err, idx) => (
                        <li key={idx}>
                          Row {err.row} {err.email ? `(${err.email})` : ""}: {err.error}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <form onSubmit={handleBulkImportSubmit} className="flex flex-col gap-4 text-xs font-body-sm">
              <div>
                <label className="font-label-xs uppercase text-secondary font-semibold block mb-1">
                  Assign to Contest (Optional)
                </label>
                <select
                  value={bulkAssignContestId}
                  onChange={(e) => setBulkAssignContestId(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface focus:outline-none focus:border-primary-container"
                >
                  <option value="">-- No initial contest assignment --</option>
                  {contests.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.status})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-label-xs uppercase text-secondary font-semibold">
                    Upload CSV File
                  </label>
                  <button
                    type="button"
                    onClick={handleDownloadTemplate}
                    className="text-primary-container hover:underline text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[14px]">download</span>
                    Download sample template
                  </button>
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".csv,text/csv"
                  onChange={handleFileUpload}
                  className="w-full px-3 py-2 text-xs rounded bg-surface-container-low border border-[#e2e8f0] text-secondary file:mr-3 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-primary-container file:text-on-primary hover:file:bg-[#166534] cursor-pointer"
                />
              </div>

              <div>
                <label className="font-label-xs uppercase text-secondary font-semibold block mb-1">
                  Or Paste CSV Text Directly
                </label>
                <textarea
                  rows={6}
                  value={bulkCsvText}
                  onChange={(e) => {
                    setBulkCsvText(e.target.value);
                    setBulkGeneralError(null);
                  }}
                  placeholder={'Name,Email,Role,CandidateId,Institution,InitialPassword\n"Alice Chen","alice@campus.edu","PARTICIPANT","ACI-4001","Tech College","AliceSecure#2025"'}
                  className="w-full px-3 py-2 font-mono text-xs rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface focus:outline-none focus:border-primary-container"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-[#e2e8f0]">
                <button
                  type="button"
                  onClick={() => setIsBulkModalOpen(false)}
                  className="px-3 py-1.5 rounded bg-surface-container-high hover:bg-surface-container text-on-surface font-label-sm cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={isBulkSubmitting || !bulkCsvText.trim()}
                  className="px-4 py-1.5 rounded bg-primary-container hover:bg-[#166534] disabled:opacity-50 text-on-primary font-label-sm font-semibold shadow-2xs flex items-center gap-1.5 cursor-pointer"
                >
                  {isBulkSubmitting && (
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  )}
                  <span>Validate & Import Users</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
