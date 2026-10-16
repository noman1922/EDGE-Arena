"use client";

import React, { useEffect, useRef } from "react";

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  title: string;
  itemDescription: string;
  warningDetails?: string;
  confirmLabel?: string;
  isDeleting?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

export function DeleteConfirmationModal({
  isOpen,
  title,
  itemDescription,
  warningDetails = "This action is permanent and cannot be undone.",
  confirmLabel = "Delete Permanently",
  isDeleting = false,
  onConfirm,
  onClose,
}: DeleteConfirmationModalProps) {
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape" && !isDeleting) {
          onClose();
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      setTimeout(() => confirmBtnRef.current?.focus(), 50);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, isDeleting, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 transition-opacity animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-dialog-title"
    >
      <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-xl max-w-md w-full p-6 flex flex-col gap-4 text-left text-[#191c1e]">
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-200">
            <span className="material-symbols-outlined text-[24px]">delete_forever</span>
          </div>
          <div className="flex flex-col min-w-0">
            <h3
              id="delete-dialog-title"
              className="text-base font-semibold text-[#191c1e]"
            >
              {title}
            </h3>
            <p className="text-sm font-medium text-[#191c1e] mt-1 truncate">
              {itemDescription}
            </p>
          </div>
        </div>

        <div className="bg-rose-50 border border-rose-200 p-3 rounded-lg text-xs text-rose-800 leading-relaxed">
          <div className="flex items-center gap-1.5 font-semibold mb-0.5">
            <span className="material-symbols-outlined text-[15px]">warning</span>
            <span>Irreversible Action</span>
          </div>
          {warningDetails}
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#e2e8f0]">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-[#e2e8f0] hover:bg-[#f2f4f6] text-[#191c1e] transition-colors disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-60 cursor-pointer"
          >
            {isDeleting ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                <span>Deleting...</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[16px]">delete</span>
                <span>{confirmLabel}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
