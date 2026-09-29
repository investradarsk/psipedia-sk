import { env } from "cloudflare:workers";
import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { acceptMediaSourceCandidate } from "@/lib/media-source-monitor";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Props) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  const id = Number.parseInt((await params).id, 10);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return Response.json({ error: "Neplatné ID kontroly." }, { status: 400 });
  }
  try {
    const result = await acceptMediaSourceCandidate({
      database: env.DB,
      bindings: env,
      monitorId: id,
      actorRef: user.email,
    });
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Obrázok sa nepodarilo potvrdiť." },
      { status: 400 },
    );
  }
}
