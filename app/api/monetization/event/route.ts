import { recordMonetizationEvent } from "@/lib/monetization-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const result = await recordMonetizationEvent(await request.json());
    return Response.json(result, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tracking udalosť bola odmietnutá.";
    const status = message === "Tracking burst guard." ? 429 : 400;
    return Response.json({ error: message }, { status });
  }
}
