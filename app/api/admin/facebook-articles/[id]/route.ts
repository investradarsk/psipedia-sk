import { getAdminApiUser, requireAdminMutation, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { linkedFacebookArticlePost, saveFacebookArticleSchedule } from "@/lib/facebook-article-scheduler";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };
async function articleId(params: Params["params"]) {
  const raw = (await params).id;
  const id = Number(raw);
  return /^\d+$/.test(raw) && Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function GET(_request: Request, { params }: Params) {
  if (!await getAdminApiUser()) return unauthorizedAdminResponse();
  const id = await articleId(params);
  if (!id) return Response.json({ error: "Neplatné ID článku." }, { status: 400 });
  try {
    const post = await linkedFacebookArticlePost(id);
    return Response.json({ post }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "Plánovanie Facebook článkov nie je dostupné. Skontroluj migráciu 0144." }, { status: 503 });
  }
}

export async function PUT(request: Request, { params }: Params) {
  const auth = await requireAdminMutation(request, { strictProvenance: true });
  if (auth.response || !auth.user) return auth.response ?? unauthorizedAdminResponse();
  const id = await articleId(params);
  if (!id) return Response.json({ error: "Neplatné ID článku." }, { status: 400 });
  try {
    const post = await saveFacebookArticleSchedule(id, await request.json(), auth.user.email);
    return Response.json({ post }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Naplánovanie zlyhalo.";
    const conflict = /medzičasom|nie je možné prepísať/i.test(message);
    const unavailable = /no such (table|column)|0144/i.test(message);
    return Response.json({ error: unavailable ? "Chýba D1 migrácia 0144 pre Facebook články." : message }, {
      status: unavailable ? 503 : conflict ? 409 : 400,
    });
  }
}
