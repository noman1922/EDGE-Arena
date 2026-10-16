/**
 * Next.js Instrumentation Hook
 * Executes once when the Next.js server runtime boots.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Intercept benign client connection aborts (ECONNRESET, EPIPE, AbortError)
    // caused by client browser refreshes, tab switches, and prefetch cancellations.
    process.on("uncaughtException", (err: unknown) => {
      const e = err as { code?: string; message?: string; name?: string } | null;
      const isClientAbort =
        e?.code === "ECONNRESET" ||
        e?.code === "EPIPE" ||
        e?.message === "aborted" ||
        e?.name === "AbortError" ||
        (typeof e?.message === "string" && e.message.toLowerCase().includes("aborted"));

      if (isClientAbort) {
        return;
      }
      console.error("Uncaught exception in Node runtime:", err);
    });

    process.on("unhandledRejection", (reason: unknown) => {
      const r = reason as { code?: string; message?: string; name?: string } | null;
      const isClientAbort =
        r?.code === "ECONNRESET" ||
        r?.code === "EPIPE" ||
        r?.message === "aborted" ||
        r?.name === "AbortError" ||
        (typeof r?.message === "string" && r.message.toLowerCase().includes("aborted"));

      if (isClientAbort) {
        return;
      }
      console.error("Unhandled rejection in Node runtime:", reason);
    });
  }
}
