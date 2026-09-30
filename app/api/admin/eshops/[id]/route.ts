import { env } from "cloudflare:workers";
import { getAdminApiUser, requireAdminMutation, unauthorizedAdminResponse } from "@/lib/admin-auth";
import {
  EshopRatingError,
  getManagedEshopById,
  updateManagedEshop,
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

    return Response.json({ shop });
  } catch (error) {
    return errorResponse(error);
  }
}
