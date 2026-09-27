import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import {
  ADDRESS_RESEARCH_IMPORT_PREVIEW_BATCH_SIZE,
  previewAddressResearchDataset,
  validateAddressResearchDataset,
} from "@/lib/directory-address-research-import";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  try {
    const contentLength = Number(request.headers.get("content-length") || "0");
    if (contentLength > 20 * 1024 * 1024) {
      return Response.json({ error: "JSON je väčší ako povolených 20 MB." }, { status: 413, headers: { "Cache-Control": "private, no-store" } });
    }
    const body = await request.json();
    const url = new URL(request.url);
    const validateOnly = url.searchParams.get("validateOnly") === "1";
    if (validateOnly) {
      const dataset = validateAddressResearchDataset(body);
      return Response.json(
        { schemaVersion: 1, dataset: dataset.dataset, total: dataset.profiles.length, valid: true },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const baseIndex = Number(url.searchParams.get("baseIndex") || "0");
    if (!Number.isSafeInteger(baseIndex) || baseIndex < 0) {
      return Response.json({ error: "Neplatný baseIndex." }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
    }
    const dataset = validateAddressResearchDataset(body);
    if (dataset.profiles.length > ADDRESS_RESEARCH_IMPORT_PREVIEW_BATCH_SIZE) {
      return Response.json(
        { error: `Preview request môže obsahovať najviac ${ADDRESS_RESEARCH_IMPORT_PREVIEW_BATCH_SIZE} records.` },
        { status: 400, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const result = await previewAddressResearchDataset(body, {}, { baseIndex });
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Preview zlyhalo." },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
