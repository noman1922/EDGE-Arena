"use client";

import React, { useState, useEffect } from "react";
import {
  getAdminParticipants,
  createParticipantAccountAction,
  updateParticipantStatusAction,
  type AdminParticipantItem,
} from "@/app/actions/participant-actions";
import { getAdminContests, type AdminContestListItem } from "@/app/actions/contest-actions";

export default function AdminParticipantsPage() {
  const [participants, setParticipants] = useState<AdminParticipantItem[]>([]);
  const [contests, setContests] = useState<AdminContestListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"ALL" | "PARTICIPANT" | "EVALUATOR">("ALL");

  // Create Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"PARTICIPANT" | "EVALUATOR">("PARTICIPANT");
  const [institution, setInstitution] = useState("National Campus Leadership");
  const [candidateId, setCandidateId] = useState("");
  const [assignContestId, setAssignContestId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

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
      });

      if (res.success) {
        setIsCreateModalOpen(false);
        setName("");
        setEmail("");
        setCandidateId("");
        setActionSuccess(`Account created for ${email}`);
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
            Manage student candidates, evaluators, institutional credentials, and active contest assignments.
          </p>
        </div>

        <button
          onClick={() => {
            setModalError(null);
            setIsCreateModalOpen(true);
          }}
          className="inline-flex items-center gap-space-xs px-space-md py-2.5 bg-primary-container hover:bg-[#166534] text-on-primary font-label-md font-medium rounded shadow-2xs transition-colors self-start md:self-auto cursor-pointer"
        >
          <span className="material-symbols-outlined text-[18px]">person_add</span>
          <span>Enroll New Account</span>
        </button>
      </div>

      {actionSuccess && (
        <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded font-label-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-emerald-600">check_circle</span>
            {actionSuccess}
          </span>
          <button onClick={() => setActionSuccess(null)} className="text-emerald-700 hover:text-emerald-900">
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
                className={`px-2.5 py-1 rounded transition-colors ${
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
                <th className="py-3 px-4 font-semibold">Candidate / User</th>
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
                    <td className="py-3 px-4 font-mono text-xs text-secondary">{p.candidateId}</td>
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
                              className="px-2 py-1 text-xs rounded bg-red-50 hover:bg-red-100 text-red-700 transition-colors"
                            >
                              Disqualify
                            </button>
                          ) : (
                            <button
                              onClick={() => handleStatusChange(p.id, "ACTIVE")}
                              title="Reactivate Participant"
                              className="px-2 py-1 text-xs rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition-colors"
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

      {/* Enroll Account Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-inverse-surface/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest max-w-md w-full rounded-lg border border-[#e2e8f0] shadow-xl p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#e2e8f0]">
              <h2 className="font-headline-sm text-on-surface font-semibold">Enroll New Account</h2>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-secondary hover:text-on-surface"
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
                  className="px-3 py-1.5 rounded bg-surface-container-high hover:bg-surface-container text-on-surface font-label-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 rounded bg-primary-container hover:bg-[#166534] text-on-primary font-label-sm font-semibold shadow-2xs flex items-center gap-1.5"
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
    </div>
  );
}
