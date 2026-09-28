"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  automationCadenceOptions,
  automationDiscoveryMinimumCadenceMinutes,
  automationSourceDomain,
  automationSourceOnlyErrorMessage,
  type AutomationUxCategory,
} from "@/lib/admin-automation-presentation";
import type { AutomationDiscoveryRoot } from "@/lib/data-automation-discovery-store";
import type { AutomationSourceAdminRow, AutomationSourceCandidateRow } from "@/lib/data-automation-source-store";
import styles from "./admin-operations-ux.module.css";

export function AdminAutomationCategorySources({
  category,
  sources,
  candidates,
  discoveryRoots,
}: {
  category: AutomationUxCategory;
  sources: AutomationSourceAdminRow[];
  candidates: AutomationSourceCandidateRow[];
  discoveryRoots: AutomationDiscoveryRoot[];
}) {
  const router = useRouter();
  const minimumCadence = automationDiscoveryMinimumCadenceMinutes(category.slug);
  const cadenceOptions = useMemo(
    () => automationCadenceOptions.filter((option) => option.minutes >= minimumCadence),
    [minimumCadence],
  );
  const initialCadence = discoveryRoots[0]?.cadenceMinutes;
  const [discoveryEnabled, setDiscoveryEnabled] = useState(discoveryRoots.some((root) => root.enabled));
  const [discoveryCadence, setDiscoveryCadence] = useState(
    cadenceOptions.some((option) => option.minutes === initialCadence)
      ? Number(initialCadence)
      : cadenceOptions[0].minutes,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const newCandidates = candidates.filter((candidate) => candidate.reviewStatus === "NEW" && candidate.lifecycle === "ACTIVE");
  const rejectedCandidates = candidates.filter((candidate) => candidate.reviewStatus === "REJECTED");
  const approvedSources = sources.filter((source) => source.reviewStatus === "APPROVED");

  async function saveDiscovery() {
    setBusy("discovery");
    setMessage("");
    try {
      const response = await fetch("/api/admin/automation-categories/" + category.slug, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: discoveryEnabled, cadenceMinutes: discoveryCadence }),
      });
      const payload = await response.json().catch(() => ({})) as { immediateRun?: boolean; error?: string };
      if (!response.ok) throw new Error(automationSourceOnlyErrorMessage(payload.error, "Nastavenie sa nepodarilo uložiť."));
      setMessage(payload.immediateRun
        ? "Hľadanie je zapnuté a prvé hľadanie sa práve spustilo."
        : "Nastavenie hľadania bolo uložené.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nastavenie sa nepodarilo uložiť.");
    } finally {
      setBusy(null);
    }
  }

  async function reviewCandidate(id: number, action: "approve" | "reject") {
    setBusy(action + ":" + id);
    setMessage("");
    try {
      const response = await fetch("/api/admin/automation-source-candidates/" + id, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(automationSourceOnlyErrorMessage(payload.error, "Rozhodnutie sa nepodarilo uložiť."));
      setMessage(action === "approve"
        ? "Zdroj bol schválený. Kontrolovanie zostáva vypnuté, kým ho zapneš v detaile zdroja."
        : "Zdroj bol zamietnutý a pri ďalšom hľadaní sa už medzi nové zdroje nevráti.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Rozhodnutie sa nepodarilo uložiť.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {message && <p className="admin-flash" role="status">{message}</p>}
      <section className={styles.section}>
        <div className={styles.sectionHeader}><div><h2>Hľadať nové zdroje</h2><p>Psipedia hľadá iba možné zdroje. Nájdený obsah vzniká až po schválení a zapnutí konkrétneho zdroja.</p></div></div>
        <label className="admin-field"><span>Automaticky hľadať nové zdroje</span><select value={discoveryEnabled ? "on" : "off"} onChange={(event) => setDiscoveryEnabled(event.target.value === "on")} disabled={busy !== null}><option value="off">Vypnuté</option><option value="on">Zapnuté</option></select></label>
        <label className="admin-field"><span>Ako často hľadať nové zdroje</span><select value={discoveryCadence} onChange={(event) => setDiscoveryCadence(Number(event.target.value))} disabled={busy !== null}>{cadenceOptions.map((option) => <option key={option.minutes} value={option.minutes}>{option.label}</option>)}</select></label>
        <div className="admin-form-actions"><button className="is-primary" type="button" disabled={busy !== null} onClick={() => void saveDiscovery()}>{busy === "discovery" ? "Ukladám…" : "Uložiť nastavenie"}</button></div>
      </section>

      <section className={styles.section} id="nove-zdroje">
        <div className={styles.sectionHeader}><div><h2>Nové zdroje</h2></div><span className={styles.sectionCount}>{newCandidates.length}</span></div>
        {newCandidates.length ? <div className={styles.itemList}>{newCandidates.map((candidate) => <article className={styles.itemCard} key={candidate.id}><div className={styles.itemMain}><div className={styles.itemTitle}><strong>{candidate.label || automationSourceDomain(candidate.sourceUrl)}</strong></div><p><a href={candidate.sourceUrl} target="_blank" rel="noreferrer">{automationSourceDomain(candidate.sourceUrl)} ↗</a></p></div><div className="admin-form-actions"><button className="is-primary" type="button" disabled={busy !== null} onClick={() => void reviewCandidate(candidate.id, "approve")}>{busy === "approve:" + candidate.id ? "Schvaľujem…" : "Schváliť"}</button><button className="is-danger" type="button" disabled={busy !== null} onClick={() => void reviewCandidate(candidate.id, "reject")}>{busy === "reject:" + candidate.id ? "Zamietam…" : "Zamietnuť"}</button></div></article>)}</div> : <div className={styles.empty}>Zatiaľ sme nenašli žiadne nové zdroje.</div>}
      </section>

      <section className={styles.section} id="schvalene-zdroje">
        <div className={styles.sectionHeader}><div><h2>Schválené zdroje</h2></div><span className={styles.sectionCount}>{approvedSources.length}</span></div>
        {approvedSources.length ? <div className={styles.itemList}>{approvedSources.map((source) => <article className={styles.itemCard} key={source.id}><div className={styles.itemMain}><div className={styles.itemTitle}><strong>{source.label}</strong></div><p>{automationSourceDomain(source.sourceUrl)} · {source.enabled ? "Kontrolovanie zapnuté" : "Kontrolovanie vypnuté"}</p></div><Link className={styles.itemAction} href={"/admin/automatizacie/zdroje/" + source.id}>Otvoriť zdroj</Link></article>)}</div> : <div className={styles.empty}>Zatiaľ nemáte schválený žiadny zdroj.</div>}
        <p><Link href={category.draftsHref}>Otvoriť koncepty →</Link></p>
      </section>

      <section className={styles.section} id="zamietnute-zdroje">
        <div className={styles.sectionHeader}><div><h2>Zamietnuté zdroje</h2></div><span className={styles.sectionCount}>{rejectedCandidates.length}</span></div>
        {rejectedCandidates.length ? <div className={styles.itemList}>{rejectedCandidates.map((candidate) => <article className={styles.itemCard} key={candidate.id}><div className={styles.itemMain}><div className={styles.itemTitle}><strong>{candidate.label || automationSourceDomain(candidate.sourceUrl)}</strong></div><p>{automationSourceDomain(candidate.sourceUrl)}</p></div></article>)}</div> : <div className={styles.empty}>Zatiaľ ste nezamietli žiadny zdroj.</div>}
      </section>
    </>
  );
}
