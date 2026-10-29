import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  verifySessionToken,
  SESSION_COOKIE_NAME,
  getRoleDestination,
} from "./lib/auth";

export async function middleware(request: NextRequest) {
  // Gracefully discard already aborted client requests
  if (request.signal?.aborted) {
    return new NextResponse(null, { status: 499 });
  }

  const { pathname } = request.nextUrl;

  // Extract session token from cookie
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = sessionCookie ? await verifySessionToken(sessionCookie) : null;

  // 1. Password change mandatory interception:
  // If user is flagged to change password, force redirect to /change-password
  if (session?.mustChangePassword) {
    if (pathname === "/change-password" || pathname.startsWith("/api/auth/logout")) {
      return NextResponse.next();
    }
    // Block access to all other pages until password is changed
    return NextResponse.redirect(new URL("/change-password", request.url));
  }

  // 2. Change password route guard:
  // If user visits /change-password without a session, redirect to /login.
  // If user already changed password (mustChangePassword is false), redirect to role destination.
  if (pathname === "/change-password") {
    if (!session) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    if (!session.mustChangePassword) {
      const destination = getRoleDestination(session.role);
      return NextResponse.redirect(new URL(destination, request.url));
    }
    return NextResponse.next();
  }

  // 3. Root route: redirect authenticated users to their role panel, or unauthenticated to /login
  if (pathname === "/") {
    if (session) {
      const destination = getRoleDestination(session.role);
      return NextResponse.redirect(new URL(destination, request.url));
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // 4. Login page: If already authenticated -> redirect to role panel
  if (pathname === "/login") {
    if (session) {
      const destination = getRoleDestination(session.role);
      return NextResponse.redirect(new URL(destination, request.url));
    }
    return NextResponse.next();
  }

  // 5. Unauthorized boundary page: always allow
  if (pathname === "/unauthorized") {
    return NextResponse.next();
  }

  // 6. Protected Routes - Require Authentication
  const isProtectedPath =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/evaluator") ||
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/assessment");

  if (isProtectedPath && !session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 7. Strict Role-Based Route Access Enforcement
  if (session) {
    // Admin panel: strictly ADMIN only
    if (pathname.startsWith("/admin")) {
      if (session.role !== "ADMIN") {
        const unauthorizedUrl = new URL("/unauthorized", request.url);
        unauthorizedUrl.searchParams.set("required", "ADMIN");
        unauthorizedUrl.searchParams.set("current", session.role);
        return NextResponse.redirect(unauthorizedUrl);
      }
    }

    // Evaluator panel: EVALUATOR only (or ADMIN approved inspection with ?adminAudit=true)
    if (pathname.startsWith("/evaluator")) {
      if (session.role === "PARTICIPANT") {
        const unauthorizedUrl = new URL("/unauthorized", request.url);
        unauthorizedUrl.searchParams.set("required", "EVALUATOR");
        unauthorizedUrl.searchParams.set("current", session.role);
        return NextResponse.redirect(unauthorizedUrl);
      }
      if (session.role === "ADMIN" && request.nextUrl.searchParams.get("adminAudit") !== "true") {
        const unauthorizedUrl = new URL("/unauthorized", request.url);
        unauthorizedUrl.searchParams.set("required", "EVALUATOR");
        unauthorizedUrl.searchParams.set("current", session.role);
        return NextResponse.redirect(unauthorizedUrl);
      }
      if (session.role !== "EVALUATOR" && session.role !== "ADMIN") {
        const unauthorizedUrl = new URL("/unauthorized", request.url);
        unauthorizedUrl.searchParams.set("required", "EVALUATOR");
        unauthorizedUrl.searchParams.set("current", session.role);
        return NextResponse.redirect(unauthorizedUrl);
      }
    }

    // Participant workspace: PARTICIPANT only
    if (pathname.startsWith("/dashboard") || pathname.startsWith("/assessment")) {
      if (session.role !== "PARTICIPANT") {
        const unauthorizedUrl = new URL("/unauthorized", request.url);
        unauthorizedUrl.searchParams.set("required", "PARTICIPANT");
        unauthorizedUrl.searchParams.set("current", session.role);
        return NextResponse.redirect(unauthorizedUrl);
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/admin/:path*",
    "/evaluator/:path*",
    "/dashboard/:path*",
    "/assessment/:path*",
    "/change-password",
    "/login",
    "/unauthorized",
  ],
};

