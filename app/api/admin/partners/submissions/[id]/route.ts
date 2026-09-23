import { requirePartnerAdminMutation } from "@/lib/partner-admin-api";
import {
  createPartnerNewProfileAdmin,
  linkPartnerNewProfileAdmin,
  rejectPartnerNewProfileAdmin,
} from "@/lib/partner-new-profile-admin";
import { PartnerNewProfileError } from "@/lib/partner-new-profile";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePartnerAdminMutation(request);
  if (auth.response) return auth.response;
  try {
    const { id } = await params;
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new PartnerNewProfileError("Neplatný návrh.");
    const body = await request.json() as Record<string, unknown>;
    if (body.action === "CREATE_NEW") {
      const submission = await createPartnerNewProfileAdmin({
        id,
        adminEmail: auth.user.email,
        requestId: request.headers.get("cf-ray"),
      });
      return Response.json({ submission }, { headers: { "Cache-Control": "private, no-store" } });
    }
    if (body.action === "LINK_EXISTING") {
      const canonicalId = Number(body.canonicalId);
      if (!Number.isSafeInteger(canonicalId) || canonicalId <= 0) {
        throw new PartnerNewProfileError("Vyber platný existujúci profil.");
      }
      const submission = await linkPartnerNewProfileAdmin({
        id,
        canonicalId,
        adminEmail: auth.user.email,
        requestId: request.headers.get("cf-ray"),
      });
      return Response.json({ submission }, { headers: { "Cache-Control": "private, no-store" } });
    }
    if (body.action === "REJECT") {
      const submission = await rejectPartnerNewProfileAdmin({
        id,
        reasonCode: body.reasonCode,
        adminEmail: auth.user.email,
        requestId: request.headers.get("cf-ray"),
      });
      return Response.json({ submission }, { headers: { "Cache-Control": "private, no-store" } });
    }
    return Response.json({ error: "Neplatná resolution akcia." }, { status: 400 });
  } catch (error) {
    const status = error instanceof PartnerNewProfileError
      ? error.status
      : error instanceof Error && error.name === "ModerationStateConflictError" ? 409 : 500;
    return Response.json({
      error: status >= 500 ? "Rozhodnutie nového profilu sa nepodarilo uložiť." : error instanceof Error ? error.message : "Rozhodnutie zlyhalo.",
    }, { status, headers: { "Cache-Control": "private, no-store" } });
  }
}
