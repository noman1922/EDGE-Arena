import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { authorizeFileAccess } from "@/lib/file-authorization";
import { downloadFromStorage, validateStorageSegments } from "@/lib/storage";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ fileKey: string[] }> }
) {
  try {
    // 1. Authenticate user
    const session = await getSession();
    if (!session) {
      return new NextResponse(
        JSON.stringify({ error: "Unauthorized: Active authentication session required." }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }
    if (session.mustChangePassword) {
      return new NextResponse(
        JSON.stringify({ error: "Forbidden: Password change required before accessing files." }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    const resolvedParams = await params;
    if (!resolvedParams?.fileKey || resolvedParams.fileKey.length === 0) {
      return new NextResponse(
        JSON.stringify({ error: "Bad Request: Missing file key." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. Reject path traversal or malformed segments before joining
    const segmentCheck = validateStorageSegments(resolvedParams.fileKey);
    if (!segmentCheck.isValid || !segmentCheck.normalizedKey) {
      return new NextResponse(
        JSON.stringify({ error: "Bad Request: Invalid file key." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 3. Enforce unified path, active DB account, and relationship authorization
    const access = await authorizeFileAccess(session, segmentCheck.normalizedKey);
    if (!access.authorized) {
      return new NextResponse(
        JSON.stringify({ error: access.error }),
        { status: access.status, headers: { "Content-Type": "application/json" } }
      );
    }

    // 4. Download and stream the file from secure storage
    const { buffer, contentType, contentLength } = await downloadFromStorage(access.fileKey);

    const safeFileName = access.fileName.replace(/["\r\n]/g, "_");
    const searchParams = _request.nextUrl.searchParams;
    const isDownload =
      searchParams.get("download") === "1" ||
      searchParams.get("dl") === "1" ||
      searchParams.get("attachment") === "1";

    const dispositionType = isDownload ? "attachment" : "inline";

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": contentType || "application/pdf",
        "Content-Length": contentLength.toString(),
        "Content-Disposition": `${dispositionType}; filename="${safeFileName}"`,
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Secure file download route error:", error);
    return new NextResponse(
      JSON.stringify({ error: "Unable to retrieve requested file." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
