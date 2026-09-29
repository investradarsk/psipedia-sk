import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { getLostFoundPrivateMediaForAdmin } from "@/lib/lost-found-public-media";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();

  const { id } = await params;
  const reportId = Number.parseInt(id, 10);
  if (!Number.isSafeInteger(reportId) || reportId < 1) return new Response("Not found", { status: 404 });

  try {
    const media = await getLostFoundPrivateMediaForAdmin(reportId);
    if (!media) return new Response("Not found", { status: 404 });
    const bytes = await media.object.arrayBuffer();
    return new Response(bytes, {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
