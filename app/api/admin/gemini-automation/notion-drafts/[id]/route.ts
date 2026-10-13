import { env } from "cloudflare:workers";
import { getAdminApiUser, requireAdminMutation, unauthorizedAdminResponse } from "@/lib/admin-auth";
import {
  getGeminiDirectoryDraft,
  saveGeminiDirectoryDraft,
  reviewGeminiDirectoryDraft,
  GeminiNotionReviewError,
} from "@/lib/gemini-notion-directory-review";

export const dynamic = "force-dynamic";
const HEADERS = { "cache-control": "no-store" };
type Props = { params: Promise<{ id: string }> };

function fail(error: unknown) {
  if (error instanceof GeminiNotionReviewError) {
    const status = error.code === "ID" || error.code === "CATEGORY" ? 400
      : error.code === "NOT_FOUND" ? 404
      : error.code === "CONFLICT" || error.code === "LOCKED" || error.code === "STATE" ? 409 : 503;
    return Response.json({
      error: error.code === "LOCKED"
        ? "Prebieha iný zápis alebo čaká na overenie neistý výsledok. Obnov zoznam; ak stav pretrváva, treba preveriť zámok podľa GEMINI-NOTION-REVIEW-2."
        : error.code === "CONFLICT"
        ? "Koncept sa medzitým zmenil v Notione. Obnov zoznam a otvor ho znovu."
        : error.code === "STATE"
          ? "Koncept už nie je možné upravovať alebo obsahuje neplatné údaje."
          : "Notion koncept sa nepodarilo spracovať.",
    }, { status, headers: HEADERS });
  }
  return Response.json({ error: "Notion neodpovedá. Skontroluj stav pred opakovaním uloženia." },
    { status: 503, headers: HEADERS });
}

export async function GET(_request: Request, { params }: Props) {
  if (!await getAdminApiUser()) return unauthorizedAdminResponse();
  try {
    const { id } = await params;
    return Response.json({ draft: await getGeminiDirectoryDraft(env, id) }, { headers: HEADERS });
  } catch (error) { return fail(error); }
}

export async function PUT(request: Request, { params }: Props) {
  const auth = await requireAdminMutation(request);
  if (auth.response) return auth.response;
  try {
    const { id } = await params;
    const body: unknown = await request.json();
    const draft = await saveGeminiDirectoryDraft(env, id, body, auth.user.email);
    return Response.json({ draft }, { headers: HEADERS });
  } catch (error) { return fail(error); }
}

export async function PATCH(request: Request, { params }: Props) {
  const auth = await requireAdminMutation(request);
  if (auth.response) return auth.response;
  try {
    const body = await request.json();
    if (!body || !["reject", "restore"].includes(body.action) || body.confirm !== true)
      return Response.json({ error: "Vyžaduje sa výslovné potvrdenie." }, { status: 400, headers: HEADERS });
    const { id } = await params;
    return Response.json({ draft: await reviewGeminiDirectoryDraft(env, id, body, auth.user.email) }, { headers: HEADERS });
  } catch (error) { return fail(error); }
}
