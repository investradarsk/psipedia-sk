import { requireAdminMutation } from "@/lib/admin-auth";
import {
  applyAddressResearchBatch,
  ADDRESS_RESEARCH_IMPORT_APPLY_BATCH_SIZE,
  type AddressResearchApplyRequestItem,
} from "@/lib/directory-address-research-import";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireAdminMutation(request);
  if (auth.response || !auth.user) return auth.response!;
  try {
    const body = await request.json() as {
      confirmationToken?: unknown;
      records?: unknown;
    };
    if (!Array.isArray(body.records) || body.records.length > ADDRESS_RESEARCH_IMPORT_APPLY_BATCH_SIZE) {
      return Response.json(
        { error: `Apply request môže obsahovať najviac ${ADDRESS_RESEARCH_IMPORT_APPLY_BATCH_SIZE} records.` },
        { status: 400, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const records = body.records as AddressResearchApplyRequestItem[];
    const result = await applyAddressResearchBatch({
      records,
      confirmationToken: typeof body.confirmationToken === "string" ? body.confirmationToken : "",
      actorRef: auth.user.email,
    });
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Apply zlyhalo." },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
