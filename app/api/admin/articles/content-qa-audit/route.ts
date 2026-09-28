import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { auditPublishedArticleContentQa } from "@/lib/article-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();

  try {
    const audit = await auditPublishedArticleContentQa();
    return Response.json({
      mode: "read-only",
      generatedAt: new Date().toISOString(),
      ...audit,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "CONTENT-QA audit sa nepodarilo vykonať." },
      { status: 500 },
    );
  }
}
