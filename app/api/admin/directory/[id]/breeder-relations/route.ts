import { env } from "cloudflare:workers";
import { getAdminApiUser, requireAdminMutation, unauthorizedAdminResponse } from "@/lib/admin-auth";
import {
  getBreederRelationSelection, listBreederRelationOptions,
  saveBreederRelationSelection, validateBreederRelations,
} from "@/lib/breeder-profile-relations";

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
    const saved = await saveBreederRelationSelection(database, id, selected, auth.user.email);
    return Response.json({ selected: saved }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : "Prepojenia sa nepodarilo uložiť.",
    }, { status: 400 });
  }
}
