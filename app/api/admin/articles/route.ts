import {
  createManagedArticle,
  isArticleSlugConflict,
  listManagedArticles,
  type ManagedArticleInput,
} from "@/lib/article-store";
import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Nastala neočakávaná chyba.";
  const status = isArticleSlugConflict(error) ? 409 : 400;
  return Response.json(
    { error: status === 409 ? "Túto adresu už používa iný článok." : message },
    { status },
  );
}

export async function GET() {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();

  try {
    return Response.json({ articles: await listManagedArticles() });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Články sa nepodarilo načítať." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();

  try {
    const payload = (await request.json()) as ManagedArticleInput;
    const article = await createManagedArticle(payload, user.email);
    return Response.json({ article }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
