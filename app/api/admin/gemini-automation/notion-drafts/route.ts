import { env } from "cloudflare:workers";
import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import {
  GeminiNotionReviewError, listGeminiDirectoryDrafts,
} from "@/lib/gemini-notion-directory-review";

export const dynamic = "force-dynamic";
const NO_STORE = { "cache-control": "no-store" };

export async function GET(request: Request) {
  if (!await getAdminApiUser()) return unauthorizedAdminResponse();
  const key = new URL(request.url).searchParams.get("stable_key") ?? "";
  try {
    const drafts = await listGeminiDirectoryDrafts(env, key);
    return Response.json({ drafts }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof GeminiNotionReviewError && error.code === "CATEGORY") {
      return Response.json({ error: "Neznáma kategória adresára." },
        { status: 400, headers: NO_STORE });
    }
    return Response.json({ error: "Koncepty z Notionu sa nepodarilo načítať. Skús obnovenie." },
      { status: 503, headers: NO_STORE });
  }
}
