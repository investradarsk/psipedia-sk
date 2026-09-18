import { env } from "cloudflare:workers";
import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import {
  updateEditorialAuthorProfile,
  type EditorialAuthorProfileInput,
} from "@/lib/editorial-authors";

export const dynamic = "force-dynamic";

type RuntimeBindings = { DB?: D1Database };
type RouteProps = { params: Promise<{ id: string }> };

function databaseBinding() {
  const database = (env as unknown as RuntimeBindings).DB;
  if (!database || typeof database.prepare !== "function") {
    throw new Error("Databáza redakcie zatiaľ nie je pripojená.");
  }
  return database;
}

export async function PUT(request: Request, { params }: RouteProps) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  const { id } = await params;
  const numericId = Number.parseInt(id, 10);
  if (!Number.isSafeInteger(numericId) || numericId < 1) {
    return Response.json({ error: "Neplatné ID autora." }, { status: 400 });
  }

  try {
    const payload = (await request.json()) as EditorialAuthorProfileInput;
    const author = await updateEditorialAuthorProfile(databaseBinding(), numericId, payload);
    return Response.json({ author });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Profil autora sa nepodarilo uložiť." }, { status: 400 });
  }
}
