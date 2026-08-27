import { env } from "cloudflare:workers";
import { migrateDirectoryClubLocations } from "@/lib/directory-club-migration";

type MigrationBindings = {
  DB?: D1Database;
  DIRECTORY_LOCATION_MIGRATION_TOKEN?: string;
};

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export async function POST(request: Request) {
  const bindings = env as unknown as MigrationBindings;
  const expected = bindings.DIRECTORY_LOCATION_MIGRATION_TOKEN?.trim();
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || !safeEqual(supplied, expected)) return Response.json({ error: "Not found" }, { status: 404 });
  if (!bindings.DB || typeof bindings.DB.prepare !== "function") return Response.json({ error: "Database binding is unavailable" }, { status: 503 });
  try {
    const report = await migrateDirectoryClubLocations(bindings.DB);
    return Response.json(report, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Migration failed" }, { status: 409, headers: { "cache-control": "no-store" } });
  }
}
