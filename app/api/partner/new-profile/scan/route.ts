import { env } from "cloudflare:workers";
import { requirePartnerAccount } from "@/lib/partner-auth";
import { PartnerNewProfileError, scanPartnerNewProfileForAccount } from "@/lib/partner-new-profile";
import { getPartnerDatabase } from "@/lib/partner-auth-store";
import { assertPartnerJsonMutation, enforcePartnerNewProfileScanRateLimit, PartnerSecurityError } from "@/lib/partner-security";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertPartnerJsonMutation(request);
    const identity = await requirePartnerAccount({ cookieHeader: request.headers.get("cookie") });
    const body = await request.json() as Record<string, unknown>;
    const bindings=env as unknown as {DB?:D1Database;PII_HASH_KEY?:string};
    const hashKey=bindings.PII_HASH_KEY?.trim();
    if(!hashKey)throw new PartnerNewProfileError("Bezpečnostná konfigurácia nie je dostupná.",503);
    const database=getPartnerDatabase(bindings.DB);
    await enforcePartnerNewProfileScanRateLimit({database,accountId:identity.accountId,hashKey});
    const result = await scanPartnerNewProfileForAccount({
      accountId: identity.accountId,
      resourceType: body.resourceType,
      profile: body.profile,
      database,
    });
    return Response.json({
      confidence: result.scan.confidence,
      candidates: result.partnerCandidates,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const status = error instanceof PartnerNewProfileError || error instanceof PartnerSecurityError
      ? error.status
      : typeof (error as { status?: unknown })?.status === "number"
        ? (error as { status: number }).status
        : 503;
    return Response.json({
      error: status >= 500 ? "Kontrolu duplicít momentálne nie je možné vykonať." : error instanceof Error ? error.message : "Požiadavka zlyhala.",
    }, { status, headers: { "Cache-Control": "private, no-store" } });
  }
}
