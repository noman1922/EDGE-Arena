/**
 * Freedom CareerEdge Program Online Assessment Contest Identity & Classification
 *
 * Strict Isolation Rules:
 * 1. Stable database identity check: matches slug, ID, or title variants of Freedom CareerEdge Program.
 * 2. Selection classification rule (ONLY for Freedom contest):
 *    - 16 - 20 final marks = SELECTED
 *    - 0 - 15  final marks = PROVISIONAL
 *    - 15 must be PROVISIONAL; 16 must be SELECTED.
 * 3. Before publication, do NOT expose final selection status to participants.
 * 4. Do NOT apply this rule to any other contest.
 */

export const FREEDOM_CONTEST_SLUG = "freedom-careeredge-program-online-assessment";
export const FREEDOM_CONTEST_TITLE = "Freedom CareerEdge Program Online Assessment";

function normalizeString(str?: string | null): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeSlug(str?: string | null): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isFreedomContest(contest: {
  id?: string;
  slug?: string;
  title?: string;
} | null | undefined): boolean {
  if (!contest) return false;

  if (process.env.FREEDOM_CONTEST_ID && contest.id === process.env.FREEDOM_CONTEST_ID) {
    return true;
  }
  if (process.env.FREEDOM_CONTEST_SLUG && contest.slug === process.env.FREEDOM_CONTEST_SLUG) {
    return true;
  }

  const slug = normalizeSlug(contest.slug);
  if (
    slug === "freedom-careeredge-program-online-assessment" ||
    slug === "freedom-careeredge-program" ||
    slug === "freedom-careeredge"
  ) {
    return true;
  }

  const title = normalizeString(contest.title);
  if (
    title === "freedom careeredge program online assessment" ||
    title === "freedom careeredge program"
  ) {
    return true;
  }

  return false;
}

export type FreedomSelectionStatus = "SELECTED" | "PROVISIONAL";

/**
 * Returns the Freedom selection status based strictly on final marks:
 * 16 - 20 = SELECTED
 * 0 - 15  = PROVISIONAL
 */
export function getFreedomSelectionStatus(finalScore: number): FreedomSelectionStatus {
  return finalScore >= 16 ? "SELECTED" : "PROVISIONAL";
}
