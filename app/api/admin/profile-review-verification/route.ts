import { requireAdminMutation } from "@/lib/admin-auth";
import { readProfileReviewVerificationSettings, saveProfileReviewVerificationSettings } from "@/lib/profile-review-verification-settings";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  const auth = await requireAdminMutation(request, { strictProvenance: true });
  if (auth.response) return auth.response;
  if (!auth.user) return Response.json({ error: "Nemáte oprávnenie." }, { status: 401 });
  let value: unknown;
  try {
    const body = await request.json() as { emailRequired?: unknown } | null;
    value = body?.emailRequired;
  } catch {
    return Response.json({ error: "Neplatné údaje." }, { status: 400 });
  }
  if (typeof value !== "boolean") return Response.json({ error: "Vyberte platný režim overovania." }, { status: 400 });
  try {
    await saveProfileReviewVerificationSettings(value, auth.user.email);
    return Response.json(await readProfileReviewVerificationSettings(), { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "Nastavenie sa nepodarilo uložiť. Overte dostupnosť databázy a konfigurácie." }, { status: 503 });
  }
}
