import { env } from "cloudflare:workers";
import { requireAdminMutation } from "@/lib/admin-auth";
import {
  approveGeminiDirectoryDraft, GeminiNotionReviewError,
} from "@/lib/gemini-notion-directory-review";

export const dynamic = "force-dynamic";
const NO_STORE = { "cache-control": "no-store" };
type Props = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Props) {
  const auth = await requireAdminMutation(request);
  if (auth.response) return auth.response;
  const { id } = await params;
  try {
    const result = await approveGeminiDirectoryDraft(env, id);
    return Response.json(result, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof GeminiNotionReviewError) {
      const status = error.code === "ID" ? 400 :
        error.code === "NOT_FOUND" ? 404 : error.code === "STATE" ? 409 : 503;
      return Response.json({
        error: error.code === "STATE"
          ? "Koncept už bol schválený, zmenený alebo nemá potrebný verejný zdroj."
          : "Koncept nie je možné bezpečne publikovať.",
      }, { status, headers: NO_STORE });
    }
    // A timed-out PATCH may already have succeeded. Never auto-retry from here.
    return Response.json({
      error: "Výsledok schválenia je neistý. Pred opakovaním skontroluj Notion.",
    }, { status: 503, headers: NO_STORE });
  }
}
