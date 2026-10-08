import { env } from "cloudflare:workers";
import type { GeminiD1 } from "./gemini-automation-store.ts";

/** Runtime-only Cloudflare binding, isolated from pure SQLite store contracts. */
export function requireGeminiAdminD1(): GeminiD1 {
  const database = (env as unknown as { DB?: D1Database }).DB;
  if (!database || typeof database.prepare !== "function") throw new Error("GEMINI_D1_UNAVAILABLE");
  return database;
}
