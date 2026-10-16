"use client";

import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AssessmentDocumentReader } from "@/components/assessment/assessment-document-reader";
import { ParticipantHeader } from "@/components/layout/participant-header";
import { ParticipantFooter } from "@/components/layout/participant-footer";

function AssessmentInterfaceContent() {
  const searchParams = useSearchParams();
  const contestId = searchParams.get("contestId") || undefined;
  const taskId = searchParams.get("taskId") || undefined;

  return (
    <AssessmentDocumentReader
      initialContestId={contestId}
      initialTaskId={taskId}
    />
  );
}

export default function AssessmentPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white text-[#191c1e] flex flex-col justify-between">
          <ParticipantHeader />
          <main className="w-full py-32 flex flex-col items-center justify-center text-slate-500">
            <span className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mb-3"></span>
            <p className="text-sm font-medium">Loading assessment document reader...</p>
          </main>
          <ParticipantFooter />
        </div>
      }
    >
      <AssessmentInterfaceContent />
    </Suspense>
  );
}
