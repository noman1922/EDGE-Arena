"use client";

import React, { useState, useEffect } from "react";
import { getSystemErrorLogsAction } from "@/app/actions/system-error-actions";

interface SystemErrorItem {
  id: string;
  timestamp: string;
  route: string;
  operation: string;
  category: string;
  httpStatus?: number | null;
  details?: string | null;
  status: string;
}

export default function AdminSystemErrorsPage() {
  const [logs, setLogs] = useState<SystemErrorItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLog, setSelectedLog] = useState<SystemErrorItem | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchLogs = async () => {
    try {
      setIsLoading(true);
      const data = await getSystemErrorLogsAction({
        category: selectedCategory,
        search: searchQuery.trim() || undefined,
        limit: 100,
      });
      setLogs(data);
    } catch {
      // Admin error handler
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [selectedCategory]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchLogs();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getCategoryBadgeClass = (category: string) => {
    switch (category) {
      case "AUTH":
        return "bg-amber-50 text-amber-800 border-amber-200";
      case "DATABASE":
        return "bg-rose-50 text-rose-800 border-rose-200";
      case "AUTHORIZATION":
        return "bg-purple-50 text-purple-800 border-purple-200";
      case "STORAGE":
        return "bg-blue-50 text-blue-800 border-blue-200";
      case "VALIDATION":
        return "bg-orange-50 text-orange-800 border-orange-200";
      default:
        return "bg-slate-100 text-slate-800 border-slate-200";
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#e2e8f0]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-headline-md text-on-surface font-semibold tracking-tight">
              System Error Monitoring
            </h1>
            <span className="px-2 py-0.5 rounded text-xs bg-error-container/60 text-error font-medium">
              Admin Diagnostics
            </span>
          </div>
          <p className="font-body-sm text-secondary mt-1">
            Real-time server error logging, correlation reference IDs, and sanitized technical stack diagnostics.
          </p>
        </div>

        <button
          onClick={fetchLogs}
          className="px-3.5 py-2 rounded border border-[#e2e8f0] bg-surface-container-lowest hover:bg-surface-container-low text-on-surface font-label-sm font-medium transition-colors flex items-center gap-2 cursor-pointer shadow-2xs self-start sm:self-auto"
        >
          <span className="material-symbols-outlined text-[16px]">refresh</span>
          <span>Refresh Diagnostics</span>
        </button>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {["ALL", "AUTH", "AUTHORIZATION", "DATABASE", "STORAGE", "VALIDATION", "INTERNAL"].map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-full font-label-xs transition-colors cursor-pointer shrink-0 ${
                selectedCategory === cat
                  ? "bg-primary-container text-on-primary font-semibold shadow-xs"
                  : "bg-surface-container-low hover:bg-surface-container text-secondary border border-[#e2e8f0]"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Search */}
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 max-w-sm w-full">
          <div className="relative flex-1">
            <span className="material-symbols-outlined text-[18px] text-secondary absolute left-3 top-2.5">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by ERR-ID, route, or text..."
              className="w-full pl-9 pr-3 py-2 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface font-body-sm focus:outline-none focus:border-primary-container text-xs"
            />
          </div>
          <button
            type="submit"
            className="px-3 py-2 rounded bg-primary-container hover:bg-[#166534] text-on-primary font-label-xs font-medium cursor-pointer"
          >
            Filter
          </button>
        </form>
      </div>

      {/* Table */}
      <div className="bg-surface-container-lowest rounded-lg border border-[#e2e8f0] overflow-hidden shadow-2xs">
        <div className="p-3 border-b border-[#e2e8f0] flex items-center justify-between text-xs text-secondary">
          <span>Captured Errors ({logs.length})</span>
          <span>Sensitive credentials & database URLs are automatically sanitized</span>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-secondary font-body-sm flex flex-col items-center gap-2">
            <span className="w-5 h-5 border-2 border-primary-container border-t-transparent rounded-full animate-spin"></span>
            <span>Loading diagnostics...</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-secondary font-body-sm">
            <span className="material-symbols-outlined text-[32px] text-emerald-600 mb-2">verified</span>
            <p className="font-medium text-on-surface">No system errors logged</p>
            <p className="text-xs text-secondary mt-1">Platform operations are proceeding without unhandled exceptions.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-body-sm">
              <thead className="bg-surface-container-low text-secondary font-label-xs uppercase tracking-wider border-b border-[#e2e8f0]">
                <tr>
                  <th className="px-4 py-3">Reference ID</th>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Route / Operation</th>
                  <th className="px-4 py-3">HTTP Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e2e8f0]">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-surface-container-low/50 transition-colors">
                    <td className="px-4 py-3 font-mono font-semibold text-xs text-on-surface">
                      <div className="flex items-center gap-1.5">
                        <span>{log.id}</span>
                        <button
                          onClick={() => copyToClipboard(log.id)}
                          className="text-secondary hover:text-on-surface"
                          title="Copy reference ID"
                        >
                          <span className="material-symbols-outlined text-[14px]">
                            {copiedId === log.id ? "check" : "content_copy"}
                          </span>
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-secondary text-xs font-mono">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs border font-medium ${getCategoryBadgeClass(log.category)}`}>
                        {log.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span className="font-semibold text-on-surface">{log.operation}</span>
                      <span className="text-secondary block font-mono text-[11px]">{log.route}</span>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono">
                      <span className={(log.httpStatus ?? 500) >= 500 ? "text-error font-semibold" : "text-secondary"}>
                        {log.httpStatus || 500}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="px-2.5 py-1 rounded border border-[#e2e8f0] hover:bg-surface-container text-xs font-medium cursor-pointer transition-colors"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Log Details Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 bg-inverse-surface/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest max-w-2xl w-full rounded-lg border border-[#e2e8f0] shadow-xl p-6 flex flex-col gap-4 max-h-[85vh] overflow-hidden">
            <div className="flex items-center justify-between pb-3 border-b border-[#e2e8f0]">
              <div className="flex items-center gap-2">
                <span className="font-headline-sm text-on-surface font-semibold font-mono">
                  {selectedLog.id}
                </span>
                <span className={`px-2 py-0.5 rounded text-xs border font-medium ${getCategoryBadgeClass(selectedLog.category)}`}>
                  {selectedLog.category}
                </span>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-secondary hover:text-on-surface cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-surface-container-low p-3 rounded border border-[#e2e8f0]">
              <div>
                <span className="text-secondary block font-label-xs uppercase">Route</span>
                <span className="font-mono text-on-surface">{selectedLog.route}</span>
              </div>
              <div>
                <span className="text-secondary block font-label-xs uppercase">Operation</span>
                <span className="font-semibold text-on-surface">{selectedLog.operation}</span>
              </div>
              <div>
                <span className="text-secondary block font-label-xs uppercase">Timestamp</span>
                <span className="font-mono text-on-surface">{new Date(selectedLog.timestamp).toLocaleString()}</span>
              </div>
              <div>
                <span className="text-secondary block font-label-xs uppercase">HTTP Status / Status</span>
                <span className="font-mono text-on-surface">{selectedLog.httpStatus} ({selectedLog.status})</span>
              </div>
            </div>

            <div className="flex flex-col gap-1.5 flex-1 min-h-0">
              <span className="font-label-xs uppercase text-secondary font-semibold">
                Sanitized Stack Trace & Diagnostic Details
              </span>
              <pre className="p-3 rounded bg-slate-950 text-slate-100 font-mono text-xs overflow-auto flex-1 leading-relaxed border border-slate-800">
                {selectedLog.details}
              </pre>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-[#e2e8f0]">
              <button
                type="button"
                onClick={() => copyToClipboard(selectedLog.id)}
                className="px-3 py-1.5 rounded border border-[#e2e8f0] text-xs font-medium flex items-center gap-1.5 hover:bg-surface-container cursor-pointer"
              >
                <span className="material-symbols-outlined text-[14px]">
                  {copiedId === selectedLog.id ? "check" : "content_copy"}
                </span>
                <span>Copy Reference ID</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="px-4 py-1.5 rounded bg-surface-container hover:bg-surface-container-high text-xs font-medium cursor-pointer"
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
