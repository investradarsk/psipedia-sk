import { env } from "cloudflare:workers";
import { getAdminApiUser, requireAdminMutation, unauthorizedAdminResponse } from "@/lib/admin-auth";
import {
  getGeminiDirectoryDraft,
  saveGeminiDirectoryDraft,
  reviewGeminiDirectoryDraft,
  GeminiNotionReviewError,
} from "@/lib/gemini-notion-directory-review";
import { geminiAgendaForKey, getGeminiAgendaDraft, mutateGeminiAgendaDraft, GeminiAgendaReviewError } from "@/lib/gemini-notion-agenda-review";

export const dynamic = "force-dynamic";
const HEADERS = { "cache-control": "no-store" };
type Props = { params: Promise<{ id: string }> };

function fail(error: unknown) {
  if (error instanceof GeminiAgendaReviewError) {
    const status = error.code === "CATEGORY" ? 400 : error.code === "NOT_FOUND" ? 404 :
      ["CONFLICT", "LOCKED", "STATE"].includes(error.code) ? 409 : 503;
    return Response.json({ error: error.code === "CONFLICT" ? "Koncept sa medzitým zmenil v Notione. Obnov ho." :
      error.code === "SCHEMA" ? "Chýba pole alebo povolený stav v Notion schéme. Zápis bol zablokovaný." :
      error.code === "LOCKED" ? "Prebieha iný zápis. Pred opakovaním over Notion." : "Koncept nemožno bezpečne upraviť." },
      { status, headers: HEADERS });
  }
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

export async function GET(request: Request, { params }: Props) {
  if (!await getAdminApiUser()) return unauthorizedAdminResponse();
  try {
    const { id } = await params;
    const key = new URL(request.url).searchParams.get("stable_key") ?? "";
    if (key && geminiAgendaForKey(key))
      return Response.json({ draft: (await getGeminiAgendaDraft(env, key, id)).draft }, { headers: HEADERS });
    return Response.json({ draft: await getGeminiDirectoryDraft(env, id) }, { headers: HEADERS });
  } catch (error) { return fail(error); }
}

export async function PUT(request: Request, { params }: Props) {
  const auth = await requireAdminMutation(request);
  if (auth.response) return auth.response;
  try {
    const { id } = await params;
    const body: unknown = await request.json();
    const key = new URL(request.url).searchParams.get("stable_key") ?? "";
    const draft = key && geminiAgendaForKey(key)
      ? await mutateGeminiAgendaDraft(env, key, id, body, auth.user.email)
      : await saveGeminiDirectoryDraft(env, id, body, auth.user.email);
    return Response.json({ draft }, { headers: HEADERS });
  } catch (error) { return fail(error); }
}

export async function PATCH(request: Request, { params }: Props) {
  const auth = await requireAdminMutation(request);
  if (auth.response) return auth.response;
  try {
    const body = await request.json();
    if (!body || !["reject", "restore", "approve"].includes(body.action) || body.confirm !== true)
      return Response.json({ error: "Vyžaduje sa výslovné potvrdenie." }, { status: 400, headers: HEADERS });
    const { id } = await params;
    const key = new URL(request.url).searchParams.get("stable_key") ?? "";
    const draft = key && geminiAgendaForKey(key)
      ? await mutateGeminiAgendaDraft(env, key, id, body, auth.user.email)
      : await reviewGeminiDirectoryDraft(env, id, body, auth.user.email);
    return Response.json({ draft }, { headers: HEADERS });
  } catch (error) { return fail(error); }
}
