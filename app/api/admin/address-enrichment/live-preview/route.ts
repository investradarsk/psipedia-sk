import { env } from "cloudflare:workers";
import { requireAutomationAdminMutation } from "@/lib/admin-automation-api";
import { boundedCanarySize } from "@/lib/address-enrichment";
import { previewLiveDirectoryAddressCanary } from "@/lib/address-enrichment-canary";
import { auditDirectoryAddressInventory } from "@/lib/address-enrichment-store";

export const dynamic = "force-dynamic";

type Bindings = { DB?: D1Database };

export async function POST(request: Request) {
  const auth = await requireAutomationAdminMutation(request);
  if (auth.response || !auth.user) return auth.response!;

  const bindings = env as unknown as Bindings;
  if (!bindings.DB) return Response.json({ error: "Address enrichment nemá pripojenú databázu." }, { status: 503 });

  const body = await request.json().catch(() => ({})) as { limit?: unknown };
  const limit = boundedCanarySize(body.limit);

  try {
    const [inventory, preview] = await Promise.all([
      auditDirectoryAddressInventory(bindings.DB),
      previewLiveDirectoryAddressCanary({ limit, database: bindings.DB }),
    ]);
    return Response.json({
      readOnly: true,
      productionWrites: 0,
      canonicalWrites: 0,
      geoWrites: 0,
      inventory,
      preview,
      note: "LIVE_CANARY_PREVIEW môže vykonať bounded first-party fetch, Tavily discovery a Geoapify verification, ale nemení canonical DIRECTORY ani GEO dáta.",
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Address canary preview zlyhal." }, { status: 500 });
  }
}
