import Link from "next/link";
import { AdminAutomationLifecycleReview } from "@/components/admin-automation-lifecycle-review";
import { AdminShell } from "@/components/admin-shell";
import styles from "@/components/admin-operations-ux.module.css";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { automationCategoryBySlug, automationUxCategories } from "@/lib/admin-automation-presentation";
import {
  countOpenAutomationLifecycleSuggestionsByCategory,
  listAutomationLifecycleSuggestions,
} from "@/lib/data-automation-lifecycle-store";

export const dynamic = "force-dynamic";
type Props = { searchParams: Promise<{ category?: string; page?: string }> };

export default async function AutomationLifecyclePage({ searchParams }: Props) {
  const user = await requireAdminPageUser("/admin/automatizacie/zmeny-stavu");
  const params = await searchParams;
  const requestedCategory = params.category ? automationCategoryBySlug(params.category) : null;
  const category = requestedCategory?.mode === "FEED_SOURCE" ? requestedCategory : null;
  const pageNumber = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const pageSize = 50;
  const [suggestions, counts] = await Promise.all([
    listAutomationLifecycleSuggestions({
      entityTypes: category?.entityTypes,
      limit: pageSize,
      offset: (pageNumber - 1) * pageSize,
    }).catch(() => []),
    countOpenAutomationLifecycleSuggestionsByCategory().catch(() => ({})),
  ]);
  const feedCategories = automationUxCategories.filter((item) => item.mode === "FEED_SOURCE");
  const countFor = (slug: string) => Number((counts as Record<string, number | undefined>)[slug] ?? 0);
  const grandTotal = feedCategories.reduce((sum, item) => sum + countFor(item.slug), 0);

  return (
    <AdminShell
      user={user}
      eyebrow="Automatizácie"
      title="Zmeny stavu"
      description="Explicitné lifecycle signály zo zdrojov čakajú na manuálne potvrdenie. Samotný záchyt zdroja canonical záznam nemení."
      actions={<Link href="/admin/automatizacie">← Automatizácie</Link>}
    >
      <nav className={styles.sectionNav} aria-label="Filter zmien stavu">
        <Link href="/admin/automatizacie/zmeny-stavu">Všetky · {grandTotal}</Link>
        {feedCategories.map((item) => (
          <Link href={`/admin/automatizacie/zmeny-stavu?category=${item.slug}`} key={item.slug}>
            {item.title} · {countFor(item.slug)}
          </Link>
        ))}
      </nav>
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>{category ? category.title : "Otvorené zmeny stavu"}</h2>
            <p>Každý lifecycle prechod sa kontroluje samostatne; hromadné potvrdenie nie je dostupné.</p>
          </div>
          <span className={styles.sectionCount}>{suggestions.length}</span>
        </div>
        <AdminAutomationLifecycleReview suggestions={suggestions} />
      </section>
      {pageNumber > 1 || suggestions.length === pageSize ? (
        <nav className={styles.sectionNav} aria-label="Stránkovanie zmien stavu">
          {pageNumber > 1 ? (
            <Link href={`/admin/automatizacie/zmeny-stavu?${category ? `category=${category.slug}&` : ""}page=${pageNumber - 1}`}>← Predchádzajúca</Link>
          ) : null}
          {suggestions.length === pageSize ? (
            <Link href={`/admin/automatizacie/zmeny-stavu?${category ? `category=${category.slug}&` : ""}page=${pageNumber + 1}`}>Ďalšia →</Link>
          ) : null}
        </nav>
      ) : null}
    </AdminShell>
  );
}
