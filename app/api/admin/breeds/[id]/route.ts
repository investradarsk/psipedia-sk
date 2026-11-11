import { acknowledgeAdminPublication } from "@/lib/admin-record-lifecycle";
import { env } from "cloudflare:workers";
import { unauthorizedAdminResponse, requireAdminMutation } from "@/lib/admin-auth";
import {
  deleteManagedBreed,
  getManagedBreed,
  updateManagedBreed,
  updateManagedBreedInlineIntro,
  BreedUpdateConflictError,
  type ManagedBreedInput,
} from "@/lib/breed-store";
import { mergeManagedBreedEdit } from "@/lib/breed-sync-preservation";
import { breedAdminSparseEdit } from "@/lib/breed-admin-dirty-patch.mjs";
import { breedEventIsDirectField } from "@/lib/notion-breed-workcopy-field-sql.mjs";
import { saveBreedNotionField } from "@/lib/notion-breed-workcopy-direct-field";
import {
  writeBackDraftBreedEditorialToNotion,
  writeBackBreedEditorialToNotion,
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

    const { expectedUpdatedAt, changedFieldKeys, ...patch } = await request.json() as ManagedBreedInput & {
      expectedUpdatedAt?: unknown; changedFieldKeys?: unknown;
    };
    if (typeof expectedUpdatedAt !== "string" || !expectedUpdatedAt.trim()) {
      return Response.json({ code:"BREED_VERSION_REQUIRED", error:"Chýba verzia plemena. Obnov editor." }, {status:428});
    }
    // Same as the breeder editor: an old full-form snapshot cannot overwrite
    // freshly imported Notion values of untouched fields. Only dirty paths
    // are carried forward against the latest canonical D1 version.
    const sparse = Array.isArray(changedFieldKeys);
    const dirty = sparse ? (changedFieldKeys as string[]) : null;
    const selected = sparse ? breedAdminSparseEdit(patch, dirty) : patch;
    let breed = before;
    const rejectedDirtyFields:string[]=[];
    if (dirty) {
      // The salon/club contract: every submitted field is its own operation.
      // Even a structural/media field must not push unrelated text fields
      // through a stale whole-profile update or veto a valid sibling edit.
      const ordered = [
        ...dirty.filter(breedEventIsDirectField),
        ...dirty.filter(field => !breedEventIsDirectField(field) && field !== "status"),
        ...dirty.filter(field => field === "status"),
      ];
      for (const field of [...new Set(ordered)]) {
        try {
          if (breedEventIsDirectField(field)) {
            const value = field.split(".").reduce<unknown>((v,key) =>
              v && typeof v==="object" ? (v as Record<string,unknown>)[key] : undefined,
              selected);
            const result = await saveBreedNotionField({
              database:(env as unknown as {DB:D1Database}).DB,
              breedId:id,field,value,actor:user.email,
            });
            breed=result.breed;
          } else {
            // Relation/media/status changes retain their own canonical writer,
            // fed by a FRESH D1 record and only this one dirty property.
            const current = await getManagedBreed(id);
            if (!current) throw Error("BREED_ADMIN_PROFILE_MISSING");
            const single = breedAdminSparseEdit(selected,[field]);
            const saved = await updateManagedBreed(id,
              mergeManagedBreedEdit(current,single), user.email,current.updatedAt);
            if (!saved) throw Error("BREED_ADMIN_PROFILE_RELOAD_FAILED");
            breed=saved;
          }
        } catch(error) {
          rejectedDirtyFields.push(field);
          console.warn("breed_admin_single_field_pending",{
            breedId:id,field,code:error instanceof Error?error.message:"UNKNOWN",
          });
        }
      }
    } else {
      // Legacy clients without explicit dirty fields still use their original
      // whole-profile contract. The actual editor always submits dirty paths.
      breed = await updateManagedBreed(id,mergeManagedBreedEdit(before,selected),
        user.email,expectedUpdatedAt);
      if (!breed) return Response.json({error:"Plemeno sa nenašlo."},{status:404});
    }

    const bindings = env as unknown as BreedRouteBindings;
    let notionEditorialWriteback: { status: string; code?: string } | undefined;
    if (bindings.DB) {
      // All ordinary Admin field edits, including published breeds, mirror
      // immediately through the same per-field priority engine.
      try {
        const result = await writeBackBreedEditorialToNotion({
          database:bindings.DB,bindings,before,breed,
          changedFieldKeys:dirty??undefined,
        });
        notionEditorialWriteback={
          status: "pendingFields" in result && result.pendingFields?.length
            ? "pending" : result.updated ? "synced" : (result.reason ?? "unchanged"),
          ...("pendingFields" in result && result.pendingFields?.length
            ? { code: "BREED_NOTION_FIELDS_PENDING" } : {}),
        };
      } catch(error) {
        const raw=error instanceof Error?error.message:"";
        const code=/^BREED_[A-Z0-9_]+$/.test(raw)?raw:"REMOTE_WRITEBACK_FAILED";
        notionEditorialWriteback={status:"pending",code};
        console.error("notion_breed_writeback_retry_needed",{breedId:breed.id,code});
      }
      if (before.status!=="published" && breed.status==="published") {
        try {
          await writeBackPublishedBreedToNotion({
            database:bindings.DB,bindings,breed,
          });
        } catch(error) {
          console.error(JSON.stringify({
            event:"notion_breed_publish_writeback_failed",breedId:breed.id,
            error:error instanceof Error?error.message:String(error),
          }));
        }
      }
    }

    await acknowledgeAdminPublication((env as unknown as {DB?:D1Database}).DB,"breeds",id,breed.status);
    return Response.json({
      breed,
      ...(rejectedDirtyFields.length?{rejectedDirtyFields}:{}),
      ...(notionEditorialWriteback ? { notionEditorialWriteback } : {}),
    });
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

export async function PATCH(request: Request, { params }: RouteProps) {
  const auth = await requireAdminMutation(request, { strictProvenance: true });
  if (auth.response || !auth.user) return auth.response ?? unauthorizedAdminResponse();
  const id = await parsedId(params);
  if (!id) return Response.json({ error: "Neplatné ID plemena." }, { status: 400 });
  if (request.headers.get("origin") !== new URL(request.url).origin ||
      !request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "Neplatný pôvod požiadavky." }, { status: 403 });
  }
  let body: { action?: unknown; intro?: unknown; expectedUpdatedAt?: unknown };
  try { body = await request.json() as typeof body; }
  catch { return Response.json({ error: "Neplatné JSON dáta." }, { status: 400 }); }
  if (!body || Object.keys(body).length !== 3 || body.action !== "set-inline-intro" ||
      typeof body.intro !== "string" || body.intro.trim().length > 1000 ||
      typeof body.expectedUpdatedAt !== "string" || !body.expectedUpdatedAt.trim()) {
    return Response.json({ error: "Meniť možno iba úvod plemena a vyžaduje sa verzia záznamu." }, { status: 400 });
  }
  try {
    const before = await getManagedBreed(id);
    if (!before) return Response.json({ error: "Plemeno sa nenašlo." }, { status: 404 });
    const breed = await updateManagedBreedInlineIntro(id, body.intro, body.expectedUpdatedAt);
    if (!breed) return Response.json({ error: "Plemeno sa nenašlo." }, { status: 404 });
    let notionEditorialWriteback: { status: string; code?: string } | undefined;
    const bindings = env as unknown as BreedRouteBindings;
    if (bindings.DB) {
      try {
        const result = await writeBackBreedEditorialToNotion({
          database: bindings.DB, bindings, before, breed,
        });
        notionEditorialWriteback = {
          status: "pendingFields" in result && result.pendingFields?.length
            ? "pending" : result.updated ? "synced" : (result.reason ?? "unchanged"),
          ...("pendingFields" in result && result.pendingFields?.length
            ? { code: "BREED_NOTION_FIELDS_PENDING" } : {}),
        };
      } catch (error) {
        const raw = error instanceof Error ? error.message : "";
        const code = /^BREED_[A-Z0-9_]+$/.test(raw) ? raw : "REMOTE_WRITEBACK_FAILED";
        notionEditorialWriteback = { status: "pending", code };
        console.error("notion_breed_inline_writeback_failed", { breedId: breed.id, code });
      }
    }
    return Response.json({ breed, ...(notionEditorialWriteback ? { notionEditorialWriteback } : {}) },
      { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof BreedUpdateConflictError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    return Response.json({ error: error instanceof Error ? error.message : "Rýchla úprava zlyhala." }, { status: 400 });
  }
}

/** Legacy DELETE must not bypass verified Notion trash + D1 tombstones. */
export async function DELETE(request:Request) {
  const auth=await requireAdminMutation(request, { strictProvenance: true });
  if(auth.response)return auth.response;
  return Response.json({error:"Použi Natrvalo odstrániť v editore: /api/admin/record-lifecycle."},{status:409});
}
