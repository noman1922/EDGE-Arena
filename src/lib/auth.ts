import { cookies } from "next/headers";
import { cache } from "react";

export const SESSION_COOKIE_NAME = "edge_session";

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
  role: "ADMIN" | "EVALUATOR" | "PARTICIPANT";
  name: string;
  candidateId?: string;
  institution?: string;
  mustChangePassword?: boolean;
  issuedAt: number;
  expiresAt: number;
}

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

/**
 * Creates a cryptographically signed HMAC-SHA256 session token.
 */
export async function createSessionToken(
  data: Omit<SessionPayload, "issuedAt" | "expiresAt">,
  durationSeconds: number = 7 * 24 * 3600 // 7 days default
): Promise<string> {
  const now = Date.now();
  const payload: SessionPayload = {
    ...data,
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
 * Validates the HMAC signature and expiration of a session token.
 */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;

    const [payloadBase64, signatureBase64] = parts;
    const signatureBytes = base64UrlDecode(signatureBase64);

    const key = await getHmacKey();
    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes as unknown as BufferSource,
      textEncoder.encode(payloadBase64) as unknown as BufferSource
    );

    if (!isValid) return null;

    const payloadJson = textDecoder.decode(base64UrlDecode(payloadBase64));
    const payload: SessionPayload = JSON.parse(payloadJson);

    // Verify expiration
    if (Date.now() > payload.expiresAt) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

let currentTestSession: SessionPayload | null | undefined = undefined;

export function setTestSession(
  session:
    | (Omit<SessionPayload, "issuedAt" | "expiresAt"> & Partial<Pick<SessionPayload, "issuedAt" | "expiresAt">>)
    | null
    | undefined
) {
  if (session) {
    currentTestSession = {
      issuedAt: session.issuedAt ?? Date.now(),
      expiresAt: session.expiresAt ?? Date.now() + 7 * 24 * 3600 * 1000,
      ...session,
    };
  } else {
    currentTestSession = session;
  }
}

/**
 * Reads and verifies the current session from incoming HTTP cookies.
 * Request-scoped memoization via React cache prevents duplicate cookie reads
 * and HMAC verification within a single render cycle.
 */
export const getSession = cache(async (): Promise<SessionPayload | null> => {
  if (currentTestSession !== undefined) {
    return currentTestSession;
  }
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!token) return null;
    return await verifySessionToken(token);
  } catch {
    return null;
  }
});

/**
 * Requires an active authenticated session.
 */
export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized: Active authentication session required.");
  }
  return session;
}

/**
 * Enforces role-based authorization for the active session.
 */
export async function requireRole(
  allowedRoles: ("ADMIN" | "EVALUATOR" | "PARTICIPANT")[]
): Promise<SessionPayload> {
  const session = await requireSession();
  if (session.mustChangePassword) {
    throw new Error(
      "Password change required: You must change your temporary password before accessing platform functionality."
    );
  }
  if (!allowedRoles.includes(session.role)) {
    throw new Error(
      `Forbidden: Role ${session.role} is not authorized for this operation. Requires one of: ${allowedRoles.join(", ")}.`
    );
  }
  return session;
}

/**
 * Resolves the canonical dashboard destination based on user role.
 */
export function getRoleDestination(role: "ADMIN" | "EVALUATOR" | "PARTICIPANT"): string {
  switch (role) {
    case "ADMIN":
      return "/admin";
    case "EVALUATOR":
      return "/evaluator";
    case "PARTICIPANT":
      return "/dashboard";
    default:
      return "/dashboard";
  }
}

/**
 * Sets the signed session cookie in the HTTP response.
 */
export async function setSessionCookie(token: string): Promise<void> {
  try {
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });
  } catch {
    // Standalone runner / test context fallback when cookies() is called outside request scope
  }
}

/**
 * Clears the session cookie on logout.
 */
export async function clearSessionCookie(): Promise<void> {
  try {
    const cookieStore = await cookies();
    cookieStore.delete(SESSION_COOKIE_NAME);
  } catch {
    // Standalone runner / test context fallback
  }
}
