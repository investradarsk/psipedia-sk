import { env } from "cloudflare:workers";
import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { acceptMediaSourceCandidate } from "@/lib/media-source-monitor";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Props) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  const id = Number.parseInt((await params).id, 10);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return Response.json({ error: "Neplatné ID kontroly." }, { status: 400 });
  }
  try {
    const text = await request.text();
    const body = text ? JSON.parse(text) as { expectedCandidateImageKey?: unknown } : {};
    if (body.expectedCandidateImageKey !== undefined &&
       (typeof body.expectedCandidateImageKey !== "string" || !body.expectedCandidateImageKey)) {
      return Response.json({ error: "Neplatný identifikátor kandidáta." }, { status: 400 });
    }
    const result = await acceptMediaSourceCandidate({
      database: env.DB,
      bindings: env,
      monitorId: id,
      actorRef: user.email,
      expectedCandidateImageKey: body.expectedCandidateImageKey as string | undefined,
    });
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Obrázok sa nepodarilo potvrdiť." },
      { status: 400 },
    );
  }
}
