import { getAdminApiUser, requireAdminMutation, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { facebookShareMarkerType, setFacebookShareMarker } from "@/lib/facebook-content-share-marker";

export const dynamic = "force-dynamic";
const NO_STORE = { "cache-control": "no-store" };

/** Marking is an owner's manual note, NOT a Facebook publication/approval action. */
export async function POST(request: Request) {
  const auth = await requireAdminMutation(request, { strictProvenance: true });
  if (auth.response || !auth.user) return auth.response ?? unauthorizedAdminResponse();
  const raw: unknown = await request.json().catch(() => null);
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    return Response.json({ error: "Neplatné údaje." }, {status: 400, headers: NO_STORE});
  const body = raw as Record<string, unknown>;
  const type = facebookShareMarkerType(
    typeof body.group === "string" ? body.group : "",
    typeof body.category === "string" ? body.category : "",
  );
  if (!type || !Number.isSafeInteger(body.entityId) || Number(body.entityId) <= 0 ||
      typeof body.sharedToFacebook !== "boolean")
    return Response.json({ error: "Vyber platný záznam a stav zaškrtnutia." },
      {status: 400, headers: NO_STORE});
  try {
    await setFacebookShareMarker(type, Number(body.entityId), body.sharedToFacebook, auth.user.email);
    return Response.json({ sharedToFacebook: body.sharedToFacebook }, {headers: NO_STORE});
  } catch (error) {
    const missing = error instanceof Error && /no such table:\s*facebook_content_share_markers/i.test(error.message);
    return Response.json({
      error: missing
        ? "Evidencia zdieľaní čaká na nasadenie databázovej migrácie 0154."
        : "Označenie sa nepodarilo uložiť. Skús to znova.",
    }, {status: 503, headers: NO_STORE});
  }
}

/** Never expose the owner-maintained ledger publicly. */
export async function GET() {
  if (!await getAdminApiUser()) return unauthorizedAdminResponse();
  return Response.json({error:"Stav evidencie načítavaj cez výber publikovaného obsahu."},
    {status:405, headers:NO_STORE});
}
