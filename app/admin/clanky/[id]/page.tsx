import { notFound } from "next/navigation";
import { AdminArticleEditor } from "@/components/admin-article-editor";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getManagedArticleById } from "@/lib/article-store";
import { listManagedBreedSummaries } from "@/lib/breed-store";
import { listArticleTopics } from "@/lib/article-topics";
import { articlePromoUtcDay } from "@/lib/article-promo";
import { listManagedPortalSections } from "@/lib/section-store";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ calendarDay?: string; calendarTime?: string }> };

export default async function EditArticlePage({ params, searchParams }: Props) {
  const { id } = await params;
  const numericId = Number.parseInt(id, 10);
  if (!Number.isSafeInteger(numericId) || numericId < 1) notFound();
  const user = await requireAdminPageUser(`/admin/clanky/${id}`);
  const [article, breedOptions, managedSections, topicOptions] = await Promise.all([
    getManagedArticleById(numericId),
    listManagedBreedSummaries(500),
    listManagedPortalSections(),
    listArticleTopics({ includeInactive: true }),
  ]);
  if (!article) notFound();
  const isNews = article.portalSection === "novinky";
  const query = await searchParams;
  const calendarDay = typeof query.calendarDay === "string" && /^\d{4}-\d{2}-\d{2}$/.test(query.calendarDay) ? query.calendarDay : null;
  const calendarTime = typeof query.calendarTime === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(query.calendarTime) ? query.calendarTime : "09:00";
  const returnToCalendar = calendarDay
    ? `/admin/clanky/kalendar?mesiac=${calendarDay.slice(0, 7)}&den=${calendarDay}&koncept=${numericId}&cas=${encodeURIComponent(calendarTime)}`
    : undefined;

  return (
    <AdminShell
      user={user}
      eyebrow={article.status === "published" ? (isNews ? "Publikovaná novinka" : "Publikovaný článok") : article.status === "scheduled" ? "Naplánované publikovanie" : "Rozpracovaný koncept"}
      title={`Upraviť ${isNews ? "novinku" : "článok"}`}
      description="Zmeny ulož ako koncept alebo ich rovno publikuj na verejnom webe."
    >
      <AdminArticleEditor article={article} breedOptions={breedOptions} managedSections={managedSections} topicOptions={topicOptions} promoUtcDay={articlePromoUtcDay()} returnToCalendar={returnToCalendar} />
    </AdminShell>
  );
}
