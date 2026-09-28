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
import type {
  AutomationCanonicalContentLink,
  AutomationDirectRefreshSetting,
  AutomationUpdateSuggestionSummary,
} from "@/lib/data-automation-product-store";
import type { AutomationSourceAdminRow, AutomationSourceCandidateRow } from "@/lib/data-automation-source-store";
import styles from "./admin-operations-ux.module.css";

function directDiscoveryTitle(slug: string) {
  if (slug === "veterinari") return "Hľadať nových veterinárov";
  if (slug === "psie-sluzby") return "Hľadať nové psie služby";
  return "Hľadať nové útulky a organizácie";
}

function contentStatus(status: string) {
  const normalized = status.trim().toLowerCase();
  if (normalized === "draft") return "Koncept";
  if (normalized === "published" || normalized === "active") return "Publikované";
  return status || "Záznam";
}

function suggestionField(field: string | null, value: string | null, type: AutomationUpdateSuggestionSummary["suggestionType"]) {
  if (type === "POSSIBLE_CANCELLED") return "Zdroj uvádza možné zrušenie podujatia.";
  if (type === "POSSIBLE_INACTIVE") return "Zdroj uvádza možnú zmenu stavu.";
  const labels: Record<string, string> = {
    phone: "Telefón",
    publicPhone: "Telefón",
    public_phone: "Telefón",
    email: "E-mail",
    publicEmail: "E-mail",
    public_email: "E-mail",
    websiteUrl: "Web",
    website_url: "Web",
    description: "Opis",
    weight: "Hmotnosť",
    status: "Stav",
    startDate: "Dátum",
    start_date: "Dátum",
  };
  const label = field ? labels[field] ?? field : null;
  if (label && value) return `Nájdené doplnenie alebo zmena: ${label} · ${value}`;
  return label ? `Nájdené doplnenie alebo zmena: ${label}` : "Nájdené doplnenie alebo zmena.";
}

export function AdminAutomationCategorySources({
  category,
  sources,
  candidates,
  discoveryRoots,
  refreshSetting,
  directConcepts,
  updateSuggestions,
  sourceContent,
}: {
  category: AutomationUxCategory;
  sources: AutomationSourceAdminRow[];
  candidates: AutomationSourceCandidateRow[];
  discoveryRoots: AutomationDiscoveryRoot[];
  refreshSetting: AutomationDirectRefreshSetting | null;
  directConcepts: AutomationCanonicalContentLink[];
  updateSuggestions: AutomationUpdateSuggestionSummary[];
  sourceContent: Record<string, AutomationCanonicalContentLink[]>;
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
  const [refreshEnabled, setRefreshEnabled] = useState(refreshSetting?.enabled ?? false);
  const [refreshCadence, setRefreshCadence] = useState(refreshSetting?.cadenceMinutes ?? 20_160);
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
        body: JSON.stringify({ kind: "discovery", enabled: discoveryEnabled, cadenceMinutes: discoveryCadence }),
      });
      const payload = await response.json().catch(() => ({})) as { immediateRun?: boolean; error?: string };
      if (!response.ok) throw new Error(automationSourceOnlyErrorMessage(payload.error, "Nastavenie sa nepodarilo uložiť."));
      setMessage(payload.immediateRun
        ? "Hľadanie je zapnuté a prvá kontrola sa práve spustila."
        : "Nastavenie hľadania bolo uložené.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nastavenie sa nepodarilo uložiť.");
    } finally {
      setBusy(null);
    }
  }

  async function saveRefresh() {
    setBusy("refresh");
    setMessage("");
    try {
      const response = await fetch("/api/admin/automation-categories/" + category.slug, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "refresh", enabled: refreshEnabled, cadenceMinutes: refreshCadence }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(automationSourceOnlyErrorMessage(payload.error, "Nastavenie kontroly zmien sa nepodarilo uložiť."));
      setMessage("Nastavenie kontroly doplnení a zmien bolo uložené.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nastavenie kontroly zmien sa nepodarilo uložiť.");
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

  const discoveryHeading = category.mode === "DIRECT_ENTITY"
    ? directDiscoveryTitle(category.slug)
    : "Hľadať nové zdroje";

  return (
    <>
      {message && <p className="admin-flash" role="status">{message}</p>}

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>{discoveryHeading}</h2>
            <p>{category.mode === "DIRECT_ENTITY"
              ? "Výsledok vyhľadávania sa rovno porovná s existujúcimi záznamami. Nová entita vznikne iba ako canonical koncept; nevyžaduje schvaľovanie zdroja."
              : "Psipedia hľadá možné opakované zdroje. Zdroj začne vytvárať obsah až po schválení a zapnutí."}</p>
          </div>
        </div>
        <label className="admin-field">
          <span>{category.mode === "DIRECT_ENTITY" ? discoveryHeading : "Automaticky hľadať nové zdroje"}</span>
          <select value={discoveryEnabled ? "on" : "off"} onChange={(event) => setDiscoveryEnabled(event.target.value === "on")} disabled={busy !== null}>
            <option value="off">Vypnuté</option>
            <option value="on">Zapnuté</option>
          </select>
        </label>
        <label className="admin-field">
          <span>{category.mode === "DIRECT_ENTITY" ? "Ako často hľadať" : "Ako často hľadať nové zdroje"}</span>
          <select value={discoveryCadence} onChange={(event) => setDiscoveryCadence(Number(event.target.value))} disabled={busy !== null}>
            {cadenceOptions.map((option) => <option key={option.minutes} value={option.minutes}>{option.label}</option>)}
          </select>
        </label>
        <div className="admin-form-actions">
          <button className="is-primary" type="button" disabled={busy !== null} onClick={() => void saveDiscovery()}>
            {busy === "discovery" ? "Ukladám…" : "Uložiť nastavenie"}
          </button>
        </div>
      </section>

      {category.mode === "DIRECT_ENTITY" ? (
        <>
          <section className={styles.section}>
            <div className={styles.sectionHeader}><div><h2>Kontrolovať doplnenia a zmeny</h2><p>Existujúce záznamy sa kontrolujú po bounded dávkach. Zistená zmena sa iba navrhne; canonical záznam sa automaticky nemení.</p></div></div>
            <label className="admin-field"><span>Kontrolovať existujúce záznamy</span><select value={refreshEnabled ? "on" : "off"} onChange={(event) => setRefreshEnabled(event.target.value === "on")} disabled={busy !== null}><option value="off">Vypnuté</option><option value="on">Zapnuté</option></select></label>
            <label className="admin-field"><span>Ako často kontrolovať</span><select value={refreshCadence} onChange={(event) => setRefreshCadence(Number(event.target.value))} disabled={busy !== null}>{automationCadenceOptions.filter((option) => option.minutes >= 10_080).map((option) => <option key={option.minutes} value={option.minutes}>{option.label}</option>)}</select></label>
            <div className="admin-form-actions"><button className="is-primary" type="button" disabled={busy !== null} onClick={() => void saveRefresh()}>{busy === "refresh" ? "Ukladám…" : "Uložiť nastavenie"}</button></div>
          </section>

          <section className={styles.section} id="nove-koncepty">
            <div className={styles.sectionHeader}><div><h2>Nové koncepty</h2></div><span className={styles.sectionCount}>{directConcepts.length}</span></div>
            {directConcepts.length ? <div className={styles.itemList}>{directConcepts.map((item) => <article className={styles.itemCard} key={item.entityType + ":" + item.canonicalEntityId}><div className={styles.itemMain}><div className={styles.itemTitle}><strong>{item.label}</strong></div><p>{[contentStatus(item.status), item.secondary].filter(Boolean).join(" · ")}</p></div><Link className={styles.itemAction} href={item.href}>Otvoriť →</Link></article>)}</div> : <div className={styles.empty}>Zatiaľ nebol vytvorený žiadny nový koncept.</div>}
          </section>

          <section className={styles.section} id="doplnenia-zmeny">
            <div className={styles.sectionHeader}><div><h2>Doplnenia a zmeny</h2></div><span className={styles.sectionCount}>{updateSuggestions.length}</span></div>
            {updateSuggestions.length ? <div className={styles.itemList}>{updateSuggestions.map((item) => <article className={styles.itemCard} key={item.origin + ":" + item.id}><div className={styles.itemMain}><div className={styles.itemTitle}><strong>{item.label}</strong></div><p>{suggestionField(item.field, item.value, item.suggestionType)}</p></div><Link className={styles.itemAction} href={item.href}>Otvoriť profil →</Link></article>)}</div> : <div className={styles.empty}>Zatiaľ neboli nájdené žiadne doplnenia ani zmeny.</div>}
          </section>
        </>
      ) : (
        <>
          <section className={styles.section} id="nove-zdroje">
            <div className={styles.sectionHeader}><div><h2>Nové zdroje</h2></div><span className={styles.sectionCount}>{newCandidates.length}</span></div>
            {newCandidates.length ? <div className={styles.itemList}>{newCandidates.map((candidate) => <article className={styles.itemCard} key={candidate.id}><div className={styles.itemMain}><div className={styles.itemTitle}><strong>{candidate.label || automationSourceDomain(candidate.sourceUrl)}</strong></div><p><a href={candidate.sourceUrl} target="_blank" rel="noreferrer">{automationSourceDomain(candidate.sourceUrl)} ↗</a></p></div><div className="admin-form-actions"><button className="is-primary" type="button" disabled={busy !== null} onClick={() => void reviewCandidate(candidate.id, "approve")}>{busy === "approve:" + candidate.id ? "Schvaľujem…" : "Schváliť"}</button><button className="is-danger" type="button" disabled={busy !== null} onClick={() => void reviewCandidate(candidate.id, "reject")}>{busy === "reject:" + candidate.id ? "Zamietam…" : "Zamietnuť"}</button></div></article>)}</div> : <div className={styles.empty}>Zatiaľ sme nenašli žiadne nové zdroje.</div>}
          </section>

          <section className={styles.section} id="schvalene-zdroje">
            <div className={styles.sectionHeader}><div><h2>Schválené zdroje</h2></div><span className={styles.sectionCount}>{approvedSources.length}</span></div>
            {approvedSources.length ? <div className={styles.itemList}>{approvedSources.map((source) => {
              const found = sourceContent[String(source.id)] ?? [];
              return <article className={styles.itemCard} key={source.id}><div className={styles.itemMain}><div className={styles.itemTitle}><strong>{source.label}</strong></div><p>{automationSourceDomain(source.sourceUrl)} · {source.enabled ? "Kontrolovanie zapnuté" : "Kontrolovanie vypnuté"}</p><div><strong>Nájdený obsah</strong>{found.length ? found.map((item) => <p key={item.entityType + ":" + item.canonicalEntityId}><Link href={item.href}>{contentStatus(item.status)} · {item.label}{item.secondary ? " · " + item.secondary : ""} →</Link></p>) : <p>Zatiaľ žiadny canonical obsah.</p>}</div></div><Link className={styles.itemAction} href={"/admin/automatizacie/zdroje/" + source.id}>Otvoriť zdroj</Link></article>;
            })}</div> : <div className={styles.empty}>Zatiaľ nemáte schválený žiadny zdroj.</div>}
          </section>

          <section className={styles.section} id="doplnenia-zmeny">
            <div className={styles.sectionHeader}><div><h2>Doplnenia a zmeny</h2></div><span className={styles.sectionCount}>{updateSuggestions.length}</span></div>
            {updateSuggestions.length ? <div className={styles.itemList}>{updateSuggestions.map((item) => <article className={styles.itemCard} key={item.origin + ":" + item.id}><div className={styles.itemMain}><div className={styles.itemTitle}><strong>{item.label}</strong></div><p>{suggestionField(item.field, item.value, item.suggestionType)}</p></div><Link className={styles.itemAction} href={item.href}>Otvoriť →</Link></article>)}</div> : <div className={styles.empty}>Zatiaľ neboli nájdené žiadne doplnenia ani zmeny.</div>}
          </section>

          <section className={styles.section} id="zamietnute-zdroje">
            <div className={styles.sectionHeader}><div><h2>Zamietnuté zdroje</h2></div><span className={styles.sectionCount}>{rejectedCandidates.length}</span></div>
            {rejectedCandidates.length ? <div className={styles.itemList}>{rejectedCandidates.map((candidate) => <article className={styles.itemCard} key={candidate.id}><div className={styles.itemMain}><div className={styles.itemTitle}><strong>{candidate.label || automationSourceDomain(candidate.sourceUrl)}</strong></div><p>{automationSourceDomain(candidate.sourceUrl)}</p></div></article>)}</div> : <div className={styles.empty}>Zatiaľ ste nezamietli žiadny zdroj.</div>}
          </section>
        </>
      )}
    </>
  );
}
