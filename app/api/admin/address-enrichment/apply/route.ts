import { env } from "cloudflare:workers";
import { requireAutomationAdminMutation } from "@/lib/admin-automation-api";
import { applyDirectoryAddressCanary, validateAddressCanarySelection } from "@/lib/address-enrichment-canary";
import { adminAuditActorRef } from "@/lib/audit-identity";

export const dynamic = "force-dynamic";

type Bindings = { DB?: D1Database };

export async function POST(request: Request) {
  const auth = await requireAutomationAdminMutation(request);
  if (auth.response || !auth.user) return auth.response!;

  const bindings = env as unknown as Bindings;
  if (!bindings.DB) return Response.json({ error: "Address enrichment nemá pripojenú databázu." }, { status: 503 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (body.confirm !== "ADDRESS-ENRICH-CANARY") {
    return Response.json({ error: "Chýba explicitné ADDRESS-ENRICH-CANARY potvrdenie." }, { status: 400 });
  }

  try {
    const selections = validateAddressCanarySelection(body.selections);
    const actorRef = await adminAuditActorRef(auth.user.email);
    const report = await applyDirectoryAddressCanary({
      selections,
      actorRef,
      database: bindings.DB,
    });
    return Response.json({
      report,
      persisted: report.canonicalWrites > 0,
      directGeoWrites: 0,
      fullBulkRolloutEnabled: false,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Address canary apply zlyhal." }, { status: 409 });
  }
}
