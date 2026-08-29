import { createArticleFeedback, type ArticleFeedbackInput } from "@/lib/article-feedback-store";
import { notifyNegativeArticleFeedback } from "@/lib/editorial-email";

export const dynamic = "force-dynamic";

type PublicArticleFeedbackInput = ArticleFeedbackInput & { website?: string };

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return Response.json({ error: "Neplatný formát hodnotenia." }, { status: 415 });
  }
  try {
    const payload = await request.json() as PublicArticleFeedbackInput;
    if (payload.website?.trim()) return Response.json({ success: true }, { status: 201 });
    const saved = await createArticleFeedback(payload);
    await notifyNegativeArticleFeedback(saved);
    return Response.json({ success: true }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Hodnotenie sa nepodarilo odoslať." }, { status: 400 });
  }
}
