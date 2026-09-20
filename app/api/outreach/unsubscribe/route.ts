import { submitOutreachUnsubscribe } from "@/lib/outreach-store";
import { assertOutreachJsonMutation } from "@/lib/outreach-security";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertOutreachJsonMutation(request);
    const body = await request.json() as { token?: unknown };
    const token = typeof body.token === "string" ? body.token : "";
    if (!token) throw new Error("Chýba odhlasovací token.");
    const result = await submitOutreachUnsubscribe(token);
    return Response.json({ result });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Odhlásenie sa nepodarilo spracovať." },
      { status: 400 },
    );
  }
}
