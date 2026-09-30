import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { isArticleTopicConflict, updateArticleTopic } from "@/lib/article-topics";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Props) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  const id = Number.parseInt((await params).id, 10);
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: "Neplatné ID témy." }, { status: 400 });
  try {
    const body = await request.json() as { label?: string; isActive?: boolean };
    const topic = await updateArticleTopic(id, body, user.email);
    if (!topic) return Response.json({ error: "Téma neexistuje." }, { status: 404 });
    return Response.json({ topic });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Tému sa nepodarilo upraviť." },
      { status: isArticleTopicConflict(error) ? 409 : 400 },
    );
  }
}
