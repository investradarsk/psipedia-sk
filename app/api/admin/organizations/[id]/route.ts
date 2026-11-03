import { env } from "cloudflare:workers";
import { syncSavedNotionRecord, type TargetedNotionSaveBindings } from "@/lib/notion-targeted-admin-save";
import { unauthorizedAdminResponse, requireAdminMutation } from "@/lib/admin-auth";
import { OrganizationAdminValidationError } from "@/lib/help-organization-admin-input";
import { organizationInputWithShelterInlineChanges } from "@/lib/help-organization-inline-edit";
import { getOrganizationPublicationAdminById } from "@/lib/help-organization-admin-store";
import {
  isOrganizationAdminWriteConflict,
  updateOrganizationFromAdmin,
  updateShelterInlineFieldsFromAdmin,
  updateOrganizationInlineSummaryFromAdmin,
} from "@/lib/help-organization-admin-write";
import { invalidateVersionedPublicHtmlCacheUrl } from "@/lib/public-html-cache";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };
type UploadBindings = { BUCKET?: R2Bucket; CF_VERSION_METADATA?: { id?: string } };

async function numericId(params: Props["params"]) {
  const value = Number((await params).id);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function expectsJson(request: Request) {
  return request.headers.get("content-type")?.toLowerCase().includes("application/json") ?? false;
}

export async function PUT(request: Request, { params }: Props) {
  const auth = await requireAdminMutation(request, { strictProvenance: true });
  if (auth.response || !auth.user) return auth.response ?? unauthorizedAdminResponse();
  const user = auth.user;
  const id = await numericId(params);
  if (!id) return Response.json({ error: "Neplatné ID organizácie." }, { status: 400 });
  if (!expectsJson(request)) return Response.json({ error: "Očakáva sa JSON požiadavka." }, { status: 415 });

  let body: { payload?: unknown; expectedUpdatedAt?: unknown };
  try { body = await request.json() as { payload?: unknown; expectedUpdatedAt?: unknown }; }
  catch { return Response.json({ error: "Neplatné JSON dáta." }, { status: 400 }); }
  const expectedUpdatedAt = typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt : "";
  if (!("payload" in body) || !expectedUpdatedAt.trim()) {
    return Response.json({ error: "Chýba payload alebo expectedUpdatedAt." }, { status: 400 });
  }

  try {
    const before = await getOrganizationPublicationAdminById(id);
    if (!before) return Response.json({ error: "Organizácia neexistuje." }, { status: 404 });
    const item = await updateOrganizationFromAdmin(id, body.payload, user.email, expectedUpdatedAt);
    if (!item) return Response.json({ error: "Organizácia neexistuje." }, { status: 404 });

    const notionFieldSync = await syncSavedNotionRecord({ bindings: env as unknown as TargetedNotionSaveBindings, agenda: "organizations", entityId: id });
    const bindings = env as unknown as UploadBindings;
    if (before.imageKey && before.imageKey !== item.imageKey && bindings.BUCKET) {
      await bindings.BUCKET.delete(before.imageKey).catch(() => undefined);
    }
    if (before.status === "PUBLISHED" || item.status === "PUBLISHED") {
      const version = bindings.CF_VERSION_METADATA?.id;
      await Promise.all([
        invalidateVersionedPublicHtmlCacheUrl(new URL(`/organizacie/${before.slug}`, request.url), version),
        invalidateVersionedPublicHtmlCacheUrl(new URL(`/organizacie/${item.slug}`, request.url), version),
      ]);
    }
    return Response.json({ item, notionFieldSync });
  } catch (error) {
    if (error instanceof OrganizationAdminValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (isOrganizationAdminWriteConflict(error)) {
      return Response.json({ error: error instanceof Error ? error.message : "Konflikt organizácie." }, { status: 409 });
    }
    console.error("Organization update failed", error);
    return Response.json({ error: "Organizáciu sa nepodarilo uložiť." }, { status: 500 });
  }
}

/** Narrow quick edit from the shared Help → Útulky grid.
 * Lifecycle, canonical type, slug, locality, media and delete remain owned by
 * the existing organization editor and its dedicated domain routes. */
export async function PATCH(request: Request, { params }: Props) {
  const auth = await requireAdminMutation(request, { strictProvenance: true });
  if (auth.response || !auth.user) return auth.response ?? unauthorizedAdminResponse();
  const id = await numericId(params);
  if (!id) return Response.json({ error: "Neplatné ID útulku." }, { status: 400 });
  if (!expectsJson(request)) return Response.json({ error: "Očakáva sa JSON požiadavka." }, { status: 415 });

  let body: { expectedUpdatedAt?: unknown; changes?: unknown; action?: unknown };
  try { body = await request.json() as { expectedUpdatedAt?: unknown; changes?: unknown; action?: unknown }; }
  catch { return Response.json({ error: "Neplatné JSON dáta." }, { status: 400 }); }
  const expectedUpdatedAt = typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt : "";
  if (!expectedUpdatedAt.trim()) {
    return Response.json({ error: "Chýba verzia záznamu. Obnov tabuľku." }, { status: 400 });
  }

  try {
    const before = await getOrganizationPublicationAdminById(id);
    if (!before) return Response.json({ error: "Útulok už neexistuje." }, { status: 404 });
    // The writer re-reads and uses an atomic updated_at compare-and-set.
    if (before.updatedAt !== expectedUpdatedAt) {
      return Response.json({ error: "Záznam sa medzitým zmenil. Obnov tabuľku." }, { status: 409 });
    }
    if (body.action === "set-inline-summary") {
      if (!body.changes || typeof body.changes !== "object" || Array.isArray(body.changes)) {
        return Response.json({ error: "Chýbajú údaje organizácie." }, { status: 400 });
      }
      const fields = body.changes as Record<string, unknown>;
      if (Object.keys(fields).length !== 2 ||
        !Object.keys(fields).every(key => ["name", "shortDescription"].includes(key)) ||
        typeof fields.name !== "string" || typeof fields.shortDescription !== "string") {
        return Response.json({ error: "Rýchla úprava umožňuje iba názov a krátky popis." }, { status: 400 });
      }
      const name = fields.name.trim();
      const shortDescription = fields.shortDescription.trim();
      if (!name || name.length > 180 || shortDescription.length > 700) {
        return Response.json({ error: "Neplatná dĺžka názvu alebo krátkeho popisu." }, { status: 400 });
      }
      const item = await updateOrganizationInlineSummaryFromAdmin(
        id, { name, shortDescription }, auth.user.email, expectedUpdatedAt,
      );
      if (!item) return Response.json({ error: "Organizácia už neexistuje." }, { status: 404 });
      const notionFieldSync = await syncSavedNotionRecord({
        bindings: env as unknown as TargetedNotionSaveBindings,
        agenda: "organizations", entityId: id,
      });
      if (before.status === "PUBLISHED" || item.status === "PUBLISHED") {
        const version = (env as unknown as UploadBindings).CF_VERSION_METADATA?.id;
        await invalidateVersionedPublicHtmlCacheUrl(new URL(`/organizacie/${item.slug}`, request.url), version);
      }
      return Response.json({ item, notionFieldSync }, { headers: { "cache-control": "no-store" } });
    }
    if (body.action !== undefined) {
      return Response.json({ error: "Nepodporovaná akcia." }, { status: 400 });
    }
    const payload = organizationInputWithShelterInlineChanges(before, body.changes);
    const item = await updateShelterInlineFieldsFromAdmin(id, payload, auth.user.email, expectedUpdatedAt);
    if (!item) return Response.json({ error: "Útulok už neexistuje." }, { status: 404 });

    const notionFieldSync = await syncSavedNotionRecord({
      bindings: env as unknown as TargetedNotionSaveBindings,
      agenda: "organizations",
      entityId: id,
    });
    if (before.status === "PUBLISHED" || item.status === "PUBLISHED") {
      const version = (env as unknown as UploadBindings).CF_VERSION_METADATA?.id;
      await Promise.all([
        invalidateVersionedPublicHtmlCacheUrl(new URL(`/organizacie/${before.slug}`, request.url), version),
        invalidateVersionedPublicHtmlCacheUrl(new URL(`/organizacie/${item.slug}`, request.url), version),
      ]);
    }
    return Response.json({ item, notionFieldSync }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof OrganizationAdminValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (isOrganizationAdminWriteConflict(error)) {
      return Response.json({ error: error instanceof Error ? error.message : "Konflikt záznamu." }, { status: 409 });
    }
    console.error("Shelter inline update failed", error);
    return Response.json({ error: "Rýchlu úpravu sa nepodarilo uložiť." }, { status: 500 });
  }
}
