import { requireAutomationAdminMutation } from "@/lib/admin-automation-api";
import { buildOrganizationConceptFromDiscoveryCandidate } from "@/lib/data-automation-organization-discovery-concept";
import {
  getAutomationSourceAdmin,
  reviewAutomationSource,
  reviewAutomationSourceCandidate,
} from "@/lib/data-automation-source-store";
import { env } from "cloudflare:workers";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };
type RuntimeBindings = { DB?: D1Database };

export async function PUT(request: Request, { params }: Props) {
  const auth = await requireAutomationAdminMutation(request);
  if (auth.response || !auth.user) return auth.response!;

  const id = Number.parseInt((await params).id, 10);
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: "Neplatné ID kandidáta." }, { status: 400 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const action = String(body?.action ?? "");

  try {
    if (action === "prepare_organization_concept") {
      const db = (env as unknown as RuntimeBindings).DB;
      if (!db) return Response.json({ error: "Databáza nie je dostupná." }, { status: 503 });
      const concept = await buildOrganizationConceptFromDiscoveryCandidate({
        candidateId: id,
        database: db,
      });
      return Response.json({ concept }, { headers: { "cache-control": "no-store" } });
    }
    if (!["approve", "reject", "suppress"].includes(action)) {
      return Response.json({ error: "Neplatná candidate akcia." }, { status: 400 });
    }

    const candidate = await reviewAutomationSourceCandidate({
      id,
      action: action as "approve" | "reject" | "suppress",
      reviewerEmail: auth.user.email,
      notes: typeof body?.notes === "string" ? body.notes : null,
      suppressedDays: Number(body?.suppressedDays ?? 30),
    });
    if (!candidate) return Response.json({ error: "Kandidát sa nenašiel." }, { status: 404 });

    let source = null;
    if (action === "approve" && candidate.duplicateSourceId) {
      const db = (env as unknown as RuntimeBindings).DB;
      source = await getAutomationSourceAdmin(candidate.duplicateSourceId, db);
      if (source && db) {
        if (source.reviewStatus !== "APPROVED") {
          source = await reviewAutomationSource({
            id: source.id,
            action: "approve",
            reviewerEmail: auth.user.email,
            notes: typeof body?.notes === "string" ? body.notes : null,
          }, db);
        }
      }
    }

    return Response.json({ candidate, source }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Kandidáta sa nepodarilo spracovať." }, { status: 409 });
  }
}
