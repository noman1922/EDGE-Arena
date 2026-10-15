"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { getAdminAuditLogs, type AdminAuditLogRow } from "@/app/actions/results-actions";

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<AdminAuditLogRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLog, setSelectedLog] = useState<AdminAuditLogRow | null>(null);

  useEffect(() => {
    async function loadLogs() {
      try {
        setIsLoading(true);
        const data = await getAdminAuditLogs(100);
        setLogs(data);
      } catch (err) {
        console.error("Failed to load audit logs:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadLogs();
  }, []);

  const filteredLogs = logs.filter((log) => {
    const matchesFilter =
      filterType === "ALL" ||
      (filterType === "CONTEST" && (log.targetType === "CONTEST" || log.action.includes("CONTEST"))) ||
      (filterType === "PARTICIPANT" && (log.targetType === "PARTICIPANT" || log.action.includes("PARTICIPANT"))) ||
      (filterType === "EVALUATION" && (log.targetType === "SUBMISSION" || log.action.includes("RUBRIC") || log.action.includes("GRADE"))) ||
      (filterType === "PUBLISH" && log.action.includes("PUBLISH"));

    const matchesSearch =
      log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.targetType.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.targetId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.actorId && log.actorId.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesFilter && matchesSearch;
  });

  return (
    <div className="flex-1 p-space-md sm:p-space-lg max-w-7xl mx-auto w-full">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-space-md border-b border-[#e2e8f0] gap-space-sm mb-space-lg">
        <div>
          <div className="flex items-center gap-space-xs text-secondary font-label-xs mb-1">
            <Link href="/admin" className="hover:text-on-surface">Admin</Link>
            <span>/</span>
            <span className="text-on-surface font-medium">Audit Log</span>
          </div>
          <h1 className="font-headline-md font-semibold text-on-surface tracking-tight">
            Security & Operational Audit Ledger
          </h1>
          <p className="font-body-sm text-secondary mt-0.5">
            Immutable traceability for contest lifecycle transitions, participant enrollments, rubric evaluations, and result certifications.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full bg-surface-container font-label-xs font-semibold text-secondary flex items-center gap-1.5 border border-[#e2e8f0]">
            <span className="w-2 h-2 rounded-full bg-primary-container"></span>
            Asia/Dhaka Standard Time
          </span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-space-sm mb-space-md">
        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto">
          {[
            { key: "ALL", label: "All Events" },
            { key: "CONTEST", label: "Contest Lifecycle" },
            { key: "PARTICIPANT", label: "Enrollment" },
            { key: "EVALUATION", label: "Grading & Rubrics" },
            { key: "PUBLISH", label: "Publication" },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => setFilterType(item.key)}
              className={`px-3 py-1.5 rounded font-label-xs font-semibold border transition-colors whitespace-nowrap ${
                filterType === item.key
                  ? "bg-primary-container text-on-primary border-primary-container"
                  : "bg-surface-container-lowest text-secondary border-[#e2e8f0] hover:bg-surface-container"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="w-full sm:w-72 relative">
          <span className="material-symbols-outlined text-[18px] text-secondary absolute left-3 top-2.5">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by action, target, actor..."
            className="w-full pl-9 pr-3 py-1.5 rounded bg-surface-container-lowest border border-[#e2e8f0] text-on-surface font-body-sm focus:outline-none focus:border-primary-container"
          />
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-surface-container-lowest border border-[#e2e8f0] rounded-lg shadow-2xs overflow-hidden">
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center text-secondary">
            <span className="w-8 h-8 border-3 border-primary-container border-t-transparent rounded-full animate-spin mb-3"></span>
            <p className="font-label-sm">Querying audit events from database...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-secondary">
            <span className="material-symbols-outlined text-[40px] mb-2 text-secondary/60">
              history_toggle_off
            </span>
            <h4 className="font-headline-sm font-semibold text-on-surface">No Audit Records Found</h4>
            <p className="font-body-sm text-secondary mt-1">
              No administrative events match your search query.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low border-b border-[#e2e8f0] font-label-xs uppercase font-semibold text-secondary">
                  <th className="py-3 px-space-md">Timestamp (BST)</th>
                  <th className="py-3 px-space-md">Action</th>
                  <th className="py-3 px-space-md">Target Entity</th>
                  <th className="py-3 px-space-md">Actor ID</th>
                  <th className="py-3 px-space-md text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9] font-body-sm text-on-surface">
                {filteredLogs.map((log) => (
                  <tr
                    key={log.id}
                    onClick={() => setSelectedLog(log)}
                    className="hover:bg-surface-container-lowest/80 transition-colors cursor-pointer"
                  >
                    <td className="py-3 px-space-md text-xs font-mono text-secondary whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString("en-US", {
                        timeZone: "Asia/Dhaka",
                        month: "short",
                        day: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                        hour12: false,
                      })}
                    </td>
                    <td className="py-3 px-space-md">
                      <span
                        className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold uppercase tracking-wider ${
                          log.action.includes("CREATE")
                            ? "bg-blue-100 text-blue-800"
                            : log.action.includes("UPDATE") || log.action.includes("STATUS")
                            ? "bg-amber-100 text-amber-800"
                            : log.action.includes("PUBLISH")
                            ? "bg-[#dcfce7] text-[#166534]"
                            : log.action.includes("DELETE") || log.action.includes("REMOVE")
                            ? "bg-red-100 text-red-800"
                            : "bg-surface-container text-secondary"
                        }`}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3 px-space-md">
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="font-semibold text-on-surface">{log.targetType}</span>
                        <span className="font-mono text-secondary truncate max-w-[140px]">
                          {log.targetId}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-space-md text-xs font-mono text-secondary truncate max-w-[120px]">
                      {log.actorId ? log.actorId.slice(0, 12) + "..." : "System"}
                    </td>
                    <td className="py-3 px-space-md text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="px-2.5 py-1 text-xs bg-surface-container-high hover:bg-surface-container text-on-surface font-medium rounded border border-[#e2e8f0]"
                      >
                        Inspect Payload
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payload Modal */}
      {selectedLog && (
        <div
          className="fixed inset-0 bg-inverse-surface/40 backdrop-blur-xs z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedLog(null)}
        >
          <div
            className="bg-surface-container-lowest rounded-lg border border-[#e2e8f0] shadow-xl max-w-lg w-full p-space-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-space-sm border-b border-[#e2e8f0] mb-space-md">
              <div>
                <span className="font-mono text-[10px] text-secondary">EVENT ID: {selectedLog.id}</span>
                <h3 className="font-headline-sm font-semibold text-on-surface">
                  {selectedLog.action}
                </h3>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-secondary hover:text-on-surface p-1"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="space-y-3 font-body-sm text-xs">
              <div className="grid grid-cols-2 gap-2 p-2 bg-surface-container-low rounded border border-[#e2e8f0]">
                <div>
                  <span className="text-secondary uppercase font-semibold text-[10px] block">Target Type</span>
                  <span className="font-medium text-on-surface">{selectedLog.targetType}</span>
                </div>
                <div>
                  <span className="text-secondary uppercase font-semibold text-[10px] block">Target ID</span>
                  <span className="font-mono text-on-surface truncate block">{selectedLog.targetId}</span>
                </div>
                <div>
                  <span className="text-secondary uppercase font-semibold text-[10px] block">Actor</span>
                  <span className="font-mono text-on-surface truncate block">{selectedLog.actorId || "System Trigger"}</span>
                </div>
                <div>
                  <span className="text-secondary uppercase font-semibold text-[10px] block">Timestamp (BST)</span>
                  <span className="text-on-surface font-mono">
                    {new Date(selectedLog.createdAt).toLocaleString("en-US", { timeZone: "Asia/Dhaka" })}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-secondary uppercase font-semibold text-[10px] block mb-1">
                  Metadata JSON Snapshot
                </span>
                <pre className="p-3 bg-surface-container-lowest border border-[#e2e8f0] rounded font-mono text-[11px] overflow-x-auto text-on-surface max-h-60">
                  {JSON.stringify(selectedLog.metadata, null, 2)}
                </pre>
              </div>
            </div>

            <div className="pt-space-md border-t border-[#e2e8f0] flex justify-end mt-4">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 bg-primary-container text-on-primary font-label-md font-medium rounded"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
