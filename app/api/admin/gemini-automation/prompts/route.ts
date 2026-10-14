import { getAdminApiUser, requireAdminMutation, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { getGeminiCatalogItem } from "@/lib/gemini-automation-catalog";
import { requireGeminiAdminD1 } from "@/lib/gemini-automation-admin-db";
import {
  GeminiCategoryPromptValidationError, parseGeminiCategoryPromptReset,
  parseGeminiCategoryPromptSave,
} from "@/lib/gemini-automation-category-prompts";
import {
  getGeminiCategoryPrompt, listGeminiCategoryPrompts,
  resetGeminiCategoryPrompt, saveGeminiCategoryPrompt,
} from "@/lib/gemini-automation-category-prompt-store";

export const dynamic = "force-dynamic";
const NO_STORE = { "cache-control": "no-store" };

function unavailable() {
  return Response.json({ error: "Prompty nie sú dostupné. Over migráciu 0125." }, { status: 503, headers: NO_STORE });
}

export async function GET(request: Request) {
  if (!await getAdminApiUser()) return unauthorizedAdminResponse();
  const params = new URL(request.url).searchParams;
  const supplied = params.has("stable_key");
  const key = params.get("stable_key");
  if (supplied && (!key || !getGeminiCatalogItem(key))) {
    return Response.json({ error: "Neznáma kategória Gemini." }, { status: 404, headers: NO_STORE });
  }
  try {
    const db = requireGeminiAdminD1();
    if (supplied && key) {
      return Response.json({ prompt: await getGeminiCategoryPrompt(db, key) }, { headers: NO_STORE });
    }
    return Response.json({ prompts: await listGeminiCategoryPrompts(db) }, { headers: NO_STORE });
  } catch { return unavailable(); }
}

function isJson(request: Request) {
  return request.headers.get("content-type")?.toLowerCase().includes("application/json") ?? false;
}

function errorResponse(error: unknown) {
  if (error instanceof GeminiCategoryPromptValidationError) {
    return Response.json({ error: error.message }, { status: 400, headers: NO_STORE });
  }
  return unavailable();
}

export async function PUT(request: Request) {
  const auth = await requireAdminMutation(request);
  if (auth.response) return auth.response;
  if (!isJson(request)) {
    return Response.json({ error: "Vyžaduje sa application/json." }, { status: 415, headers: NO_STORE });
  }
  try {
    const { stableKey, userPrompt } = parseGeminiCategoryPromptSave(await request.json().catch(() => null));
    const prompt = await saveGeminiCategoryPrompt(requireGeminiAdminD1(), stableKey, userPrompt);
    return Response.json({ prompt }, { headers: NO_STORE });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request) {
  const auth = await requireAdminMutation(request);
  if (auth.response) return auth.response;
  if (!isJson(request)) {
    return Response.json({ error: "Vyžaduje sa application/json." }, { status: 415, headers: NO_STORE });
  }
  try {
    const { stableKey } = parseGeminiCategoryPromptReset(await request.json().catch(() => null));
    const prompt = await resetGeminiCategoryPrompt(requireGeminiAdminD1(), stableKey);
    return Response.json({ prompt }, { headers: NO_STORE });
  } catch (error) { return errorResponse(error); }
}
