/**
 * A single bounded retry for idempotent public rendering reads after known
 * transient D1 transport/locking failures. Never use this for writes, auth,
 * mutations, migrations, or unknown database/schema errors.
 */
export function isTransientPublicReadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return /network connection lost|\bSQLITE_(?:BUSY|LOCKED)\b|database is locked|query timed out|connection (?:reset|closed|terminated)|database is temporarily unavailable/i.test(message);
}

export async function retryTransientPublicRead<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (!isTransientPublicReadError(error)) throw error;
    // One short delay prevents immediate re-entry into the same failed D1
    // connection. A second failure remains visible for incident diagnostics.
    await new Promise<void>((resolve) => setTimeout(resolve, 120));
    return read();
  }
}
