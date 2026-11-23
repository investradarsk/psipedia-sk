import { getPublishedArticleSummaries } from "@/lib/article-store";
import { FAVORITES_BATCH_SIZE, isFavoriteSlug } from "@/lib/public-favorites";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const slugs = new URL(request.url).searchParams.getAll("slug");
  if (slugs.length > FAVORITES_BATCH_SIZE || slugs.some((slug) => !isFavoriteSlug(slug))) {
    return Response.json({ error: "Neplatný zoznam článkov." }, { status: 400, headers });
  }
  try {
    const articles = slugs.length ? await getPublishedArticleSummaries({ slugs }) : [];
    return Response.json({ articles }, { headers });
  } catch {
    return Response.json(
      { error: "Obľúbené články sa nepodarilo načítať." },
      { status: 503, headers },
    );
  }
}
