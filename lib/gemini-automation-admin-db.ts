import { env } from "cloudflare:workers";

/** Runtime-only Cloudflare binding, isolated from pure SQLite store contracts. */
export function requireGeminiAdminD1(): D1Database {
  const database = (env as unknown as { DB?: D1Database }).DB;
  if (!database || typeof database.prepare !== "function") throw new Error("GEMINI_D1_UNAVAILABLE");
  return database;
}
