import { env } from "cloudflare:workers";
import { getAdminApiUser, requireAdminMutation, unauthorizedAdminResponse } from "@/lib/admin-auth";
import {
  getBreederRelationSelection, listBreederRelationOptions,
  saveBreederRelationSelection, validateBreederRelations,
} from "@/lib/breeder-profile-relations";
import { mirrorBreederRelationNamesToNotion, type NotionDirectorySyncBindings } from "@/lib/notion-directory-sync";
import { sameBreederRelationIds, type BreederRelationField } from "@/lib/breeder-relation-text";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };
async function idOf(params: Props["params"]) {
  const id = Number((await params).id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function GET(_request: Request, { params }: Props) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  const id = await idOf(params);
  if (!id) return Response.json({ error: "Neplatné ID." }, { status: 400 });
  const database = (env as { DB?: D1Database }).DB;
  if (!database) return Response.json({ error: "Databáza nie je pripojená." }, { status: 503 });
  try {
    const selected = await getBreederRelationSelection(database, id);
    if (!selected) return Response.json({ error: "Chovateľská stanica sa nenašla." }, { status: 404 });
    const options = await listBreederRelationOptions(database);
    return Response.json({ selected, ...options }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "Prepojenia sa nepodarilo načítať." }, { status: 500 });
  }
}
export async function PUT(request: Request, { params }: Props) {
  const auth = await requireAdminMutation(request, { strictProvenance: true });
  if (auth.response || !auth.user) return auth.response ?? unauthorizedAdminResponse();
  const id = await idOf(params);
  if (!id) return Response.json({ error: "Neplatné ID." }, { status: 400 });
  const database = (env as { DB?: D1Database }).DB;
  if (!database) return Response.json({ error: "Databáza nie je pripojená." }, { status: 503 });
  try {
    const selected = validateBreederRelations(await request.json());
    const before = await getBreederRelationSelection(database, id);
    const saved = await saveBreederRelationSelection(database, id, selected, auth.user.email);
    // A Notion outage or an unrecognised name never rolls back the Admin save.
    const changed: BreederRelationField[] = [];
    if (before) {
      if (!sameBreederRelationIds(before.breedIds, saved.breedIds)) changed.push("breedIds");
      if (!sameBreederRelationIds(before.clubIds, saved.clubIds)) changed.push("clubIds");
    }
    if (changed.length) {
      try {
        await mirrorBreederRelationNamesToNotion({
          database, bindings: env as unknown as NotionDirectorySyncBindings,
          profileId: id, fields: changed,
        });
      } catch (error) {
        console.warn("BREEDER_NOTION_RELATION_WRITEBACK_SKIPPED", id, error);
      }
    }
    return Response.json({ selected: saved }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : "Prepojenia sa nepodarilo uložiť.",
    }, { status: 400 });
  }
}
