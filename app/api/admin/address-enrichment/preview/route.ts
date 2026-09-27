import { env } from "cloudflare:workers";
import { requireAutomationAdminMutation } from "@/lib/admin-automation-api";
import {
  auditDirectoryAddressInventory,
  previewDirectoryAddressEnrichment,
} from "@/lib/address-enrichment-store";
import { boundedBatchSize } from "@/lib/address-enrichment";

export const dynamic = "force-dynamic";

type Bindings = { DB?: D1Database };

export async function POST(request: Request) {
  const auth = await requireAutomationAdminMutation(request);
  if (auth.response || !auth.user) return auth.response!;

  const bindings = env as unknown as Bindings;
  if (!bindings.DB) {
    return Response.json({ error: "Address enrichment nemá pripojenú databázu." }, { status: 503 });
  }

  const body = await request.json().catch(() => ({})) as { limit?: unknown };
  const limit = boundedBatchSize(body.limit);

  try {
    const [inventory, preview] = await Promise.all([
      auditDirectoryAddressInventory(bindings.DB),
      previewDirectoryAddressEnrichment({ limit, database: bindings.DB }),
    ]);

    return Response.json({
      readOnly: true,
      productionWrites: 0,
      liveBulkDiscovery: false,
      providerCalls: preview.providerCalls,
      searchCalls: preview.searchCalls,
      inventory,
      preview,
      note: "Foundation preview reads canonical DIRECTORY rows plus already-stored automation evidence only. It never writes canonical data and does not call Tavily or Geoapify.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Address enrichment preview zlyhal.";
    return Response.json({ error: message }, { status: 500 });
  }
}
