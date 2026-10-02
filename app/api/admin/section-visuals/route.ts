import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { buildSectionVisualRegistry, resolveSectionVisual, type SectionVisualCrop } from "@/lib/section-visual-contract";
import {
  deleteStoredSectionVisual,
  listStoredSectionVisuals,
  resolveSectionVisualList,
  saveStoredSectionVisual,
} from "@/lib/section-visual-store";
import { listManagedPortalSections } from "@/lib/section-store";

export const dynamic = "force-dynamic";

async function registry() {
  return buildSectionVisualRegistry(await listManagedPortalSections());
}

export async function GET() {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  const definitions = await registry();
  return Response.json({ visuals: resolveSectionVisualList(definitions, await listStoredSectionVisuals()) });
}

export async function PUT(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();

  try {
    const body = await request.json() as {
      visualKey?: unknown;
      imageUrl?: unknown;
      imageKey?: unknown;
      altText?: unknown;
      desktopCrop?: Partial<SectionVisualCrop>;
      mobileCrop?: Partial<SectionVisualCrop>;
      reset?: unknown;
    };
    const visualKey = typeof body.visualKey === "string" ? body.visualKey.trim() : "";
    const definitions = await registry();
    const definition = definitions.find((item) => item.visualKey === visualKey);
    if (!definition) return Response.json({ error: "Neznámy vizuál sekcie." }, { status: 404 });

    if (body.reset === true) {
      await deleteStoredSectionVisual(visualKey);
      return Response.json({ visual: resolveSectionVisual(definition, null) });
    }

    const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl : "";
    const imageKey = typeof body.imageKey === "string" ? body.imageKey : null;
    const altText = typeof body.altText === "string" ? body.altText : "";
    const stored = await saveStoredSectionVisual({
      definition,
      imageUrl,
      imageKey,
      altText,
      desktopCrop: body.desktopCrop ?? {},
      mobileCrop: body.mobileCrop ?? {},
      updatedBy: user.email,
    });
    return Response.json({ visual: resolveSectionVisual(definition, stored) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Vizuál sa nepodarilo uložiť." },
      { status: 400 },
    );
  }
}
