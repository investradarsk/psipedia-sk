import { getAdminApiUser, requireAdminMutation, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { getManagedArticleById, listManagedArticleSummaries } from "@/lib/article-store";
import { effectiveArticleStatus } from "@/lib/article-effective-status";
import { articleHref } from "@/lib/portal";
import { copyArticlePhoto } from "@/lib/facebook-article-scheduler";

export const dynamic = "force-dynamic";
const NO_STORE = { "cache-control": "no-store" };

export async function GET(request: Request) {
  if (!await getAdminApiUser()) return unauthorizedAdminResponse();
  const params = new URL(request.url).searchParams;
  const page = Math.max(1, Number.parseInt(params.get("page") || "1", 10) || 1);
  const query = (params.get("query") || "").trim().slice(0, 120);
  try {
    // The existing article list computes effective status, including scheduled
    // articles whose publication time has already passed.
    const result = await listManagedArticleSummaries({
      status: "published", query, page, pageSize: 12,
    });
    return Response.json({
      articles: result.articles.map(article => ({
        id: article.id,
        title: article.title,
        category: article.category,
        imageUrl: article.image || "",
        url: "https://psipedia.sk" + articleHref(article),
      })),
      page: result.pagination.page,
      totalPages: result.pagination.totalPages,
      total: result.pagination.total,
    }, { headers: NO_STORE });
  } catch {
    return Response.json({ error: "Publikované články sa nepodarilo načítať." },
      { status: 503, headers: NO_STORE });
  }
}

/** An explicit selection prepares media, but NEVER creates or approves a post. */
export async function POST(request: Request) {
  const auth = await requireAdminMutation(request, { strictProvenance: true });
  if (auth.response || !auth.user) return auth.response ?? unauthorizedAdminResponse();
  const body: unknown = await request.json().catch(() => null);
  const id = body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>).articleId : null;
  if (!Number.isSafeInteger(id) || Number(id) <= 0) {
    return Response.json({ error: "Vyber platný článok." }, { status: 400, headers: NO_STORE });
  }
  try {
    const article = await getManagedArticleById(Number(id));
    if (!article || effectiveArticleStatus(article.status, article.publishedAt) !== "published" ||
        (article.publishedAt && Date.parse(article.publishedAt) > Date.now())) {
      return Response.json({ error: "Tento článok ešte nie je publikovaný." },
        { status: 409, headers: NO_STORE });
    }
    let image = { imageKey: "", imageUrl: "" };
    let imageWarning = "";
    try {
      image = await copyArticlePhoto(article, null);
    } catch {
      imageWarning = "Titulný obrázok článku sa nepodarilo prevziať. Môžeš ho nahrať ručne.";
    }
    return Response.json({
      article: {
        id: article.id,
        title: article.title,
        url: "https://psipedia.sk" + articleHref(article),
      },
      image,
      imageWarning,
    }, { headers: NO_STORE });
  } catch {
    return Response.json({ error: "Údaje článku sa nepodarilo načítať." },
      { status: 503, headers: NO_STORE });
  }
}
