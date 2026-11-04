"use client";

import React, { useState, useRef } from "react";
import {
  previewBulkMcqImportAction,
  executeBulkMcqImportAction,
  getMcqTemplateAction,
} from "@/app/actions/task-builder-actions";
import { ParsedMcqRow, McqImportPreviewResult } from "@/lib/bulk-mcq-parser";

interface BulkMcqImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  taskId: string;
  taskTitle: string;
  onSuccess?: () => void;
}

export function BulkMcqImportModal({
  isOpen,
  onClose,
  taskId,
  taskTitle,
  onSuccess,
}: BulkMcqImportModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [previewResult, setPreviewResult] = useState<McqImportPreviewResult | null>(null);
  const [importSuccessMessage, setImportSuccessMessage] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processFile(file);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await processFile(file);
  };

  const processFile = async (file: File) => {
    const validExtensions = [".csv", ".xlsx", ".xls"];
    const hasValidExt = validExtensions.some((ext) => file.name.toLowerCase().endsWith(ext));

    if (!hasValidExt) {
      setGeneralError("Please upload a valid .csv, .xlsx, or .xls spreadsheet.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setGeneralError("File size exceeds 5MB limit.");
      return;
    }

    setSelectedFile(file);
    setGeneralError(null);
    setImportSuccessMessage(null);
    setIsParsing(true);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const arrayBuffer = reader.result as ArrayBuffer;
          const bytes = new Uint8Array(arrayBuffer);
          let binary = "";
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64 = btoa(binary);

          const result = await previewBulkMcqImportAction({
            taskId,
            fileBase64: base64,
            fileName: file.name,
          });

          setIsParsing(false);
          setPreviewResult(result);
          if (!result.success && result.globalErrors?.length > 0) {
            setGeneralError(result.globalErrors.join(" "));
          }
        } catch (err) {
          setIsParsing(false);
          setGeneralError(err instanceof Error ? err.message : "Failed to process file.");
        }
      };
      reader.onerror = () => {
        setIsParsing(false);
        setGeneralError("Failed to read the selected file.");
      };
      reader.readAsArrayBuffer(file);
    } catch (err) {
      setIsParsing(false);
      setGeneralError(err instanceof Error ? err.message : "Error reading file.");
    }
  };

  const handleDownloadTemplate = async (format: "csv" | "xlsx") => {
    try {
      const res = await getMcqTemplateAction(format);
      if (!res.success || !res.data) {
        alert(res.error || "Failed to download template");
        return;
      }

      const byteCharacters = atob(res.data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: res.mimeType });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Error initiating template download: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleExecuteImport = async () => {
    if (!previewResult || previewResult.validRowsCount === 0) return;

    const validRowsToImport = previewResult.rows
      .filter((r) => r.isValid)
      .map((r) => ({
        questionNumber: r.questionNumber,
        prompt: r.prompt,
        instructions: r.instructions,
        points: r.points,
        options: r.options,
        correctOptionKey: r.correctOptionKey,
        explanation: r.explanation,
        scoringGuide: r.scoringGuide,
      }));

    setIsImporting(true);
    setGeneralError(null);

    try {
      const res = await executeBulkMcqImportAction({
        taskId,
        rows: validRowsToImport,
      });

      setIsImporting(false);

      if (res.success) {
        setImportSuccessMessage(
          `Successfully imported ${res.importedCount} MCQ question${(res.importedCount ?? 0) === 1 ? "" : "s"}!`
        );
        setTimeout(() => {
          if (onSuccess) onSuccess();
          onClose();
        }, 1500);
      } else {
        setGeneralError(res.error || "Failed to import questions.");
      }
    } catch (err) {
      setIsImporting(false);
      setGeneralError(err instanceof Error ? err.message : "Import failed unexpectedly.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in">
      <div className="bg-surface rounded-xl shadow-2xl border border-outline/20 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-outline/10 flex items-center justify-between bg-surface-container-low shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[20px]">
                table_chart
              </span>
              <h2 className="font-title-md font-semibold text-on-surface">
                Bulk Import Multiple Choice Questions
              </h2>
            </div>
            <p className="font-body-xs text-secondary mt-0.5">
              Task: <span className="font-semibold text-on-surface">{taskTitle}</span> (Upload CSV
              or Excel spreadsheet)
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-secondary hover:text-on-surface hover:bg-surface-container-highest cursor-pointer transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Instructions and Download Template Bar */}
          <div className="bg-surface-container-low border border-outline/15 rounded-lg p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="text-xs text-secondary leading-relaxed">
              <p className="font-medium text-on-surface mb-0.5">
                Need a pre-formatted spreadsheet template?
              </p>
              <p>
                Includes columns for Question Prompt, Instructions, Options A–D, Correct Answer Key,
                Points, Explanations, and Scoring Rubric.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleDownloadTemplate("csv")}
                className="px-3 py-1.5 bg-surface border border-outline/30 hover:bg-surface-container-high text-on-surface text-xs font-medium rounded-md shadow-2xs flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <span className="material-symbols-outlined text-[15px] text-primary">download</span>
                CSV Template
              </button>
              <button
                type="button"
                onClick={() => handleDownloadTemplate("xlsx")}
                className="px-3 py-1.5 bg-primary-container text-on-primary hover:bg-[#166534] text-xs font-medium rounded-md shadow-2xs flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <span className="material-symbols-outlined text-[15px]">download</span>
                Excel (.xlsx)
              </button>
            </div>
          </div>

          {/* Success Message Banner */}
          {importSuccessMessage && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-lg text-emerald-800 dark:text-emerald-200 text-xs flex items-center gap-2 animate-fade-in">
              <span className="material-symbols-outlined text-[18px]">check_circle</span>
              <span>{importSuccessMessage}</span>
            </div>
          )}

          {/* General Error Banner */}
          {generalError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 rounded-lg text-rose-800 dark:text-rose-200 text-xs flex items-start gap-2 animate-fade-in">
              <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5">error</span>
              <div className="space-y-1">
                <p className="font-medium">File Processing Issue</p>
                <p>{generalError}</p>
              </div>
            </div>
          )}

          {/* Upload Dropzone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
              selectedFile
                ? "border-primary/50 bg-primary/5"
                : "border-outline/30 hover:border-primary/40 bg-surface-container-low hover:bg-surface-container"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv, .xlsx, .xls"
              onChange={handleFileChange}
              className="hidden"
            />
            <div className="flex flex-col items-center justify-center gap-2">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <span className="material-symbols-outlined text-[26px]">
                  {selectedFile ? "description" : "cloud_upload"}
                </span>
              </div>
              <div>
                <p className="text-sm font-medium text-on-surface">
                  {selectedFile ? selectedFile.name : "Drag & drop your CSV or Excel file here"}
                </p>
                <p className="text-xs text-secondary mt-0.5">
                  {selectedFile
                    ? `${(selectedFile.size / 1024).toFixed(1)} KB — Click to choose a different file`
                    : "Supports .csv, .xlsx, .xls up to 5MB (Max 200 questions per batch)"}
                </p>
              </div>
            </div>
          </div>

          {/* Parsing Spinner */}
          {isParsing && (
            <div className="py-8 flex flex-col items-center justify-center gap-2 text-secondary">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-medium">Validating spreadsheet format and question rows...</p>
            </div>
          )}

          {/* Preview Results Table */}
          {previewResult && !isParsing && (
            <div className="space-y-3">
              {/* Stats Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-secondary">
                    Spreadsheet Validation Preview
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-surface-container text-on-surface border border-outline/10">
                    Total: {previewResult.totalRows}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    {previewResult.validRowsCount} Valid
                  </span>
                  {previewResult.invalidRowsCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                      {previewResult.invalidRowsCount} Errors
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-secondary">
                  Existing questions will never be overwritten.
                </div>
              </div>

              {/* Table */}
              <div className="border border-outline/15 rounded-lg overflow-hidden bg-surface">
                <div className="max-h-[300px] overflow-y-auto overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-surface-container-low text-secondary font-medium sticky top-0 border-b border-outline/15">
                      <tr>
                        <th className="py-2.5 px-3 w-14">Row</th>
                        <th className="py-2.5 px-3 w-16">Q#</th>
                        <th className="py-2.5 px-3">Question Prompt</th>
                        <th className="py-2.5 px-3 w-40">Options</th>
                        <th className="py-2.5 px-3 w-16 text-center">Key</th>
                        <th className="py-2.5 px-3 w-16 text-center">Marks</th>
                        <th className="py-2.5 px-3 w-28">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline/10 font-body-xs">
                      {previewResult.rows.map((row) => (
                        <tr
                          key={row.rowNumber}
                          className={
                            row.isValid
                              ? "hover:bg-surface-container-low/40"
                              : "bg-rose-50/40 dark:bg-rose-950/20"
                          }
                        >
                          <td className="py-2 px-3 text-secondary">{row.rowNumber}</td>
                          <td className="py-2 px-3 font-semibold text-on-surface">
                            {row.questionNumber ?? "Auto"}
                          </td>
                          <td className="py-2 px-3 max-w-[280px]">
                            <p className="font-medium text-on-surface line-clamp-2">
                              {row.prompt}
                            </p>
                            {row.instructions && (
                              <p className="text-[10px] text-secondary line-clamp-1 italic">
                                {row.instructions}
                              </p>
                            )}
                          </td>
                          <td className="py-2 px-3">
                            <div className="flex flex-wrap gap-1">
                              {row.options.map((opt) => {
                                const isCorrect = opt.optionKey === row.correctOptionKey;
                                return (
                                  <span
                                    key={opt.optionKey}
                                    title={`${opt.optionKey}: ${opt.text}`}
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium ${
                                      isCorrect
                                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200 border border-emerald-400"
                                        : "bg-surface-container text-secondary"
                                    }`}
                                  >
                                    {opt.optionKey}
                                  </span>
                                );
                              })}
                            </div>
                          </td>
                          <td className="py-2 px-3 text-center">
                            {row.correctOptionKey ? (
                              <span className="font-semibold font-mono text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                                {row.correctOptionKey}
                              </span>
                            ) : (
                              <span className="text-rose-500 font-bold">—</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-center font-mono text-secondary">
                            {row.points}
                          </td>
                          <td className="py-2 px-3">
                            {row.isValid ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                                <span className="material-symbols-outlined text-[14px]">
                                  check_circle
                                </span>
                                Ready
                              </span>
                            ) : (
                              <div className="text-[11px] text-rose-600 dark:text-rose-400">
                                <div className="font-medium flex items-center gap-1">
                                  <span className="material-symbols-outlined text-[14px]">
                                    error
                                  </span>
                                  Error
                                </div>
                                <div className="text-[10px] text-rose-500 mt-0.5 leading-tight">
                                  {row.errors.join("; ")}
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-outline/10 bg-surface-container-low flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isImporting}
            className="px-4 py-2 border border-outline/30 hover:bg-surface-container rounded-lg text-xs font-medium text-secondary hover:text-on-surface cursor-pointer transition-colors"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleExecuteImport}
            disabled={
              !previewResult ||
              previewResult.validRowsCount === 0 ||
              isImporting ||
              isParsing
            }
            className="px-5 py-2 bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-on-primary rounded-lg text-xs font-semibold shadow-sm flex items-center gap-2 cursor-pointer transition-colors"
          >
            {isImporting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Importing Questions...</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[16px]">publish</span>
                <span>
                  Import {previewResult ? previewResult.validRowsCount : 0} Question
                  {previewResult?.validRowsCount === 1 ? "" : "s"}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

