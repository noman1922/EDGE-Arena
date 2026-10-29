"use client";

import React, { useState, useEffect } from "react";
import {
  getAdminEvaluators,
  createEvaluatorAccountAction,
  bulkImportEvaluatorsAction,
  getEvaluatorCsvTemplate,
  type EvaluatorAccount,
  type CsvImportResult,
} from "@/app/actions/evaluator-management-actions";

export default function AdminEvaluatorsPage() {
  const [evaluators, setEvaluators] = useState<EvaluatorAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Manual Creation Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    email: "",
    password: "",
    institution: "",
    evaluatorId: "",
  });
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // CSV Import Modal State
  const [showImportModal, setShowImportModal] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvContent, setCsvContent] = useState<string>("");
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<CsvImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const fetchEvaluators = async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      const data = await getAdminEvaluators();
      setEvaluators(data);
    } catch {
      setErrorMessage("Failed to load evaluators list. Please refresh or contact administrator.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEvaluators();
  }, []);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setIsSubmittingCreate(true);

    try {
      const res = await createEvaluatorAccountAction(createForm);
      if (res.success) {
        setSuccessMessage(`Evaluator "${createForm.name}" created successfully with temporary password.`);
        setShowCreateModal(false);
        setCreateForm({ name: "", email: "", password: "", institution: "", evaluatorId: "" });
        await fetchEvaluators();
      } else {
        setCreateError(res.error || "Failed to create evaluator account.");
      }
    } catch {
      setCreateError("Something went wrong. Please contact your system administrator.");
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const template = await getEvaluatorCsvTemplate();
      const blob = new Blob([template], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "evaluator_import_template.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCsvFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCsvFile(file);
      setImportResult(null);
      setImportError(null);
      const reader = new FileReader();
      reader.onload = (event) => {
        setCsvContent((event.target?.result as string) || "");
      };
      reader.readAsText(file);
    }
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvContent) {
      setImportError("Please select a valid CSV file first.");
      return;
    }

    setIsImporting(true);
    setImportError(null);
    setImportResult(null);

    try {
      const result = await bulkImportEvaluatorsAction(csvContent);
      setImportResult(result);
      if (result.success && result.createdCount > 0) {
        setSuccessMessage(`Successfully imported ${result.createdCount} evaluator accounts.`);
        await fetchEvaluators();
      } else if (!result.success && result.error) {
        setImportError(result.error);
      }
    } catch {
      setImportError("Something went wrong during import. Please contact your system administrator.");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#e2e8f0]">
        <div>
          <h1 className="font-headline-md text-on-surface font-semibold tracking-tight">
            Evaluator Management
          </h1>
          <p className="font-body-sm text-secondary mt-1">
            Provision, import, and monitor authorized assessment evaluators. All accounts require a password change on first login.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setImportResult(null);
              setImportError(null);
              setCsvFile(null);
              setCsvContent("");
              setShowImportModal(true);
            }}
            className="px-4 py-2 rounded border border-[#e2e8f0] bg-surface-container-lowest hover:bg-surface-container-low text-on-surface font-label-md font-medium transition-colors flex items-center gap-2 cursor-pointer shadow-2xs"
          >
            <span className="material-symbols-outlined text-[18px]">upload_file</span>
            <span>Import CSV</span>
          </button>

          <button
            onClick={() => {
              setCreateError(null);
              setShowCreateModal(true);
            }}
            className="px-4 py-2 rounded bg-primary-container hover:bg-[#166534] text-on-primary font-label-md font-medium transition-colors flex items-center gap-2 cursor-pointer shadow-2xs"
          >
            <span className="material-symbols-outlined text-[18px]">person_add</span>
            <span>Add Evaluator</span>
          </button>
        </div>
      </div>

      {/* Feedback Alerts */}
      {successMessage && (
        <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 font-label-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">check_circle</span>
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-700 hover:text-emerald-900 cursor-pointer">
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="p-3.5 rounded-lg bg-error-container/60 border border-error/20 text-error font-label-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">error</span>
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-error hover:text-red-900 cursor-pointer">
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      )}

      {/* Evaluators Data Table */}
      <div className="bg-surface-container-lowest rounded-lg border border-[#e2e8f0] overflow-hidden shadow-2xs">
        <div className="p-4 border-b border-[#e2e8f0] flex items-center justify-between">
          <div className="flex items-center gap-2 font-label-md text-on-surface font-semibold">
            <span>Enrolled Evaluators</span>
            <span className="px-2 py-0.5 rounded-full bg-surface-container text-secondary text-xs">
              {evaluators.length}
            </span>
          </div>
          <button
            onClick={fetchEvaluators}
            className="p-1 rounded hover:bg-surface-container text-secondary transition-colors cursor-pointer"
            title="Refresh list"
          >
            <span className="material-symbols-outlined text-[18px]">refresh</span>
          </button>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-secondary font-body-sm flex flex-col items-center gap-2">
            <span className="w-5 h-5 border-2 border-primary-container border-t-transparent rounded-full animate-spin"></span>
            <span>Loading evaluators...</span>
          </div>
        ) : evaluators.length === 0 ? (
          <div className="p-12 text-center text-secondary font-body-sm">
            <span className="material-symbols-outlined text-[32px] text-outline mb-2">badge</span>
            <p>No evaluator accounts enrolled yet.</p>
            <p className="text-xs text-outline mt-1">Use &quot;Add Evaluator&quot; or &quot;Import CSV&quot; to provision accounts.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-body-sm">
              <thead className="bg-surface-container-low text-secondary font-label-xs uppercase tracking-wider border-b border-[#e2e8f0]">
                <tr>
                  <th className="px-4 py-3">Evaluator</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Institution / Dept</th>
                  <th className="px-4 py-3">Identifier</th>
                  <th className="px-4 py-3">Security Status</th>
                  <th className="px-4 py-3">Enrolled On</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e2e8f0]">
                {evaluators.map((evaluator) => (
                  <tr key={evaluator.id} className="hover:bg-surface-container-low/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-secondary-container/40 text-secondary flex items-center justify-center font-semibold text-xs">
                          {evaluator.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-on-surface">{evaluator.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-secondary font-mono text-xs">{evaluator.email}</td>
                    <td className="px-4 py-3 text-secondary">{evaluator.institution || "—"}</td>
                    <td className="px-4 py-3 text-secondary font-mono text-xs">{evaluator.candidateId || "—"}</td>
                    <td className="px-4 py-3">
                      {evaluator.mustChangePassword ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-amber-50 text-amber-800 border border-amber-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                          Pending First Login Change
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          Password Active
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-secondary text-xs">
                      {new Date(evaluator.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Manual Evaluator Creation Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-inverse-surface/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest max-w-md w-full rounded-lg border border-[#e2e8f0] shadow-md p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#e2e8f0]">
              <h2 className="font-headline-sm text-on-surface font-semibold">Provision New Evaluator</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-secondary hover:text-on-surface cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {createError && (
              <div className="p-3 rounded bg-error-container/60 border border-error/20 text-error font-label-xs flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px]">error</span>
                <span>{createError}</span>
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="flex flex-col gap-3 font-body-sm">
              <div>
                <label className="font-label-xs text-secondary uppercase font-semibold block mb-1">
                  Full Name <span className="text-error">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  placeholder="e.g. Dr. Jane Smith"
                  className="w-full px-3 py-2 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface focus:outline-none focus:border-primary-container"
                />
              </div>

              <div>
                <label className="font-label-xs text-secondary uppercase font-semibold block mb-1">
                  Email Address <span className="text-error">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  placeholder="evaluator@institution.edu"
                  className="w-full px-3 py-2 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface focus:outline-none focus:border-primary-container"
                />
              </div>

              <div>
                <label className="font-label-xs text-secondary uppercase font-semibold block mb-1">
                  Initial Password <span className="text-error">*</span>
                </label>
                <input
                  type="password"
                  required
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  placeholder="Minimum 8 characters"
                  className="w-full px-3 py-2 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface focus:outline-none focus:border-primary-container"
                />
                <span className="text-[11px] text-secondary mt-1 block">
                  The evaluator will be required to change this password immediately upon first login.
                </span>
              </div>

              <div>
                <label className="font-label-xs text-secondary uppercase font-semibold block mb-1">
                  Institution / Department (Optional)
                </label>
                <input
                  type="text"
                  value={createForm.institution}
                  onChange={(e) => setCreateForm({ ...createForm, institution: e.target.value })}
                  placeholder="e.g. School of Engineering"
                  className="w-full px-3 py-2 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface focus:outline-none focus:border-primary-container"
                />
              </div>

              <div>
                <label className="font-label-xs text-secondary uppercase font-semibold block mb-1">
                  Evaluator ID / Code (Optional)
                </label>
                <input
                  type="text"
                  value={createForm.evaluatorId}
                  onChange={(e) => setCreateForm({ ...createForm, evaluatorId: e.target.value })}
                  placeholder="e.g. EV-1002"
                  className="w-full px-3 py-2 rounded bg-surface-container-low border border-[#e2e8f0] text-on-surface focus:outline-none focus:border-primary-container"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#e2e8f0]">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded border border-[#e2e8f0] text-secondary hover:text-on-surface cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCreate}
                  className="px-4 py-2 rounded bg-primary-container hover:bg-[#166534] text-on-primary font-medium flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingCreate && (
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  )}
                  <span>Create Account</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSV Evaluator Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-inverse-surface/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest max-w-xl w-full rounded-lg border border-[#e2e8f0] shadow-md p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#e2e8f0]">
              <h2 className="font-headline-sm text-on-surface font-semibold">Bulk Import Evaluators via CSV</h2>
              <button
                onClick={() => setShowImportModal(false)}
                className="text-secondary hover:text-on-surface cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <p className="font-body-sm text-secondary">
              Upload a UTF-8 encoded CSV file. Each row must contain at minimum: <code className="text-on-surface font-mono text-xs bg-surface-container px-1 py-0.5 rounded">name,email,password</code>.
              All imported accounts will be assigned the <strong>EVALUATOR</strong> role and prompted for a password change on first login.
            </p>

            <div className="flex items-center justify-between p-3 rounded-lg bg-surface-container-low border border-[#e2e8f0]">
              <div className="flex items-center gap-2 text-xs text-secondary">
                <span className="material-symbols-outlined text-[18px] text-primary-container">file_download</span>
                <span>Need a reference template?</span>
              </div>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="text-xs text-primary-container font-semibold hover:underline cursor-pointer"
              >
                Download CSV Template
              </button>
            </div>

            {importError && (
              <div className="p-3 rounded bg-error-container/60 border border-error/20 text-error font-label-xs flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px]">error</span>
                <span>{importError}</span>
              </div>
            )}

            <form onSubmit={handleImportSubmit} className="flex flex-col gap-4">
              <div className="border-2 border-dashed border-[#cbd5e1] rounded-lg p-6 text-center hover:bg-surface-container-low transition-colors">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleCsvFileChange}
                  className="hidden"
                  id="evaluator-csv-file-input"
                />
                <label htmlFor="evaluator-csv-file-input" className="cursor-pointer flex flex-col items-center gap-2">
                  <span className="material-symbols-outlined text-[36px] text-primary-container">cloud_upload</span>
                  <span className="font-label-md text-on-surface font-medium">
                    {csvFile ? csvFile.name : "Click to select or drag and drop CSV file"}
                  </span>
                  <span className="text-xs text-secondary">CSV up to 2MB. Evaluator role strictly enforced.</span>
                </label>
              </div>

              {/* Import Results Breakdown */}
              {importResult && (
                <div className="p-4 rounded-lg bg-surface-container-low border border-[#e2e8f0] flex flex-col gap-3">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span>Import Summary</span>
                    <span className="text-secondary">{importResult.totalRows} rows processed</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="p-2 rounded bg-emerald-50 border border-emerald-200 text-emerald-800">
                      <span className="block text-lg font-bold">{importResult.createdCount}</span>
                      <span>Created</span>
                    </div>
                    <div className="p-2 rounded bg-amber-50 border border-amber-200 text-amber-800">
                      <span className="block text-lg font-bold">{importResult.skippedCount}</span>
                      <span>Skipped</span>
                    </div>
                    <div className="p-2 rounded bg-red-50 border border-red-200 text-red-800">
                      <span className="block text-lg font-bold">{importResult.failedCount}</span>
                      <span>Failed</span>
                    </div>
                  </div>

                  {importResult.failedRows.length > 0 && (
                    <div className="mt-2 max-h-36 overflow-y-auto border border-[#e2e8f0] rounded p-2 text-xs">
                      <span className="font-semibold text-secondary block mb-1">Row Exceptions:</span>
                      <ul className="space-y-1">
                        {importResult.failedRows.map((f, idx) => (
                          <li key={idx} className="text-error flex items-start gap-1">
                            <span className="font-mono">{f.rowNumber > 0 ? `Row ${f.rowNumber}:` : ""}</span>
                            <span>{f.email ? `(${f.email})` : ""}</span>
                            <span>{f.reason}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#e2e8f0]">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-2 rounded border border-[#e2e8f0] text-secondary hover:text-on-surface cursor-pointer"
                >
                  {importResult ? "Close" : "Cancel"}
                </button>
                <button
                  type="submit"
                  disabled={!csvFile || isImporting}
                  className="px-4 py-2 rounded bg-primary-container hover:bg-[#166534] text-on-primary font-medium flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isImporting && (
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  )}
                  <span>Start Import</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
