import { createNewsTip, NewsTipRateLimitError, type NewsTipInput } from "@/lib/news-tip-store";
import { notifyNewsTip } from "@/lib/editorial-email";

export const dynamic = "force-dynamic";

type PublicNewsTipInput = NewsTipInput & { company?: string };

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return Response.json({ error: "Neplatný formát tipu." }, { status: 415 });
  }
  try {
    const payload = await request.json() as PublicNewsTipInput;
    if (payload.company?.trim()) return Response.json({ success: true }, { status: 201 });
    const saved = await createNewsTip(payload);
    await notifyNewsTip(saved);
    return Response.json({ success: true }, { status: 201 });
  } catch (error) {
    const status = error instanceof NewsTipRateLimitError ? 429 : 400;
    return Response.json({ error: error instanceof Error ? error.message : "Tip sa nepodarilo odoslať." }, { status });
  }
}
