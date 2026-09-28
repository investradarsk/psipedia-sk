import { env } from "cloudflare:workers";
import { requireAdminMutation } from "@/lib/admin-auth";
import {
  CanonicalDraftDeleteError,
  deleteCanonicalDraft,
  type CanonicalDraftDeleteEntityType,
} from "@/lib/canonical-draft-delete";

export const dynamic = "force-dynamic";

type RuntimeBindings = { DB?: D1Database };
type Props = { params: Promise<{ entityType: string; id: string }> };

const entityTypes = new Set<CanonicalDraftDeleteEntityType>([
  "EVENT",
  "ORGANIZATION",
  "HELP_ITEM",
  "ADOPTION",
  "FOSTER",
  "LOST_FOUND",
  "DIRECTORY",
]);

export async function DELETE(request: Request, { params }: Props) {
  const auth = await requireAdminMutation(request);
  if (auth.response || !auth.user) return auth.response!;

  const { entityType: rawEntityType, id: rawId } = await params;
  const entityType = rawEntityType.toUpperCase() as CanonicalDraftDeleteEntityType;
  const id = Number.parseInt(rawId, 10);
  if (!entityTypes.has(entityType) || !Number.isSafeInteger(id) || id < 1) {
    return Response.json({ error: "Neplatný canonical koncept." }, { status: 400 });
  }

  const database = (env as unknown as RuntimeBindings).DB;
  if (!database?.prepare || typeof database.batch !== "function") {
    return Response.json({ error: "Databáza nie je dostupná." }, { status: 503 });
  }

  try {
    const deleted = await deleteCanonicalDraft({
      entityType,
      canonicalEntityId: id,
      actor: auth.user.email,
    }, database);
    return Response.json({ deleted }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof CanonicalDraftDeleteError) {
      const status = error.code === "NOT_FOUND"
        ? 404
        : error.code === "INVALID_ENTITY"
          ? 400
          : 409;
      return Response.json({ error: error.message }, { status });
    }
    console.error("[canonical-draft-delete] unexpected failure", {
      entityType,
      canonicalEntityId: id,
      error: error instanceof Error ? error.name : "unknown_error",
    });
    return Response.json({ error: "Koncept sa nepodarilo úplne vymazať." }, { status: 500 });
  }
}
