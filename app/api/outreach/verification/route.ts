import { submitOutreachVerification } from "@/lib/outreach-store";
import { assertOutreachJsonMutation } from "@/lib/outreach-security";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertOutreachJsonMutation(request);
    const body = await request.json() as Record<string, unknown>;
    const token = typeof body.token === "string" ? body.token : "";
    if (!token) throw new Error("Chýba overovací token.");
    const result = await submitOutreachVerification(token, body);
    return Response.json({ result });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Návrh sa nepodarilo odoslať." },
      { status: 400 },
    );
  }
}
