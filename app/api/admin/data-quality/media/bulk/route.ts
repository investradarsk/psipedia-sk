import { env } from "cloudflare:workers";
import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import {
  acceptMediaSourceCandidate,
  rejectMediaSourceCandidate,
} from "@/lib/media-source-monitor";

export const dynamic = "force-dynamic";

type BulkAction = "accept" | "reject";

export async function POST(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();

  let body: { action?: BulkAction; ids?: unknown };
  try {
    body = await request.json() as { action?: BulkAction; ids?: unknown };
  } catch {
    return Response.json({ error: "Neplatné dáta požiadavky." }, { status: 400 });
  }

  if (body.action !== "accept" && body.action !== "reject") {
    return Response.json({ error: "Neplatná hromadná akcia." }, { status: 400 });
  }
  if (!Array.isArray(body.ids)) {
    return Response.json({ error: "Chýba zoznam označených obrázkov." }, { status: 400 });
  }

  const ids = [...new Set(body.ids.map(Number))]
    .filter((id) => Number.isSafeInteger(id) && id > 0)
    .slice(0, 50);

  if (!ids.length) {
    return Response.json({ error: "Nie sú označené žiadne obrázky." }, { status: 400 });
  }

  let updated = 0;
  const failed: Array<{ id: number; error: string }> = [];

  for (const monitorId of ids) {
    try {
      if (body.action === "accept") {
        await acceptMediaSourceCandidate({
          database: env.DB,
          bindings: env,
          monitorId,
          actorRef: user.email,
        });
      } else {
        await rejectMediaSourceCandidate({
          database: env.DB,
          bindings: env,
          monitorId,
          actorRef: user.email,
        });
      }
      updated += 1;
    } catch (error) {
      failed.push({
        id: monitorId,
        error: error instanceof Error ? error.message : "Akciu sa nepodarilo vykonať.",
      });
    }
  }

  return Response.json({
    action: body.action,
    requested: ids.length,
    updated,
    failed,
  }, { status: failed.length === ids.length ? 400 : 200 });
}
