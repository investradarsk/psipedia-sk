import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import styles from "@/components/admin-operations-ux.module.css";
import { requireAdminPageUser } from "@/lib/admin-auth";
import {
  countOpenAutomationAddressReviews,
  listOpenAutomationAddressReviews,
  type AutomationAddressReviewCategory,
} from "@/lib/data-automation-address-review-store";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ category?: string }>;
};

function categoryFilter(value: string | undefined): AutomationAddressReviewCategory | null {
  return value === "veterinari" || value === "psie-sluzby" ? value : null;
}

function categoryLabel(value: AutomationAddressReviewCategory) {
  return value === "veterinari" ? "Veterinári" : "Psie služby";
}

function reasonLabel(reason: string) {
  return reason === "MULTIPLE_EXACT_CANDIDATES"
    ? "Našli sa viaceré možné presné adresy."
    : "Adresu treba potvrdiť.";
}

function sourceDomain(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "Zdroj"; }
}

export default async function AutomationAddressReviewQueuePage({ searchParams }: Props) {
  const params = await searchParams;
  const category = categoryFilter(params.category);
  const user = await requireAdminPageUser("/admin/automatizacie/adresy");
  const [reviews, total] = await Promise.all([
    listOpenAutomationAddressReviews({ categorySlug: category, limit: 100 }).catch(() => []),
    countOpenAutomationAddressReviews(category).catch(() => 0),
  ]);

  return (
    <AdminShell
      user={user}
      eyebrow="Automatizácie · Vyžaduje kontrolu"
      title="Adresy na kontrolu"
      description="Automatizácia našla adresu, ale potrebuje potvrdiť správnu budovu alebo prevádzku."
      actions={<Link href="/admin/automatizacie">← Automatizácie</Link>}
    >
      <nav className={styles.sectionNav} aria-label="Filter kategórie">
        <Link href="/admin/automatizacie/adresy">Všetky</Link>
        <Link href="/admin/automatizacie/adresy?category=veterinari">Veterinári</Link>
        <Link href="/admin/automatizacie/adresy?category=psie-sluzby">Psie služby</Link>
      </nav>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>{category ? categoryLabel(category) : "Otvorené kontroly"}</h2>
            <p>Vyber iba z bezpečných exact kandidátov. Finálny zápis vždy prejde novým provider overením.</p>
          </div>
          <span className={styles.sectionCount}>{total}</span>
        </div>

        {reviews.length ? (
          <div className={styles.itemList}>
            {reviews.map((review) => (
              <article className={styles.itemCard} key={review.id}>
                <div className={styles.itemMain}>
                  <strong className={styles.itemTitle}>{review.canonicalName}</strong>
                  <div className={styles.badges}>
                    <span className={styles.badge}>{categoryLabel(review.categorySlug)}</span>
                    <span className={styles.badgeWarning}>{review.candidates.length} možnosti</span>
                  </div>
                  <p>{reasonLabel(review.reason)}</p>
                  <p><strong>Nájdené:</strong> {review.evidence || "—"}</p>
                  <p>
                    <strong>Aktuálna adresa:</strong>{" "}
                    {review.canonicalBefore.serviceAddressConfirmation === "CONFIRMED_SERVICE_LOCATION"
                      ? String(review.canonicalBefore.address || "Potvrdená")
                      : "Bez potvrdenej adresy"}
                  </p>
                  <p><strong>Zdroj:</strong> {sourceDomain(review.externalSourceUrl)} · <strong>Naposledy:</strong> {review.lastDetectedAt}</p>
                </div>
                <div className={styles.actionStack}>
                  <Link className={styles.itemActionPrimary} href={`/admin/automatizacie/adresy/${review.id}`}>
                    Skontrolovať
                  </Link>
                  <Link className={styles.itemAction} href={review.canonicalHref}>Otvoriť profil</Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className={styles.empty}>Žiadne adresy momentálne nevyžadujú manuálne potvrdenie.</p>
        )}
      </section>
    </AdminShell>
  );
}
