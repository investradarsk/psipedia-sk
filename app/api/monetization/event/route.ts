import { recordMonetizationEvent } from "@/lib/monetization-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if ((origin && origin !== requestUrl.origin) || fetchSite === "cross-site") {
    return Response.json({ error: "Cross-site tracking request rejected." }, { status: 403 });
  }
  try {
    const result = await recordMonetizationEvent(await request.json());
    return Response.json(result, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tracking udalosť bola odmietnutá.";
    const status = message === "Tracking burst guard." ? 429 : 400;
    return Response.json({ error: message }, { status });
  }
}
