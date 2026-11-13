export const SESSION_COOKIE_NAME = "edge_session";

// Shortened from 7 days to 12 hours for high-stakes assessment security,
// with a hard 24-hour verification cap on token lifetime.
export const SESSION_DURATION_SECONDS = 12 * 60 * 60;
export const MAX_SESSION_LIFETIME_MS = 24 * 60 * 60 * 1000;
const SESSION_CLOCK_SKEW_MS = 60 * 1000;
const MAX_TOKEN_LENGTH = 4096;

export type SessionRole = "ADMIN" | "EVALUATOR" | "PARTICIPANT";

export function getSessionSecret(): string {
  const configuredSecret = process.env.SESSION_SECRET;

  if (process.env.NODE_ENV === "production") {
    if (!configuredSecret || configuredSecret.length < 32) {
      throw new Error(
        "SESSION_SECRET must be configured with at least 32 characters in production."
      );
    }
    return configuredSecret;
  }

  if (!configuredSecret || configuredSecret.length < 32) {
    throw new Error(
      "SESSION_SECRET must be configured with at least 32 characters in your environment (e.g. .env or .env.local). Incompatible per-runtime fallbacks are disabled to prevent authentication redirect loops."
    );
  }

  return configuredSecret;
}

export interface SessionPayload {
  userId: string;
  email: string;
  role: SessionRole;
  name: string;
  candidateId?: string;
  institution?: string;
  mustChangePassword?: boolean;
  jti?: string;
  credVersion?: string;
  sv?: number;
  issuedAt: number;
  expiresAt: number;
}

const VALID_ROLES = new Set<SessionRole>(["ADMIN", "EVALUATOR", "PARTICIPANT"]);
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

let cachedHmacKeyPromise: Promise<CryptoKey> | null = null;
let cachedSecretUsed: string | null = null;

async function getHmacKey(): Promise<CryptoKey> {
  const secret = getSessionSecret();
  if (!cachedHmacKeyPromise || cachedSecretUsed !== secret) {
    cachedSecretUsed = secret;
    cachedHmacKeyPromise = crypto.subtle.importKey(
      "raw",
      textEncoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"]
    );
  }
  return cachedHmacKeyPromise;
}

function isValidPayloadShape(raw: unknown): raw is SessionPayload {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return false;
  }

  const candidate = raw as Record<string, unknown>;
  if (typeof candidate.userId !== "string" || candidate.userId.trim().length === 0) {
    return false;
  }
  if (typeof candidate.email !== "string" || candidate.email.trim().length === 0) {
    return false;
  }
  if (typeof candidate.role !== "string" || !VALID_ROLES.has(candidate.role as SessionRole)) {
    return false;
  }
  if (typeof candidate.name !== "string") {
    return false;
  }
  if (
    typeof candidate.issuedAt !== "number" ||
    !Number.isFinite(candidate.issuedAt) ||
    candidate.issuedAt <= 0
  ) {
    return false;
  }
  if (
    typeof candidate.expiresAt !== "number" ||
    !Number.isFinite(candidate.expiresAt) ||
    candidate.expiresAt <= 0
  ) {
    return false;
  }
  if (
    candidate.jti !== undefined &&
    (typeof candidate.jti !== "string" || candidate.jti.length < 16)
  ) {
    return false;
  }
  if (
    candidate.credVersion !== undefined &&
    (typeof candidate.credVersion !== "string" || candidate.credVersion.length === 0)
  ) {
    return false;
  }
  if (
    candidate.sv !== undefined &&
    (typeof candidate.sv !== "number" || !Number.isInteger(candidate.sv) || candidate.sv < 1)
  ) {
    return false;
  }
  return true;
}

/**
 * Creates a cryptographically signed HMAC-SHA256 session token.
 * Safe for both Edge Runtime and Node.js runtimes.
 */
export async function createSessionToken(
  data: Omit<SessionPayload, "issuedAt" | "expiresAt">,
  durationSeconds: number = SESSION_DURATION_SECONDS
): Promise<string> {
  const now = Date.now();
  const payload: SessionPayload = {
    ...data,
    jti: data.jti || crypto.randomUUID(),
    issuedAt: now,
    expiresAt: now + durationSeconds * 1000,
  };

  const payloadJson = JSON.stringify(payload);
  const payloadBytes = textEncoder.encode(payloadJson);
  const payloadBase64 = base64UrlEncode(payloadBytes);

  const key = await getHmacKey();
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    textEncoder.encode(payloadBase64)
  );
  const signatureBase64 = base64UrlEncode(new Uint8Array(signatureBuffer));

  return `${payloadBase64}.${signatureBase64}`;
}

/**
 * Validates the HMAC signature, structural integrity, and expiration bounds
 * of a session token (Edge Runtime compatible).
 */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    if (!token || typeof token !== "string" || token.length > MAX_TOKEN_LENGTH) {
      return null;
    }

    const parts = token.split(".");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      return null;
    }

    const [payloadBase64, signatureBase64] = parts;
    const signatureBytes = base64UrlDecode(signatureBase64);
    if (signatureBytes.length === 0) {
      return null;
    }

    const key = await getHmacKey();
    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes as unknown as BufferSource,
      textEncoder.encode(payloadBase64) as unknown as BufferSource
    );

    if (!isValid) return null;

    const payloadJson = textDecoder.decode(base64UrlDecode(payloadBase64));
    const parsed: unknown = JSON.parse(payloadJson);
    if (!isValidPayloadShape(parsed)) {
      return null;
    }

    const now = Date.now();
    // Reject non-positive TTL, absurdly long tokens, future-dated tokens, or expired tokens
    if (parsed.expiresAt <= parsed.issuedAt) {
      return null;
    }
    if (parsed.expiresAt - parsed.issuedAt > MAX_SESSION_LIFETIME_MS) {
      return null;
    }
    if (parsed.issuedAt > now + SESSION_CLOCK_SKEW_MS) {
      return null;
    }
    if (now >= parsed.expiresAt) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

/**
 * Resolves the canonical home route for an authenticated role.
 */
export function getRoleDestination(role: SessionRole): string {
  switch (role) {
    case "ADMIN":
      return "/admin";
    case "EVALUATOR":
      return "/evaluator";
    case "PARTICIPANT":
    default:
      return "/dashboard";
  }
}

/**
 * Validates whether a requested relative path is authorized for the given role
 * according to the exact portal boundaries enforced by middleware.ts.
 */
export function isRouteAllowedForRole(
  role: SessionRole,
  pathname: string,
  searchParams?: URLSearchParams
): boolean {
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return role === "ADMIN";
  }

  if (pathname === "/evaluator" || pathname.startsWith("/evaluator/")) {
    if (role === "EVALUATOR") return true;
    if (role === "ADMIN" && searchParams?.get("adminAudit") === "true") {
      return true;
    }
    return false;
  }

  if (
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/") ||
    pathname === "/assessment" ||
    pathname.startsWith("/assessment/")
  ) {
    return role === "PARTICIPANT";
  }

  return false;
}

/**
 * Resolves a safe post-login redirect URL. Rejects external/protocol-relative
 * URLs, auth/error loop routes, and cross-role routes (e.g. ADMIN logging in
 * from /login?redirect=/dashboard), falling back to getRoleDestination(role).
 */
export function resolvePostLoginRedirect(
  role: SessionRole,
  requestedRedirect?: string | null,
  mustChangePassword: boolean = false
): string {
  if (mustChangePassword) {
    return "/change-password";
  }

  const fallback = getRoleDestination(role);
  if (!requestedRedirect || typeof requestedRedirect !== "string") {
    return fallback;
  }

  const trimmed = requestedRedirect.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("\\")) {
    return fallback;
  }

  try {
    const parsed = new URL(trimmed, "http://localhost");
    if (parsed.origin !== "http://localhost") {
      return fallback;
    }

    if (!isRouteAllowedForRole(role, parsed.pathname, parsed.searchParams)) {
      return fallback;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

