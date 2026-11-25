import { logStability, stabilityDuration, type StabilityStage } from "./stability-diagnostics.ts";

/**
 * A single bounded retry for explicitly idempotent data reads after known
 * transient D1 transport/locking failures. Never wrap writes, auth, mutations,
 * migrations, a whole request handler, or an already retried reader.
 */
const TRANSIENT_READ_ERROR =
  /network connection lost|\bSQLITE_(?:BUSY|LOCKED)\b|database is locked|query timed out|connection (?:reset|closed|terminated)|database is temporarily unavailable/i;
const PERMANENT_READ_ERROR =
  /no such (?:column|table)|\bSQLITE_(?:CONSTRAINT|ERROR|CORRUPT|NOTADB|MISMATCH)\b|constraint failed|access denied|unauthorized|forbidden|permission denied|(?:request|operation) (?:aborted|cancelled|canceled)|\bAbortError\b|NEXT_REDIRECT|NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK/i;

export function isTransientPublicReadError(error: unknown): boolean {
  // Inspect a bounded cause chain (D1/Drizzle may wrap the transport error).
  // An abort, auth/schema error or framework control-flow signal always wins.
  const seen = new Set<Error>();
  let current = error;
  let transient = false;
  for (let depth = 0; depth < 8; depth += 1) {
    if (typeof current === "string") {
      return (
        !PERMANENT_READ_ERROR.test(current) &&
        (transient || TRANSIENT_READ_ERROR.test(current))
      );
    }
    if (!(current instanceof Error) || seen.has(current)) break;
    seen.add(current);
    const detail = current as Error & {
      digest?: unknown;
      status?: unknown;
      statusCode?: unknown;
    };
    const status = detail.status ?? detail.statusCode;
    if (
      current.name === "AbortError" ||
      (typeof status === "number" && status >= 400 && status < 500) ||
      (typeof detail.digest === "string" && detail.digest.startsWith("NEXT_")) ||
      PERMANENT_READ_ERROR.test(current.message)
    ) {
      return false;
    }
    transient ||= TRANSIENT_READ_ERROR.test(current.message);
    current = current.cause;
  }
  // An unresolved chain beyond the limit is not a verified transient failure.
  return (current === undefined || current === null) && transient;
}

type ReadRetryOptions = { signal?: AbortSignal; stage?: StabilityStage };

export async function retryTransientPublicRead<T>(
  read: () => Promise<T>,
  { signal, stage = "unspecified" }: ReadRetryOptions = {},
): Promise<T> {
  const start = performance.now();
  const report = (outcome: "retrying" | "recovered" | "exhausted" | "aborted" | "not_retryable", attempt: 0 | 1 | 2, transient?: boolean) =>
    logStability({ stage, dependency: "read", outcome, attempt, transient, durationMs: stabilityDuration(start) });
  if (signal?.aborted) {
    report("aborted", 0);
    signal.throwIfAborted();
  }
  try {
    return await read();
  } catch (error) {
    if (signal?.aborted || (error instanceof Error && error.name === "AbortError")) {
      report("aborted", 1);
      throw error;
    }
    if (!isTransientPublicReadError(error)) {
      // Framework control-flow is not an operational error.
      const digest = error instanceof Error ? (error as Error & { digest?: unknown }).digest : undefined;
      if (!(typeof digest === "string" && digest.startsWith("NEXT_"))) report("not_retryable", 1, false);
      throw error;
    }
    report("retrying", 1, true);
    await new Promise<void>((resolve) => setTimeout(resolve, 120));
    if (signal?.aborted) {
      report("aborted", 1);
      signal.throwIfAborted();
    }
    try {
      const result = await read();
      report("recovered", 2, true);
      return result;
    } catch (retryError) {
      const aborted = signal?.aborted || (retryError instanceof Error && retryError.name === "AbortError");
      const digest = retryError instanceof Error ? (retryError as Error & { digest?: unknown }).digest : undefined;
      if (!(typeof digest === "string" && digest.startsWith("NEXT_"))) {
        report(aborted ? "aborted" : "exhausted", 2, isTransientPublicReadError(retryError));
      }
      throw retryError;
    }
  }
}

// Same policy for explicitly verified authenticated data reads, never auth.
export const retryTransientRead = retryTransientPublicRead;
