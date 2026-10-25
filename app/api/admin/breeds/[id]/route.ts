import { env } from "cloudflare:workers";
import { unauthorizedAdminResponse, requireAdminMutation } from "@/lib/admin-auth";
import {
  deleteManagedBreed,
  getManagedBreed,
  updateManagedBreed,
  BreedUpdateConflictError,
  type ManagedBreedInput,
} from "@/lib/breed-store";
import { mergeManagedBreedEdit } from "@/lib/breed-sync-preservation";
import {
  writeBackDraftBreedEditorialToNotion,
  writeBackPublishedBreedToNotion,
  type NotionBreedSyncBindings,
} from "@/lib/notion-breed-sync";

export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ id: string }> };
type BreedRouteBindings = NotionBreedSyncBindings & { DB?: D1Database };

async function parsedId(params: RouteProps["params"]) {
  const { id } = await params;
  const value = Number.parseInt(id, 10);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export async function PUT(request: Request, { params }: RouteProps) {
  const auth = await requireAdminMutation(request, { strictProvenance: true });
  if (auth.response || !auth.user) return auth.response ?? unauthorizedAdminResponse();
  const user = auth.user;
  const id = await parsedId(params);
  if (!id) return Response.json({ error: "Neplatné ID plemena." }, { status: 400 });

  try {
    const before = await getManagedBreed(id);
    if (!before) return Response.json({ error: "Plemeno sa nenašlo." }, { status: 404 });

    const { expectedUpdatedAt, ...patch } = await request.json() as ManagedBreedInput & { expectedUpdatedAt?: unknown };
    if (typeof expectedUpdatedAt !== "string" || !expectedUpdatedAt.trim()) {
      return Response.json({ code: "BREED_VERSION_REQUIRED", error: "Chýba verzia plemena. Obnov editor." }, { status: 428 });
    }
    const breed = await updateManagedBreed(id, mergeManagedBreedEdit(before, patch), user.email, expectedUpdatedAt);
    if (!breed) return Response.json({ error: "Plemeno sa nenašlo." }, { status: 404 });

    const bindings = env as unknown as BreedRouteBindings;
    let notionEditorialWriteback: { status: string; code?: string } | undefined;
    if (bindings.DB) {
      if (before.status === "draft" && breed.status === "draft") {
        try {
          const result = await writeBackDraftBreedEditorialToNotion({
            database: bindings.DB, bindings, before, breed,
          });
          notionEditorialWriteback = {
            status: result.updated ? "synced" : (result.reason ?? "unchanged"),
          };
        } catch (error) {
          // Admin save remains canonical. Never expose raw provider messages,
          // titles, Notion pages or credentials to the browser or logs.
          const raw = error instanceof Error ? error.message : "";
          const code = /^BREED_[A-Z0-9_]+$/.test(raw)
            ? raw : "REMOTE_WRITEBACK_FAILED";
          notionEditorialWriteback = { status: "blocked", code };
          console.error("notion_breed_draft_writeback_failed", { breedId: breed.id, code });
        }
      } else if (before.status !== "published" && breed.status === "published") {
        try {
          await writeBackPublishedBreedToNotion({
            database: bindings.DB, bindings, breed,
          });
        } catch (error) {
          console.error(JSON.stringify({
            event: "notion_breed_publish_writeback_failed",
            breedId: breed.id,
            error: error instanceof Error ? error.message : String(error),
          }));
        }
      }
    }

    return Response.json({ breed, ...(notionEditorialWriteback ? { notionEditorialWriteback } : {}) });
  } catch (error) {
    if (error instanceof BreedUpdateConflictError) {
      return Response.json({ code: "BREED_EDIT_CONFLICT", error: error.message }, { status: 409 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Plemeno sa nepodarilo uložiť." },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request, { params }: RouteProps) {
  const auth = await requireAdminMutation(request, { strictProvenance: true });
  if (auth.response || !auth.user) return auth.response ?? unauthorizedAdminResponse();
  const id = await parsedId(params);
  if (!id) return Response.json({ error: "Neplatné ID plemena." }, { status: 400 });
  await deleteManagedBreed(id);
  return Response.json({ ok: true });
}
