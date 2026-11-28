import { env } from "cloudflare:workers";
import { ensureFirstArticleNotionCopy, type NotionSyncBindings } from "@/lib/notion-article-sync";
import {
  createManagedArticle,
  isArticleSlugConflict,
  listManagedArticleSummaries,
  type ManagedArticleInput,
} from "@/lib/article-store";
import { getAdminApiUser, unauthorizedAdminResponse, requireAdminMutation } from "@/lib/admin-auth";
import { isArticlePublishIntegrityError } from "@/lib/article-content-qa";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (isArticlePublishIntegrityError(error)) {
    return Response.json({ error: error.message, issues: error.issues }, { status: 422 });
  }
  const message = error instanceof Error ? error.message : "Nastala neočakávaná chyba.";
  const status = isArticleSlugConflict(error) ? 409 : 400;
  return Response.json(
    { error: status === 409 ? "Túto adresu už používa iný článok." : message },
    { status },
  );
}

export async function GET(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();

  try {
    const url = new URL(request.url);
    const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
    const pageSize = Math.max(1, Math.min(100, Number.parseInt(url.searchParams.get("limit") ?? "50", 10) || 50));
    const result = await listManagedArticleSummaries({
      page, pageSize,
      status: url.searchParams.get("status") === "draft" ? "draft" : undefined,
      query: (url.searchParams.get("query") ?? "").slice(0, 120),
    });
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Články sa nepodarilo načítať." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminMutation(request, { strictProvenance: true });
  if (auth.response || !auth.user) return auth.response ?? unauthorizedAdminResponse();
  const user = auth.user;

  try {
    const payload = (await request.json()) as ManagedArticleInput;
    const article = await createManagedArticle(payload, user.email);
    const bindings=env as unknown as NotionSyncBindings&{DB?:D1Database};
    if(bindings.NOTION_PROFILE_AUTHORITY_MODE!=="validated-text"||!bindings.DB)return Response.json({article},{status:201});
    let receipt:{status:"synced"|"failed"|"skipped";code?:string};
    try{const result=await ensureFirstArticleNotionCopy({database:bindings.DB,bindings,article});receipt=result.updated?{status:"synced"}:{status:"skipped",code:result.reason};}
    catch(error){const code=error instanceof Error?error.message:"";receipt={status:"failed",code:/^(NOTION_|ADMIN_|UNSUPPORTED_)[A-Z0-9_]+$/.test(code)?code:"REMOTE_WRITEBACK_FAILED"};console.error("notion_article_first_copy_failed",{articleId:article.id,code:receipt.code});}
    return Response.json({article,saveReceipt:{d1:{status:"saved",updatedAt:article.updatedAt},assignments:{status:"synced"},notion:{draft:receipt}}},{status:201});
  } catch (error) {
    return errorResponse(error);
  }
}
