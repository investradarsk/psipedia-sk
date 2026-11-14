import Link from "next/link";
import { Suspense } from "react";
import { AdminDataLoading } from "@/components/admin-data-loading";
import { AdminReviewsHub } from "@/components/admin-reviews-hub";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listManagedArticleSummaries } from "@/lib/article-store";
import { countManagedEshops } from "@/lib/eshop-ratings";
import { listProfileReviewsAdmin } from "@/lib/profile-review-admin";
import { getManagedPortalSection } from "@/lib/section-store";

export const dynamic = "force-dynamic";

async function ReviewOverview() {
  // Every summary source has its own failure status. A failed e-shop or
  // review source never prevents the remaining cards from being displayed.
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

  return <AdminReviewsHub articleCounts={articleCounts}
    pendingReviews={pendingReviews} totalReviews={totalReviews}
    categoryCount={categoryCount} eshopCounts={eshopCounts} />;
}

export default async function AdminReviewsPage() {
  const user = await requireAdminPageUser("/admin/recenzie");
  return <AdminShell
    user={user}
    eyebrow="Recenzie a testy"
    title="Recenzie a testy"
    description="Redakčné testy, hodnotenia profilov a kategórie spravuj prehľadne z jedného miesta."
    actions={<Link className="admin-primary-action" href="/admin/novy?sekcia=recenzie">+ Nový test</Link>}
  >
    <Suspense fallback={<AdminDataLoading label="Recenzie a testy" />}>
      <ReviewOverview />
    </Suspense>
  </AdminShell>;
}
