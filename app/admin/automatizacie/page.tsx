import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import styles from "@/components/admin-operations-ux.module.css";
import { requireAdminPageUser } from "@/lib/admin-auth";
import {
  automationCandidatesForCategory,
  automationSourcesForCategory,
  automationUxCategories,
} from "@/lib/admin-automation-presentation";
import { listAutomationSourceCandidates, listAutomationSourcesAdmin } from "@/lib/data-automation-source-store";
import { countOpenAutomationLifecycleSuggestions } from "@/lib/data-automation-lifecycle-store";

export const dynamic = "force-dynamic";

export default async function AutomationAdminPage() {
  const user = await requireAdminPageUser("/admin/automatizacie");
  const [sources, candidates, lifecycleCount] = await Promise.all([
    listAutomationSourcesAdmin(undefined, 200).catch(() => []),
    listAutomationSourceCandidates(undefined, 200).catch(() => []),
    countOpenAutomationLifecycleSuggestions().catch(() => 0),
  ]);

  return (
    <AdminShell
      user={user}
      eyebrow="Admin"
      title="Automatizácie"
      description="Vyber kategóriu a nastav priame hľadanie entít alebo monitoring opakovaných zdrojov. Nový obsah vzniká iba ako canonical koncept."
      actions={<Link href="/admin/automatizacie/zmeny-stavu">Zmeny stavu · {lifecycleCount}</Link>}
    >
      <section className={styles.hubGrid} aria-label="Kategórie automatizácií">
        {automationUxCategories.map((category) => {
          const categorySources = automationSourcesForCategory(sources, category.slug);
          const categoryCandidates = automationCandidatesForCategory(candidates, category.slug);
          const newCount = categoryCandidates.filter((candidate) => candidate.reviewStatus === "NEW" && candidate.lifecycle === "ACTIVE").length;
          const approvedCount = categorySources.filter((source) => source.reviewStatus === "APPROVED").length;
          const rejectedCount = categoryCandidates.filter((candidate) => candidate.reviewStatus === "REJECTED").length;
          return (
            <Link className={styles.hubCard} href={"/admin/automatizacie/" + category.slug} key={category.slug}>
              <h2>{category.title}</h2>
              <p>{category.description}</p>
              {category.mode === "DIRECT_ENTITY"
                ? <p>Priame vyhľadávanie entít · bez schvaľovania zdrojov</p>
                : <p>{newCount} nových · {approvedCount} schválených · {rejectedCount} zamietnutých</p>}
              <span className={styles.hubOpen}>{category.mode === "DIRECT_ENTITY" ? "Otvoriť automatizáciu →" : "Otvoriť zdroje →"}</span>
            </Link>
          );
        })}
      </section>
    </AdminShell>
  );
}
