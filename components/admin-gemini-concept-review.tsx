"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminActionButton, AdminDestructiveConfirmDialog } from "@/components/admin-interaction-system";
import { safeGeminiReviewUrl, type GeminiDirectoryReviewConcept } from "@/lib/gemini-automation-concept-review";
import styles from "./admin-gemini-concept-review.module.css";

function formatDiscoveredAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("sk-SK", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Bratislava",
  }).format(date);
}

function Field({ label, value }: { label: string; value: string }) {
  return value ? <div className={styles.field}><dt>{label}</dt><dd>{value}</dd></div> : null;
}

function ExternalLink({ label, url }: { label: string; url: string }) {
  const href = safeGeminiReviewUrl(url);
  return href
    ? <a href={href} target="_blank" rel="noopener noreferrer" className={styles.external}>{label} ↗</a>
    : null;
}

export function AdminGeminiConceptReview({ concepts }: { concepts: GeminiDirectoryReviewConcept[] }) {
  const router = useRouter();
  const inFlight = useRef(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [hiddenIds, setHiddenIds] = useState<number[]>([]);
  const visible = concepts.filter((item) => !hiddenIds.includes(item.id));
  const selected = concepts.find((item) => item.id === confirmId);

  async function reject() {
    if (!selected || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setErrors((current) => ({ ...current, [selected.id]: "" }));
    try {
      const response = await fetch("/api/admin/gemini-automation/concepts/" + selected.id + "/reject", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const data = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error || "Koncept sa nepodarilo odmietnuť.");
      setHiddenIds((current) => [...current, selected.id]);
      setConfirmId(null);
      router.refresh();
    } catch (error) {
      setErrors((current) => ({
        ...current, [selected.id]: error instanceof Error ? error.message : "Odmietnutie zlyhalo.",
      }));
      setConfirmId(null);
    } finally {
      setPending(false);
      inFlight.current = false;
    }
  }

  return (
    <section className={styles.container} aria-labelledby="gemini-queue-title">
      <div className={styles.heading}>
        <h2 id="gemini-queue-title">Čakajú na kontrolu</h2>
        <span>{visible.length} záznamov v aktuálnom prehľade (max. 50)</span>
      </div>
      {visible.length === 0 && <p className={styles.empty}>Žiadne prepojené Gemini koncepty momentálne nečakajú na kontrolu.</p>}
      <div className={styles.grid}>
        {visible.map((concept) => (
          <article className={styles.card} key={concept.id}>
            <div className={styles.top}>
              <div className={styles.title}>
                <span className={styles.state}>Gemini koncept · čaká na kontrolu</span>
                <h3>{concept.name}</h3>
                <p>{[concept.category, concept.city, concept.district, concept.region].filter(Boolean).join(" · ")}</p>
              </div>
              <small>Objavené {formatDiscoveredAt(concept.discoveredAt)}</small>
            </div>
            {concept.description && <p className={styles.description}>{concept.description}</p>}
            <dl className={styles.details}>
              <Field label="Web" value={concept.website} />
              <Field label="Telefón" value={concept.phone} />
              <Field label="E-mail" value={concept.email} />
              <Field label="Facebook" value={concept.facebook} />
              <Field label="Instagram" value={concept.instagram} />
              <Field label="Canonical ID" value={String(concept.canonicalEntityId)} />
            </dl>
            <div className={styles.sources}>
              <strong>Zdroje</strong>
              {concept.primarySourceUrl && <ExternalLink label="Hlavný zdroj" url={concept.primarySourceUrl} />}
              {concept.sourceUrls.filter((url) => url !== concept.primarySourceUrl).map((url, index) => (
                <ExternalLink key={url} label={"Ďalší zdroj " + (index + 1)} url={url} />
              ))}
              {!concept.sourceUrls.length && <span>Bez platného externého odkazu</span>}
              {concept.notionPageId && <span className={styles.notionsync}>Prepojené s Notion</span>}
            </div>
            <div className={styles.actions}>
              <Link className="admin-primary-action"
                href={"/admin/adresar/" + concept.canonicalEntityId}>Upraviť a skontrolovať</Link>
              <AdminActionButton variant="destructive" disabled={pending}
                onClick={() => { setErrors((current) => ({ ...current, [concept.id]: "" })); setConfirmId(concept.id); }}>
                Odmietnuť
              </AdminActionButton>
            </div>
            {errors[concept.id] && <p className={styles.error} role="alert">{errors[concept.id]}</p>}
          </article>
        ))}
      </div>
      <AdminDestructiveConfirmDialog
        open={Boolean(selected)}
        title="Odmietnuť Gemini koncept?"
        description="Canonical profil sa archivuje, nič sa nepublikuje a systém si zapamätá identitu, aby rovnaký subjekt znova neponúkol."
        affectedCount={1}
        affectedLabel="koncept"
        confirmLabel="Odmietnuť a archivovať"
        pending={pending}
        onCancel={() => { if (!pending) setConfirmId(null); }}
        onConfirm={() => void reject()}
      />
    </section>
  );
}
