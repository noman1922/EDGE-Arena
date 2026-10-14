/**
 * ACI Career EDGE Assess — Demo Fixtures & Sample Benchmarks
 * 
 * DISCLAIMER:
 * All records, names, candidate IDs, scores, and institution names in this file
 * are synthetic demo fixtures created solely for UI/UX testing and workflow verification.
 * They do NOT represent actual ACI candidates, proprietary evaluation records, or real metrics.
 */

export interface ContestFixture {
  id: string;
  name: string;
  stage: string;
  status: "Live" | "Completed" | "Draft";
  track: string;
  cohortText: string;
  cohortSubtext: string;
  submitted: number;
  total: number;
  dates: string;
  daysLeft: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  avgScore: string;
  progress: number;
  badgeColor: string;
  rubrics: { name: string; weight: number; passRate: number }[];
  recentUploads: { name: string; time: string; score?: string }[];
}

export const DEMO_EVALUATOR = {
  name: "Demo Evaluator",
  title: "Chief Evaluator (Demo Panel)",
  avatarInitials: "DE",
  cohort: "Cohort CLP-2025 (Demo)",
};

export const DEMO_CANDIDATE = {
  name: "Demo Candidate",
  id: "DEMO-CANDIDATE-01",
  cohort: "Cohort Delta (Demo Group)",
  program: "Career EDGE Academy · Campus Leadership Programme (Demo)",
  avatarInitials: "DC",
};

export const DEMO_METRICS = {
  activeContests: { value: "2", total: "3", note: "2 live · 1 upcoming" },
  enrolledLeaders: { value: "75", note: "Sample cohort across 12 institutions" },
  pendingEvaluations: { value: "14", note: "Sample submissions awaiting panel review" },
  avgCompletion: { value: "88.4%", note: "Sample cohort benchmark progress" },
  evaluationVelocity: { value: "92.4%", change: "+4.1%", note: "Rubrics scored within SLA window (Simulated)" },
  integrityIndex: { value: "99.8%", note: "0 Flagged anomalies (Proctoring Simulation)" },
  nextMilestone: { value: "4 Days", note: "Stage 2 Submission Cut-off (Simulated)" },
};

export const DEMO_CONTESTS: ContestFixture[] = [
  {
    id: "demo-ncic-2025",
    name: "[Sample Benchmark] Campus ESG Transformation Strategy 2025",
    stage: "Stage 2: ESG Transformation & Policy Modeling",
    status: "Live",
    track: "Track A (Sample)",
    cohortText: "75 Demo Leaders",
    cohortSubtext: "100% active roster",
    submitted: 61,
    total: 75,
    progress: 81.3,
    dates: "Jan 15 – Feb 28, 2025",
    daysLeft: "4 days left",
    icon: "military_tech",
    iconBg: "bg-primary-fixed/40",
    iconColor: "text-primary-container",
    avgScore: "88.2 / 100",
    badgeColor: "bg-tertiary-fixed text-on-tertiary-fixed",
    rubrics: [
      { name: "Analytical Depth & Quantitative Proof", weight: 40, passRate: 92 },
      { name: "ESG Alignment & Global Compliance", weight: 35, passRate: 84 },
      { name: "Executive Communication & Defense", weight: 25, passRate: 68 },
    ],
    recentUploads: [
      { name: "Candidate 104 (Demo)", time: "Uploaded 14m ago" },
      { name: "Candidate 102 (Demo)", time: "1h ago", score: "Graded 94/100" },
    ],
  },
  {
    id: "demo-ideation-hackathon",
    name: "[Sample Challenge] Sustainable Enterprise Ideation",
    stage: "Phase 1: Idea Pitch & Problem Discovery",
    status: "Live",
    track: "Track B (Sample)",
    cohortText: "75 Demo Leaders",
    cohortSubtext: "Sample Cohort Groups",
    submitted: 44,
    total: 75,
    progress: 58.6,
    dates: "Feb 01 – Mar 10, 2025",
    daysLeft: "24 days left",
    icon: "lightbulb",
    iconBg: "bg-secondary-fixed/40",
    iconColor: "text-secondary",
    avgScore: "84.5 / 100",
    badgeColor: "bg-tertiary-fixed text-on-tertiary-fixed",
    rubrics: [
      { name: "Problem Validation & Market Gap", weight: 40, passRate: 88 },
      { name: "Feasibility & Resource Model", weight: 35, passRate: 76 },
      { name: "Team Velocity & Pitch Quality", weight: 25, passRate: 82 },
    ],
    recentUploads: [
      { name: "Candidate 208 (Demo)", time: "Uploaded 32m ago" },
      { name: "Candidate 203 (Demo)", time: "2h ago", score: "Graded 89/100" },
    ],
  },
  {
    id: "demo-ethical-leadership",
    name: "[Sample Archive] Ethical Leadership & Crisis Management",
    stage: "Evaluation Finalisation & Verification",
    status: "Completed",
    track: "Track C (Sample)",
    cohortText: "75 Demo Leaders",
    cohortSubtext: "Evaluated & Certified",
    submitted: 75,
    total: 75,
    progress: 100,
    dates: "Dec 01 – Jan 10, 2025",
    daysLeft: "Completed",
    icon: "verified_user",
    iconBg: "bg-surface-container-high",
    iconColor: "text-secondary",
    avgScore: "91.8 / 100",
    badgeColor: "bg-secondary-fixed text-on-secondary-fixed",
    rubrics: [
      { name: "Ethical Governance Framework", weight: 50, passRate: 96 },
      { name: "Crisis Decision Logic", weight: 50, passRate: 94 },
    ],
    recentUploads: [
      { name: "Archived Cohort (Demo)", time: "Finalized Jan 10", score: "All 75 Certified" },
    ],
  },
  {
    id: "demo-policy-simulation",
    name: "[Draft Template] Executive Policy Simulation",
    stage: "Configuration Draft - Rubrics in Progress",
    status: "Draft",
    track: "Strategic Simulation",
    cohortText: "Unassigned",
    cohortSubtext: "Awaiting cohort sync",
    submitted: 0,
    total: 75,
    progress: 0,
    dates: "Opens Apr 2025",
    daysLeft: "Upcoming",
    icon: "policy",
    iconBg: "bg-surface-container",
    iconColor: "text-secondary",
    avgScore: "Pending",
    badgeColor: "bg-surface-container-high text-secondary",
    rubrics: [
      { name: "Policy Structuring", weight: 50, passRate: 0 },
      { name: "Simulation Accuracy", weight: 50, passRate: 0 },
    ],
    recentUploads: [],
  },
];

export const DEMO_EVALUATION_STREAM = [
  {
    id: "stream-1",
    evaluator: "Evaluator A (Demo Panel)",
    initials: "EA",
    bg: "bg-tertiary-fixed text-on-tertiary-fixed",
    submissionCode: "#DEMO-SUB-1042",
    detail: "Reviewed submission for [Sample Benchmark]",
    score: "Score: 94/100",
    time: "14m ago",
  },
  {
    id: "stream-2",
    evaluator: "Evaluator B (Demo Panel)",
    initials: "EB",
    bg: "bg-secondary-fixed text-on-secondary-fixed",
    submissionCode: "4 rubrics applied",
    detail: "Graded 4 written answers for [Sample ESG]",
    score: "",
    time: "42m ago",
  },
  {
    id: "stream-3",
    evaluator: "Admissions Verification Service (Mock)",
    initials: "AV",
    icon: "verified_user",
    bg: "bg-secondary-container text-on-secondary-container",
    submissionCode: "Verified Identity",
    detail: "Confirmed demo candidate credentials for 8 profiles",
    score: "",
    time: "2h ago",
  },
  {
    id: "stream-4",
    evaluator: "Proctoring Integrity Engine (Mock)",
    initials: "PI",
    icon: "auto_graph",
    bg: "bg-tertiary-fixed text-on-tertiary-fixed",
    submissionCode: "0 Violations logged",
    detail: "Automated session check completed for Session #DEMO-883",
    score: "",
    time: "3h ago",
  },
];

export const DEMO_INSTITUTIONS = [
  "National Campus Cluster A",
  "Institute of Technology B",
  "Metropolitan Academy C",
  "+9 Sample Campuses",
];
