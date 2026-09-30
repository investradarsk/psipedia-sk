import Link from "next/link";
import { AdminArticleTopicsManager } from "@/components/admin-article-topics-manager";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listArticleTopics } from "@/lib/article-topics";

export const dynamic = "force-dynamic";

export default async function AdminArticleTopicsPage() {
  const user = await requireAdminPageUser("/admin/clanky/temy");
  const topics = await listArticleTopics({ includeInactive: true });
  return (
    <AdminShell
      user={user}
      eyebrow="Obsah"
      title="Témy článkov"
      description="Spravuj internú redakčnú taxonómiu bez zmeny verejných URL alebo vzhľadu článkov."
      actions={<Link className="admin-primary-action" href="/admin/clanky">← Články</Link>}
    >
      <AdminArticleTopicsManager initialTopics={topics} />
    </AdminShell>
  );
}
