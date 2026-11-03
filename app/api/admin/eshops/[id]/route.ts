import { env } from "cloudflare:workers";
import { syncSavedNotionRecord, type TargetedNotionSaveBindings } from "@/lib/notion-targeted-admin-save";
import { getAdminApiUser, requireAdminMutation, unauthorizedAdminResponse } from "@/lib/admin-auth";
import {
  EshopRatingError,
  getManagedEshopById,
  updateManagedEshop,
  updateManagedEshopInline,
  type ManagedEshopUpdateInput,
} from "@/lib/eshop-ratings";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };
type UploadBindings = { BUCKET?: R2Bucket };

async function numericId(params: Props["params"]) {
  const value = Number.parseInt((await params).id, 10);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function errorResponse(error: unknown) {
  if (error instanceof EshopRatingError) {
    return Response.json({ error: error.message, code: error.code }, { status: error.status });
  }
  return Response.json(
    { error: error instanceof Error ? error.message : "E-shop sa nepodarilo uložiť." },
    { status: 400 },
  );
}

export async function GET(_request: Request, { params }: Props) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  const id = await numericId(params);
  if (!id) return Response.json({ error: "Neplatné ID e-shopu." }, { status: 400 });
  const shop = await getManagedEshopById(id);
  return shop ? Response.json({ shop }) : Response.json({ error: "E-shop sa nenašiel." }, { status: 404 });
}

export async function PUT(request: Request, { params }: Props) {
  const auth = await requireAdminMutation(request);
  if (auth.response || !auth.user) return auth.response ?? unauthorizedAdminResponse();
  const id = await numericId(params);
  if (!id) return Response.json({ error: "Neplatné ID e-shopu." }, { status: 400 });

  try {
    const before = await getManagedEshopById(id);
    if (!before) return Response.json({ error: "E-shop sa nenašiel." }, { status: 404 });

    const body = await request.json() as ManagedEshopUpdateInput;
    const shop = await updateManagedEshop(id, body, auth.user.email);
    if (!shop) return Response.json({ error: "E-shop sa nenašiel." }, { status: 404 });

    if (before.logoKey && before.logoKey !== shop.logoKey) {
      const bucket = (env as unknown as UploadBindings).BUCKET;
      if (bucket) await bucket.delete(before.logoKey).catch(() => undefined);
    }

    const notionFieldSync = await syncSavedNotionRecord({ bindings: env as unknown as TargetedNotionSaveBindings, agenda: "eshops", entityId: shop.id });
    return Response.json({ shop, notionFieldSync });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Only name and websiteUrl, with mandatory revision. Full-profile PUT remains
 * the canonical editor path; the inline route cannot update publication,
 * ratings, media, slug, description or a Notion-controlled identity. */
export async function PATCH(request: Request, { params }: Props) {
  const auth = await requireAdminMutation(request);
  if (auth.response || !auth.user) return auth.response ?? unauthorizedAdminResponse();
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "Vyžaduje sa JSON." }, { status: 415 });
  }
  const id = await numericId(params);
  if (!id) return Response.json({ error: "Neplatné ID e-shopu." }, { status: 400 });
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Neplatný formulár." }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  const keys = Object.keys(input).sort();
  if (keys.join(",") !== "expectedUpdatedAt,name,websiteUrl") {
    return Response.json({ error: "Povolený je iba názov, web a verzia záznamu." }, { status: 400 });
  }
  if (typeof input.name !== "string" || typeof input.websiteUrl !== "string" ||
    typeof input.expectedUpdatedAt !== "string") {
    return Response.json({ error: "Neplatné údaje." }, { status: 400 });
  }
  try {
    const shop = await updateManagedEshopInline(id, {
      name: input.name, websiteUrl: input.websiteUrl,
      expectedUpdatedAt: input.expectedUpdatedAt,
    }, auth.user.email);
    // Keep the existing targeted mirror; never bypass Notion authority.
    const notionFieldSync = await syncSavedNotionRecord({
      bindings: env as unknown as TargetedNotionSaveBindings,
      agenda: "eshops", entityId: shop.id,
    });
    return Response.json({ shop, notionFieldSync }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
