import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { createArticleTopic, isArticleTopicConflict, listArticleTopics } from "@/lib/article-topics";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  const url = new URL(request.url);
  try {
    const topics = await listArticleTopics({ includeInactive: true, search: url.searchParams.get("q") ?? "" });
    return Response.json({ topics });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Témy sa nepodarilo načítať." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  try {
    const body = await request.json() as { label?: string };
    const result = await createArticleTopic(body.label ?? "", user.email);
    return Response.json({ ...result, existing: !result.created }, { status: result.created ? 201 : 200 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Tému sa nepodarilo vytvoriť." },
      { status: isArticleTopicConflict(error) ? 409 : 400 },
    );
  }
}
