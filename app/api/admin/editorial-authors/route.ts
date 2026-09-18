import { env } from "cloudflare:workers";
import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import {
  createEditorialAuthorProfile,
  listEditorialAuthorProfiles,
  type EditorialAuthorProfileInput,
} from "@/lib/editorial-authors";

export const dynamic = "force-dynamic";

type RuntimeBindings = { DB?: D1Database };

function databaseBinding() {
  const database = (env as unknown as RuntimeBindings).DB;
  if (!database || typeof database.prepare !== "function") {
    throw new Error("Databáza redakcie zatiaľ nie je pripojená.");
  }
  return database;
}

export async function GET() {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  try {
    const authors = await listEditorialAuthorProfiles(databaseBinding(), true);
    return Response.json({ authors });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Autorov sa nepodarilo načítať." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  try {
    const payload = (await request.json()) as EditorialAuthorProfileInput;
    const author = await createEditorialAuthorProfile(databaseBinding(), payload);
    return Response.json({ author }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Profil autora sa nepodarilo vytvoriť." }, { status: 400 });
  }
}
