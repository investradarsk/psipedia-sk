import { env } from "cloudflare:workers";
import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { OrganizationAdminValidationError } from "@/lib/help-organization-admin-input";
import { getOrganizationPublicationAdminById } from "@/lib/help-organization-admin-store";
import {
  isOrganizationAdminWriteConflict,
  updateOrganizationFromAdmin,
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
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
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
    return Response.json({ item });
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
