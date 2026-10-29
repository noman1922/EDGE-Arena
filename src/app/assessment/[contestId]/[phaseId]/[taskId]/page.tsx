"use client";

import React from "react";
import { useParams } from "next/navigation";
import { AssessmentDocumentReader } from "@/components/assessment/assessment-document-reader";

export default function AssessmentUnitReaderPage() {
  const params = useParams();
  const contestId = typeof params?.contestId === "string" ? params.contestId : undefined;
  const phaseId = typeof params?.phaseId === "string" ? params.phaseId : undefined;
  const taskId = typeof params?.taskId === "string" ? params.taskId : undefined;

  return (
    <AssessmentDocumentReader
      key={`${contestId}-${phaseId}-${taskId}`}
      initialContestId={contestId}
      initialPhaseId={phaseId}
      initialTaskId={taskId}
    />
  );
}
