import { notFound } from "next/navigation";
import { AdminArticleEditor } from "@/components/admin-article-editor";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getManagedArticleById } from "@/lib/article-store";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function EditArticlePage({ params }: Props) {
  const { id } = await params;
  const numericId = Number.parseInt(id, 10);
  if (!Number.isSafeInteger(numericId) || numericId < 1) notFound();
  const user = await requireAdminPageUser(`/admin/clanky/${id}`);
  const article = await getManagedArticleById(numericId);
  if (!article) notFound();
  const isNews = article.portalSection === "novinky";

  return (
    <AdminShell
      user={user}
      eyebrow={article.status === "published" ? (isNews ? "Publikovaná novinka" : "Publikovaný článok") : article.status === "scheduled" ? "Naplánované publikovanie" : "Rozpracovaný koncept"}
      title={`Upraviť ${isNews ? "novinku" : "článok"}`}
      description="Zmeny ulož ako koncept alebo ich rovno publikuj na verejnom webe."
    >
      <AdminArticleEditor article={article} />
    </AdminShell>
  );
}
