import { env } from "cloudflare:workers";
import { syncSavedNotionRecord, type TargetedNotionSaveBindings } from "@/lib/notion-targeted-admin-save";
import { unauthorizedAdminResponse, requireAdminMutation } from "@/lib/admin-auth";
import { isAdoptionAdminConflict, updateAdoptionFromAdmin } from "@/lib/adoption-admin-write";
import type { ManagedAdoptionInput } from "@/lib/adoption";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };
type Body = { payload?: ManagedAdoptionInput; expectedUpdatedAt?: string };
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
async function numericId(params: Props["params"]) { const value = Number.parseInt((await params).id, 10); return Number.isSafeInteger(value) && value > 0 ? value : null; }
function errorResponse(error: unknown) {
  const conflict = isAdoptionAdminConflict(error);
  const message = error instanceof Error ? error.message : "Adopčný profil sa nepodarilo uložiť.";
  return Response.json({ error: message }, { status: conflict ? 409 : 400 });
}

export async function PUT(request: Request, { params }: Props) {
  const auth = await requireAdminMutation(request, { strictProvenance: true });
  if (auth.response || !auth.user) return auth.response ?? unauthorizedAdminResponse();
  const user = auth.user;
  const id = await numericId(params);
  if (!id) return Response.json({ error: "Neplatné ID adopčného profilu." }, { status: 400 });
  try {
    const body = await request.json() as Body;
    if (!isRecord(body) || !isRecord(body.payload) || typeof body.expectedUpdatedAt !== "string") {
      return Response.json({ error: "Neplatný payload adopčného profilu alebo chýbajúca verzia záznamu." }, { status: 400 });
    }
    const item = await updateAdoptionFromAdmin(id, body.payload as ManagedAdoptionInput, user.email, body.expectedUpdatedAt);
    if (!item) return Response.json({ error: "Adopčný profil sa nenašiel." }, { status: 404 });
    const notionFieldSync = await syncSavedNotionRecord({ bindings: env as unknown as TargetedNotionSaveBindings, agenda: "adoptions", entityId: id });
    return Response.json({ item, notionFieldSync });
  } catch (error) {
    return errorResponse(error);
  }
}
