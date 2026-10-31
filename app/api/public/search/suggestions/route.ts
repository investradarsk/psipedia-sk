import { searchPortal } from "@/lib/portal-search";
import { groupPortalSearchSuggestions } from "@/lib/portal-search-suggestions";

export const dynamic = "force-dynamic";

const privateHeaders = { "cache-control": "private, no-store, max-age=0" };

/** Public autosuggest uses the same published-only search and ranking as /hladat. */
export async function GET(request: Request) {
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 120);
  if (q.length < 2) {
    return Response.json({ groups: [], total: 0 }, { headers: privateHeaders });
  }
  try {
    const result = await searchPortal(q, { page: 1, pageSize: 48 });
    return Response.json(
      { groups: groupPortalSearchSuggestions(result.items), total: result.total },
      { headers: privateHeaders },
    );
  } catch (error) {
    console.error("public_search_suggestions_failed", error);
    return Response.json({ error: "Vyhľadávanie návrhov je dočasne nedostupné." }, {
      status: 503,
      headers: privateHeaders,
    });
  }
}
