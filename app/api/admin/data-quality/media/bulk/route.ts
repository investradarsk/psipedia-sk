import { env } from "cloudflare:workers";
import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { validateMediaReviewReason } from "@/lib/media-source-review-decisions";
import {
  acceptMediaSourceCandidate,
  rejectMediaSourceCandidate,
} from "@/lib/media-source-monitor";

export const dynamic = "force-dynamic";

type BulkAction = "accept" | "reject";

export async function POST(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();

  let body: { action?: BulkAction; ids?: unknown; expectedCandidates?: unknown; reason?: unknown };
  try {
    body = await request.json() as { action?: BulkAction; ids?: unknown; expectedCandidates?: unknown; reason?: unknown };
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

  if (body.expectedCandidates !== undefined &&
      (body.expectedCandidates === null || typeof body.expectedCandidates !== "object" ||
       Array.isArray(body.expectedCandidates))) {
    return Response.json({ error: "Neplatné očakávané identifikátory obrázkov." }, { status: 400 });
  }
  let reason: string | null = null;
  try {
    if (body.action === "reject") reason = validateMediaReviewReason(body.reason);
    else if (body.reason !== undefined) throw new Error("Dôvod možno uviesť iba pri zamietnutí.");
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Neplatný dôvod." }, { status: 400 });
  }
  const expectedCandidates = body.expectedCandidates as Record<string, unknown> | undefined;
  let updated = 0;
  const failed: Array<{ id: number; error: string }> = [];

  for (const monitorId of ids) {
    try {
      const expected = expectedCandidates?.[String(monitorId)];
      if (expected !== undefined && (typeof expected !== "string" || !expected)) {
        throw new Error("Neplatný identifikátor kandidáta.");
      }
      if (body.action === "accept") {
        await acceptMediaSourceCandidate({
          database: env.DB,
          bindings: env,
          monitorId,
          actorRef: user.email,
          expectedCandidateImageKey: expected as string | undefined,
        });
      } else {
        await rejectMediaSourceCandidate({
          database: env.DB,
          bindings: env,
          monitorId,
          actorRef: user.email,
          expectedCandidateImageKey: expected as string | undefined,
          reason,
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
