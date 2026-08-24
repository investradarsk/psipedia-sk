import { AdminArticleFeedbackDashboard } from "@/components/admin-article-feedback-dashboard";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listArticleFeedback } from "@/lib/article-feedback-store";

export const dynamic = "force-dynamic";

export default async function AdminArticleFeedbackPage() {
  const user = await requireAdminPageUser("/admin/hodnotenia");
  return (
    <AdminShell user={user} eyebrow="Spätná väzba čitateľov" title="Hodnotenia článkov" description="Sledujte, ktoré články pomáhajú a čo v nich čitateľom chýba.">
      <AdminArticleFeedbackDashboard feedback={await listArticleFeedback()} />
    </AdminShell>
  );
}
