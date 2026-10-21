import { env } from "cloudflare:workers";
import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { listMediaReviewHistory } from "@/lib/media-source-review-decisions";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Props) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  const rawId = (await params).id;
  if (!/^[1-9][0-9]*$/.test(rawId)) {
    return Response.json({ error: "Neplatné ID kontroly." }, { status: 400 });
  }
  const monitorId = Number(rawId);
  if (!Number.isSafeInteger(monitorId)) {
    return Response.json({ error: "Neplatné ID kontroly." }, { status: 400 });
  }
  try {
    const history = await listMediaReviewHistory(env.DB, monitorId);
    return Response.json({ monitorId, history }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "História nie je dostupná." },
      { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
