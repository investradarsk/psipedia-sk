import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import {
  createDirectCampaign,
  createPromotion,
  listMonetizationAdminData,
  updateDirectCampaignStatus,
  updatePromotionStatus,
} from "@/lib/monetization-store";
import type { MonetizationStatus } from "@/lib/monetization";

export const dynamic = "force-dynamic";

function validStatus(value: unknown): value is MonetizationStatus {
  return value === "draft" || value === "active" || value === "paused" || value === "archived";
}

export async function GET() {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  try {
    return Response.json(await listMonetizationAdminData());
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Monetizáciu sa nepodarilo načítať." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  try {
    const payload = await request.json() as Record<string, unknown>;
    const id = payload.kind === "promotion"
      ? await createPromotion(payload, user.email)
      : await createDirectCampaign(payload, user.email);
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Záznam sa nepodarilo uložiť." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  try {
    const payload = await request.json() as Record<string, unknown>;
    const id = typeof payload.id === "string" ? payload.id : "";
    if (!id || !validStatus(payload.status)) throw new Error("Neplatný update.");
    if (payload.kind === "promotion") await updatePromotionStatus(id, payload.status, user.email);
    else await updateDirectCampaignStatus(id, payload.status, user.email);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Záznam sa nepodarilo aktualizovať." }, { status: 400 });
  }
}
