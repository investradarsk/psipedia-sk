import { createArticleFeedback, type ArticleFeedbackInput } from "@/lib/article-feedback-store";
import { processEditorialNotification } from "@/lib/editorial-notifications";

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
    if (!saved.helpful) await processEditorialNotification("article_feedback", saved).catch(() => {
      console.error(JSON.stringify({ event: "editorial_notification", resourceType: "article_feedback", resourceId: saved.id, result: "failed", error: "outbox_processing_failed" }));
    });
    return Response.json({ success: true }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Hodnotenie sa nepodarilo odoslať." }, { status: 400 });
  }
}
