import Link from "next/link";
import { AdminReviewsHub } from "@/components/admin-reviews-hub";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listManagedArticleSummaries } from "@/lib/article-store";
import { countManagedEshops } from "@/lib/eshop-ratings";
import { listProfileReviewsAdmin } from "@/lib/profile-review-admin";
import { getManagedPortalSection } from "@/lib/section-store";

export const dynamic = "force-dynamic";

export default async function AdminReviewsPage() {
  const user = await requireAdminPageUser("/admin/recenzie");

  const [articlesResult, pendingResult, allReviewsResult, sectionResult, eshopResult] = await Promise.allSettled([
    listManagedArticleSummaries({ portalSection: "recenzie", pageSize: 1 }),
    listProfileReviewsAdmin({ status: "PENDING_REVIEW", pageSize: 1 }),
    listProfileReviewsAdmin({ status: "all", pageSize: 1 }),
    getManagedPortalSection("recenzie"),
    countManagedEshops(),
  ]);

  const articleCounts = articlesResult.status === "fulfilled"
    ? articlesResult.value.counts
    : { total: null, published: null, draft: null, scheduled: null };
  const pendingReviews = pendingResult.status === "fulfilled" ? pendingResult.value.pagination.total : null;
  const totalReviews = allReviewsResult.status === "fulfilled" ? allReviewsResult.value.pagination.total : null;
  const categoryCount = sectionResult.status === "fulfilled" && sectionResult.value
    ? sectionResult.value.subpages.filter((item) => item.visible !== false).length
    : null;
  const eshopCounts = eshopResult.status === "fulfilled" ? eshopResult.value : { total: null, published: null };

  return (
    <AdminShell
      user={user}
      eyebrow="Recenzie a testy"
      title="Správa recenzií a testov"
      description="Redakčné testy, používateľské recenzie a kategórie spravuj z jedného pracovného miesta. Každá agenda zostáva vo svojom canonical module."
      actions={<Link className="admin-primary-action" href="/admin/novy?sekcia=recenzie">+ Nový test</Link>}
    >
      <AdminReviewsHub
        articleCounts={articleCounts}
        pendingReviews={pendingReviews}
        totalReviews={totalReviews}
        categoryCount={categoryCount}
        eshopCounts={eshopCounts}
      />
    </AdminShell>
  );
}
