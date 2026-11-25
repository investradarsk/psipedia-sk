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

type ReadRetryOptions = { signal?: AbortSignal };

export async function retryTransientPublicRead<T>(
  read: () => Promise<T>,
  { signal }: ReadRetryOptions = {},
): Promise<T> {
  signal?.throwIfAborted();
  try {
    return await read();
  } catch (error) {
    if (signal?.aborted || !isTransientPublicReadError(error)) throw error;
    // One short delay prevents immediate re-entry into the same failed D1
    // connection. A second failure remains visible for incident diagnostics.
    await new Promise<void>((resolve) => setTimeout(resolve, 120));
    signal?.throwIfAborted();
    return read();
  }
}

// Same policy for explicitly verified authenticated data reads, never auth.
export const retryTransientRead = retryTransientPublicRead;
