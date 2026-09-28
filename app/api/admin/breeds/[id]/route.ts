import { env } from "cloudflare:workers";
import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import {
  deleteManagedBreed,
  getManagedBreed,
  updateManagedBreed,
  type ManagedBreedInput,
} from "@/lib/breed-store";
import {
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
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  const id = await parsedId(params);
  if (!id) return Response.json({ error: "Neplatné ID plemena." }, { status: 400 });

  try {
    const before = await getManagedBreed(id);
    if (!before) return Response.json({ error: "Plemeno sa nenašlo." }, { status: 404 });

    const breed = await updateManagedBreed(id, await request.json() as ManagedBreedInput, user.email);
    if (!breed) return Response.json({ error: "Plemeno sa nenašlo." }, { status: 404 });

    if (before.status !== "published" && breed.status === "published") {
      const bindings = env as unknown as BreedRouteBindings;
      if (bindings.DB) {
        try {
          await writeBackPublishedBreedToNotion({
            database: bindings.DB,
            bindings,
            breed,
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

    return Response.json({ breed });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Plemeno sa nepodarilo uložiť." },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: Request, { params }: RouteProps) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  const id = await parsedId(params);
  if (!id) return Response.json({ error: "Neplatné ID plemena." }, { status: 400 });
  await deleteManagedBreed(id);
  return Response.json({ ok: true });
}
