import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { downloadFromStorage } from "@/lib/storage";

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

    const resolvedParams = await params;
    if (!resolvedParams?.fileKey || resolvedParams.fileKey.length === 0) {
      return new NextResponse(
        JSON.stringify({ error: "Bad Request: Missing file key." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const fileKey = resolvedParams.fileKey.join("/");

    // 2. Authorization verification
    let resolvedFileName = "document.pdf";

    // Check if it's a candidate submission answer
    const answer = await prisma.submissionAnswer.findFirst({
      where: { fileKey },
      include: {
        submission: {
          include: {
            user: true,
          },
        },
      },
    });

    if (answer) {
      resolvedFileName = answer.fileName || "submission.pdf";

      if (session.role === "PARTICIPANT") {
        const isOwner =
          answer.submission.userId === session.userId ||
          answer.submission.user.email === session.email;

        if (!isOwner) {
          return new NextResponse(
            JSON.stringify({
              error: "Forbidden: You are not authorized to view this participant's submission file.",
            }),
            { status: 403, headers: { "Content-Type": "application/json" } }
          );
        }
      } else if (session.role === "EVALUATOR") {
        const evalUser = await prisma.user.findFirst({
          where: { OR: [{ id: session.userId }, { email: session.email }] },
        });
        const evalId = evalUser?.id || session.userId;
        const assignment = await prisma.evaluatorCandidateAssignment.findFirst({
          where: {
            contestId: answer.submission.contestId,
            evaluatorId: evalId,
            participantId: answer.submission.userId,
          },
        });
        if (!assignment) {
          return new NextResponse(
            JSON.stringify({
              error: "Forbidden: You are not assigned to evaluate this candidate.",
            }),
            { status: 403, headers: { "Content-Type": "application/json" } }
          );
        }
      }
      // Admins are permitted to inspect all submission answers
    } else {
      // Check if it's a reference material
      const reference = await prisma.referenceMaterial.findFirst({
        where: { fileKey },
        include: {
          task: {
            include: {
              phase: {
                include: {
                  contest: {
                    include: {
                      participants: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (reference) {
        resolvedFileName = reference.title || "reference.pdf";

        if (session.role === "PARTICIPANT") {
          const contestParticipants =
            reference.task?.phase?.contest?.participants || [];
          const isEnrolled = contestParticipants.some(
            (p) => p.userId === session.userId
          );

          if (!isEnrolled && reference.task?.phase?.contest?.isPublished === false) {
            return new NextResponse(
              JSON.stringify({
                error: "Forbidden: You are not enrolled in the contest for this reference material.",
              }),
              { status: 403, headers: { "Content-Type": "application/json" } }
            );
          }
        } else if (session.role === "EVALUATOR") {
          const contestId = reference.task?.phase?.contestId;
          if (contestId) {
            const evalUser = await prisma.user.findFirst({
              where: { OR: [{ id: session.userId }, { email: session.email }] },
            });
            const evalId = evalUser?.id || session.userId;
            const contestEval = await prisma.contestEvaluator.findFirst({
              where: {
                contestId,
                userId: evalId,
              },
            });
            if (!contestEval) {
              return new NextResponse(
                JSON.stringify({
                  error: "Forbidden: You are not assigned to this contest.",
                }),
                { status: 403, headers: { "Content-Type": "application/json" } }
              );
            }
          }
        }
      } else if (session.role !== "ADMIN") {
        return new NextResponse(
          JSON.stringify({ error: "Not Found or Access Denied." }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // 3. Download and stream the file from secure storage
    const { buffer, contentType, contentLength } = await downloadFromStorage(fileKey);

    const safeFileName = resolvedFileName.replace(/["\r\n]/g, "_");
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
      JSON.stringify({ error: "Internal Server Error streaming file." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

