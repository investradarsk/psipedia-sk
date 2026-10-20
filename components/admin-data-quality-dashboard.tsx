"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { AdminActionButton, AdminBulkActionToolbar, AdminModalDialog } from "@/components/admin-interaction-system";
import { MAX_IMAGE_REVIEW_BATCH, summarizeMediaReviewOutcome, type MediaReviewAction } from "@/lib/admin-data-quality-image-review";
import styles from "./admin-data-quality-image-review-v2.module.css";
import type { DataQualityDashboard, DataQualityFieldSuggestion } from "@/lib/data-quality-store";

function mediaStatusLabel(status: string) {
  if (status === "CHANGED") return "Obrázok sa zmenil";
  if (status === "CANDIDATE") return "Nový obrázok";
  if (status === "MISSING") return "Zdroj chýba";
  if (status === "ERROR") return "Kontrola zlyhala";
  return status;
}

function mediaStatusTone(status: string) {
  if (status === "CHANGED" || status === "CANDIDATE") return "is-review";
  if (status === "MISSING" || status === "ERROR") return "is-error";
  return "";
}

function checkedAt(value: string | null) {
  if (!value) return "Ešte nekontrolované";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Neznámy čas kontroly"
    : new Intl.DateTimeFormat("sk-SK", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
}

function count(value: number | null) {
  return value === null ? "—" : String(value);
}

function reference(errorRef: string | null) {
  return errorRef ? <> Referencia: <code>{errorRef}</code>.</> : null;
}

function priorityLabel(priority: "critical" | "important" | "supplement") {
  if (priority === "critical") return "Kritické";
  if (priority === "important") return "Dôležité";
  return "Doplniť";
}

export function AdminDataQualityDashboard({ data }: { data: DataQualityDashboard }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [busy, setBusy] = useState<string | null>(null);
  const decisionInFlight = useRef(false);
  const [message, setMessage] = useState("");
  const [selectedMedia, setSelectedMedia] = useState<Set<number>>(new Set());
  const [decision, setDecision] = useState<{
    action: MediaReviewAction; ids: number[]; label: string; expectedCandidates: Record<string, string>;
  } | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [reviewReason, setReviewReason] = useState("");
  const [reviewHistory, setReviewHistory] = useState<{
    monitorId: number; loading: boolean;
    entries: Array<{ id: string; action: string; reason: string | null;
      actor_ref: string; decided_at: string; outcome: string }>; error: string | null;
  } | null>(null);
  const [failedItems, setFailedItems] = useState<Array<{ id: number; error: string }>>([]);
  const [resultTone, setResultTone] = useState<"success" | "partial" | "error" | null>(null);
  const activeSection = searchParams.get("section") === "media" ? "media" : "profiles";
  const hasProfileFilters = data.category !== "all"
    || data.issue !== "all"
    || data.profileStatus !== "all"
    || data.priority !== "all"
    || data.solution !== "all"
    || Boolean(data.query)
    || Boolean(data.region)
    || Boolean(data.district);
  const hasMediaFilters = data.category !== "all" || data.mediaStatus !== "all";
  const hasActiveFilters = activeSection === "media" ? hasMediaFilters : hasProfileFilters;

  const reviewableMediaIds = data.media
    .filter(({ monitor }) => Boolean(monitor.candidateImageKey))
    .map(({ monitor }) => monitor.id);
  const visibleReviewableIds = new Set(reviewableMediaIds);
  const visibleSelectedMedia = new Set([...selectedMedia].filter((id) => visibleReviewableIds.has(id)));
  const allReviewableSelected = reviewableMediaIds.length > 0
    && reviewableMediaIds.every((id) => visibleSelectedMedia.has(id));
  const detailItem = data.media.find(({ monitor }) => monitor.id === detailId);
  const singleDecisionItem = decision?.ids.length === 1
    ? data.media.find(({ monitor }) => monitor.id === decision.ids[0]) : null;

  function pageHref(key: "page" | "mediaPage", value: number) {
    const query = new URLSearchParams(searchParams.toString());
    if (value <= 1) query.delete(key);
    else query.set(key, String(value));
    const suffix = query.toString();
    return suffix ? `/admin/kvalita?${suffix}` : "/admin/kvalita";
  }

  function sectionHref(section: "profiles" | "media") {
    const query = new URLSearchParams(searchParams.toString());
    if (section === "media") {
      query.set("section", "media");
      query.delete("page");
      query.delete("q");
      query.delete("issue");
      query.delete("status");
      query.delete("priority");
      query.delete("solution");
      query.delete("region");
      query.delete("district");
    } else {
      query.delete("section");
      query.delete("mediaPage");
      query.delete("mediaStatus");
      if (query.get("category") === "podujatia") query.delete("category");
    }
    const suffix = query.toString();
    return suffix ? `/admin/kvalita?${suffix}` : "/admin/kvalita";
  }

  async function runMediaCheck() {
    setBusy("run");
    setMessage("");
    try {
      const response = await fetch("/api/admin/data-quality/media/run", { method: "POST" });
      const result = await response.json() as { error?: string; checked?: number; changed?: number; candidate?: number };
      if (!response.ok) throw new Error(result.error || "Kontrola sa nepodarila.");
      setMessage(`Kontrola dokončená. Skontrolované: ${result.checked ?? 0}, zmenené: ${result.changed ?? 0}, nové kandidáty: ${result.candidate ?? 0}.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Kontrola sa nepodarila.");
    } finally {
      setBusy(null);
    }
  }

  function openMediaDecision(action: MediaReviewAction, ids: number[]) {
    if (busy !== null) return;
    const requested = new Set(ids);
    const items = data.media.filter(({ monitor }) =>
      requested.has(monitor.id) && Boolean(monitor.candidateImageKey));
    if (!items.length || items.length > MAX_IMAGE_REVIEW_BATCH) return;
    const expectedCandidates = Object.fromEntries(items.map(({ monitor }) =>
      [String(monitor.id), monitor.candidateImageKey as string]));
    setDetailId(null);
    setReviewReason("");
    setDecision({
      action, ids: items.map(({ monitor }) => monitor.id),
      label: items.length === 1 ? items[0].label : "", expectedCandidates,
    });
  }

  async function loadMediaHistory(monitorId: number) {
    setReviewHistory({ monitorId, loading: true, entries: [], error: null });
    try {
      const response = await fetch(`/api/admin/data-quality/media/${monitorId}/history`, {
        method: "GET", cache: "no-store",
      });
      const result = await response.json() as {
        error?: string; history?: Array<{ id: string; action: string; reason: string | null;
          actor_ref: string; decided_at: string; outcome: string }>;
      };
      if (!response.ok) throw new Error(result.error || "Históriu rozhodnutí sa nepodarilo načítať.");
      setReviewHistory({ monitorId, loading: false, entries: result.history ?? [], error: null });
    } catch (error) {
      setReviewHistory({ monitorId, loading: false, entries: [],
        error: error instanceof Error ? error.message : "História nie je dostupná." });
    }
  }

  async function confirmMediaDecision() {
    if (!decision || busy !== null || decisionInFlight.current) return;
    decisionInFlight.current = true;
    const { action, ids, expectedCandidates } = decision;
    const reason = action === "reject" ? reviewReason : undefined;
    setBusy(`bulk-${action}`);
    setMessage("");
    setFailedItems([]);
    setResultTone(null);
    try {
      const individualApproval = action === "accept" && ids.length === 1;
      const response = await fetch(individualApproval
        ? `/api/admin/data-quality/media/${ids[0]}/accept`
        : "/api/admin/data-quality/media/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(individualApproval
          ? { expectedCandidateImageKey: expectedCandidates[String(ids[0])] }
          : { action, ids, expectedCandidates, reason }),
      });
      const result = await response.json() as {
        error?: string; requested?: number; updated?: number;
        failed?: Array<{ id: number; error: string }>;
      };
      const normalized = individualApproval && response.ok
        ? { requested: 1, updated: 1, failed: [] as Array<{ id: number; error: string }> }
        : result;
      if (!response.ok && !normalized.failed?.length)
        throw new Error(result.error || "Operácia sa nepodarila.");
      const summary = summarizeMediaReviewOutcome(action, ids, normalized);
      setMessage(summary.message);
      setFailedItems(summary.failed);
      setResultTone(summary.tone);
      setSelectedMedia(new Set(summary.failed.map(({ id }) => id)));
      setDecision(null);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Operácia sa nepodarila.");
      setResultTone("error");
      // No automatic retry: a second request requires an explicit new click.
    } finally {
      decisionInFlight.current = false;
      setBusy(null);
    }
  }

  async function reviewFieldSuggestion(
    profileId: number,
    suggestion: DataQualityFieldSuggestion,
    action: "accept" | "reject",
  ) {
    if (action === "reject" && !window.confirm(`Zamietnuť návrh pre ${suggestion.label.toLowerCase()}?`)) return;
    if (action === "accept" && suggestion.reviewMode !== "accept") return;
    const key = `quality-${action}-${suggestion.origin}-${suggestion.suggestionId}-${suggestion.field}`;
    setBusy(key);
    setMessage("");
    try {
      const response = await fetch(
        `/api/admin/automation-update-suggestions/${suggestion.origin}/${suggestion.suggestionId}/fields/${encodeURIComponent(suggestion.field)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action,
            expectedProposedValueHash: suggestion.proposedValueHash,
            expectedUpdatedAt: suggestion.canonicalUpdatedAt,
          }),
        },
      );
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Návrh sa nepodarilo spracovať.");
      setMessage(action === "accept"
        ? `${suggestion.label} bol prevzatý do profilu #${profileId}.`
        : `Návrh pre ${suggestion.label.toLowerCase()} bol zamietnutý.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Návrh sa nepodarilo spracovať.");
    } finally {
      setBusy(null);
    }
  }

  const profilesUnavailable = data.sections.profiles.status === "UNAVAILABLE";
  const suggestionsUnavailable = data.sections.suggestions.status === "UNAVAILABLE";
  const mediaUnavailable = data.sections.media.status === "UNAVAILABLE";
  const lookupsUnavailable = data.sections.lookups.status === "UNAVAILABLE";

  return (
    <>
      <AdminModalDialog
        open={Boolean(decision)}
        title={decision?.action === "reject" ? "Potvrdiť zamietnutie obrázkov" : "Potvrdiť schválenie obrázkov"}
        description={decision?.ids.length === 1 ? decision.label : `Vybrané obrázky: ${decision?.ids.length ?? 0}`}
        onClose={() => { if (busy === null) setDecision(null); }}
        footer={<>
          <AdminActionButton variant="neutral" disabled={busy !== null} onClick={() => setDecision(null)}>Zrušiť</AdminActionButton>
          <AdminActionButton variant={decision?.action === "reject" ? "destructive" : "primary"}
            disabled={busy !== null || !decision} onClick={() => void confirmMediaDecision()}>
            {busy ? (decision?.action === "reject" ? "Zamietam…" : "Schvaľujem…")
              : decision?.action === "reject" ? "Zamietnuť označené" : "Schváliť označené"}
          </AdminActionButton>
        </>}>
        <div className={styles.confirmBody}>
          <strong>Počet označených obrázkov: {decision?.ids.length ?? 0}</strong>
          {singleDecisionItem?.monitor.candidateImageKey ? (
            <img className={styles.confirmImage}
              src={`/media/${singleDecisionItem.monitor.candidateImageKey}`}
              alt={`Navrhovaný obrázok pre ${singleDecisionItem.label}`} />
          ) : null}
          {decision?.action === "reject" ? (
            <p>Zamietnuté návrhy sa odstránia z aktuálnej kontroly. Aktuálne publikované obrázky sa tým nezmenia. Systém sa následne pokúsi nájsť iných kandidátov; náhrada nie je zaručená.</p>
          ) : (
            <p>Nové obrázky sa uložia k príslušným profilom alebo podujatiam a môžu nahradiť ich doterajšie obrázky.</p>
          )}
          {decision?.action === "reject" ? (
            <label className={styles.reasonField}>
              <span>Dôvod zamietnutia (voliteľný)</span>
              <textarea name="reason" rows={3} maxLength={500} value={reviewReason}
                disabled={busy !== null} onChange={(event) => setReviewReason(event.target.value)}
                placeholder="Krátke vysvetlenie rozhodnutia" />
              <small>{Array.from(reviewReason).length} / 500 znakov. Dôvod sa uloží do histórie rozhodnutí.</small>
            </label>
          ) : null}
          {resultTone === "error" && message ? <p role="alert" className={styles.errorNotice}>{message}</p> : null}
        </div>
      </AdminModalDialog>
      <AdminModalDialog open={Boolean(detailItem) && !decision}
        title={detailItem ? `Porovnanie obrázkov – ${detailItem.label}` : "Porovnanie obrázkov"}
        description="Detail aktuálneho a navrhovaného obrázka bez straty filtrov a výberu."
        onClose={() => setDetailId(null)}
        footer={<AdminActionButton variant="neutral" onClick={() => setDetailId(null)}>Späť na zoznam</AdminActionButton>}>
        <div className={styles.detailPreview}>
          {detailItem?.monitor.activeImageKey ? (
            <figure>
              <figcaption>Aktuálny obrázok</figcaption>
              <img src={`/media/${detailItem.monitor.activeImageKey}`} alt={`Aktuálny obrázok pre ${detailItem.label}`} />
            </figure>
          ) : <p>Profil zatiaľ nemá aktuálny obrázok.</p>}
          {detailItem?.monitor.candidateImageKey ? (
            <figure>
              <figcaption>Navrhovaný obrázok</figcaption>
              <img src={`/media/${detailItem.monitor.candidateImageKey}`} alt={`Navrhovaný obrázok pre ${detailItem.label}`} />
            </figure>
          ) : null}
          {detailItem ? (
            <div className={styles.historyPanel}>
              <AdminActionButton variant="secondary" disabled={reviewHistory?.loading === true}
                onClick={() => void loadMediaHistory(detailItem.monitor.id)}>
                {reviewHistory?.loading ? "Načítavam históriu…" : "Zobraziť históriu rozhodnutí"}
              </AdminActionButton>
              {reviewHistory?.monitorId === detailItem.monitor.id ? (
                reviewHistory.loading ? <p role="status">Načítavam históriu…</p>
                  : reviewHistory.error ? <p role="alert">{reviewHistory.error}</p>
                  : reviewHistory.entries.length ? (
                    <ul aria-label="História rozhodnutí obrázka">
                      {reviewHistory.entries.map((entry) => (
                        <li key={entry.id}>
                          <strong>{entry.action === "accept" ? "Schválené" : "Zamietnuté"}</strong>
                          {" · "}{checkedAt(entry.decided_at)}{" · "}{entry.actor_ref}
                          {entry.reason ? <p>Dôvod: {entry.reason}</p> : null}
                        </li>
                      ))}
                    </ul>
                  ) : <p>Bez predchádzajúcich rozhodnutí.</p>
              ) : null}
            </div>
          ) : null}
        </div>
      </AdminModalDialog>
      {data.availability.status === "PARTIAL" || data.availability.status === "UNAVAILABLE" ? (
        <section className="admin-panel" aria-live="polite">
          <p className="admin-message admin-message--error">
            {data.availability.status === "UNAVAILABLE"
              ? "Kvalitu údajov sa momentálne nepodarilo načítať."
              : "Niektoré časti kvality údajov sú dočasne nedostupné. Dostupné časti zostávajú použiteľné."}
            {data.availability.errorRefs.length ? <> Referencie: <code>{data.availability.errorRefs.join(", ")}</code>.</> : null}
          </p>
          <button type="button" onClick={() => router.refresh()}>Obnoviť údaje</button>
        </section>
      ) : null}

      <section className="admin-stats" aria-label="Kvalita údajov">
        <div><span>Profily s problémom</span><strong>{count(data.summary.profilesWithIssues)}</strong></div>
        <div><span>Bez obrázka</span><strong>{count(data.summary.missingImage)}</strong></div>
        <div><span>Na kontrolu obrázka</span><strong>{count(data.summary.changedMedia)}</strong></div>
        <div><span>Chyba zdroja</span><strong>{count(data.summary.missingMediaSource)}</strong></div>
      </section>

      <section className="admin-panel">
        <form className="admin-toolbar admin-quality-filter-toolbar" action="/admin/kvalita" method="get">
          {activeSection === "media" ? <input type="hidden" name="section" value="media" /> : null}

          {activeSection === "profiles" ? (
            <label className="admin-search">
              <span aria-hidden="true">⌕</span>
              <input
                type="search"
                name="q"
                defaultValue={data.query}
                placeholder="Názov, mesto, okres alebo ID profilu"
              />
            </label>
          ) : null}

          <label className="admin-select-filter">
            <span>Kategória</span>
            <select name="category" defaultValue={data.category}>
              {data.categoryOptions
                .filter((option) => activeSection === "media" || option.value !== "podujatia")
                .map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
            </select>
          </label>

          {activeSection === "profiles" ? (
            <>
              <label className="admin-select-filter">
                <span>Typ problému</span>
                <select name="issue" defaultValue={data.issue}>
                  {data.issueOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="admin-select-filter">
                <span>Nájdené riešenie</span>
                <select name="solution" defaultValue={data.solution}>
                  {data.solutionOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="admin-select-filter">
                <span>Priorita</span>
                <select name="priority" defaultValue={data.priority}>
                  {data.priorityOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="admin-select-filter">
                <span>Stav profilu</span>
                <select name="status" defaultValue={data.profileStatus}>
                  {data.profileStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="admin-select-filter">
                <span>Kraj</span>
                <select name="region" defaultValue={data.region}>
                  <option value="">Všetky kraje</option>
                  {data.regionOptions.map((region) => <option key={region} value={region}>{region}</option>)}
                </select>
              </label>
              <label className="admin-select-filter">
                <span>Okres</span>
                <select name="district" defaultValue={data.district}>
                  <option value="">Všetky okresy</option>
                  {data.districtOptions.map((district) => <option key={district} value={district}>{district}</option>)}
                </select>
              </label>
            </>
          ) : (
            <label className="admin-select-filter">
              <span>Stav obrázka</span>
              <select name="mediaStatus" defaultValue={data.mediaStatus}>
                {data.mediaStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          )}

          <div className="admin-quality-filter-actions">
            <button type="submit">Filtrovať</button>
            {hasActiveFilters ? (
              <Link href={activeSection === "media" ? "/admin/kvalita?section=media" : "/admin/kvalita"}>
                Vyčistiť filtre
              </Link>
            ) : null}
          </div>
        </form>
      </section>

      <div className="admin-quality-tabs-wrap">
        <nav className="admin-quality-tabs" aria-label="Typ kontroly kvality">
          <Link
            href={sectionHref("profiles")}
            className={activeSection === "profiles" ? "is-active" : ""}
            aria-current={activeSection === "profiles" ? "page" : undefined}
          >
            <span>Profily</span>
            <strong>{count(data.summary.profilesWithIssues)}</strong>
            <small>chýbajúce alebo nepotvrdené údaje</small>
          </Link>
          <Link
            href={sectionHref("media")}
            className={activeSection === "media" ? "is-active" : ""}
            aria-current={activeSection === "media" ? "page" : undefined}
          >
            <span>Obrázky</span>
            <strong>{count(data.summary.changedMedia)}</strong>
            <small>na schválenie · {count(data.summary.mediaIssues)} problémov spolu</small>
          </Link>
          <Link href="/admin/nastroje/notion-audit">
            <span>Sync Notion ↔ D1</span>
            <strong>→</strong>
            <small>bezpečná diagnostika, nie automatická oprava</small>
          </Link>
          <Link href="/admin/kvalita/seo">
            <span>SEO audit</span>
            <strong>→</strong>
            <small>publikované canonical entity</small>
          </Link>
        </nav>
        <button
          className="admin-quality-quick-check"
          type="button"
          disabled={busy === "run" || mediaUnavailable || !data.monitorReady}
          onClick={runMediaCheck}
        >
          {busy === "run" ? "Kontrolujem…" : "Skontrolovať teraz"}
        </button>
      </div>

      {activeSection === "profiles" ? (
        <section className="admin-panel admin-quality-panel">
          <div className="admin-quality-section-heading">
            <div>
              <h2>Chýbajúce údaje v profiloch</h2>
              <p>
                Zobrazené sú iba položky, ktoré ešte treba riešiť. Legitímne chýbajúci údaj môžeš uzavrieť priamo v profile.
              </p>
            </div>
          </div>

          {message && <p className="admin-flash" role="status">{message}</p>}
          {suggestionsUnavailable ? (
            <p className="admin-message admin-message--error">
              Návrhy doplnení zo zdrojov sa momentálne nepodarilo načítať. Zoznam profilov zostáva použiteľný.
              {reference(data.sections.suggestions.errorRef)}
            </p>
          ) : null}

          {profilesUnavailable ? (
            <p className="admin-message admin-message--error">
              Profilové údaje sa momentálne nepodarilo načítať. Skús obnoviť údaje.
              {reference(data.sections.profiles.errorRef)}
            </p>
          ) : (
            <>
              <div className="admin-quality-summary-line">
                <span>Spolu {count(data.summary.totalProfiles)}</span>
                <span>S problémom {count(data.summary.profilesWithIssues)}</span>
                <span>Popis {count(data.summary.missingDescription)}</span>
                <span>Telefón {count(data.summary.missingPhone)}</span>
                <span>E-mail {count(data.summary.missingEmail)}</span>
                <span>Web {count(data.summary.missingWebsite)}</span>
                <span>Obrázok {count(data.summary.missingImage)}</span>
                <span>Adresa {count(data.summary.incompleteAddress)}</span>
              </div>
              <p className="admin-help-results">
                Zobrazené problémy {data.profilePagination.from}–{data.profilePagination.to} z {data.profilePagination.totalItems}.
              </p>

              {data.profiles.length ? (
                <div className="admin-quality-profile-list">
                  {data.profiles.map((profile) => (
                    <article className="admin-quality-profile-row" key={profile.id}>
                      <div className="admin-article-main">
                        <div className="admin-article-tags">
                          <span>{profile.category || "Bez kategórie"}</span>
                          <span>{profile.status === "published" ? "Publikované" : "Koncept"}</span>
                          <span>{priorityLabel(profile.priority)}</span>
                        </div>
                        <h2><Link href={profile.href}>{profile.name}</Link></h2>
                        <div className="admin-quality-issue-chips">
                          {profile.issues.map((issue) => <span key={issue.key}>{issue.label}</span>)}
                        </div>
                        {profile.suggestions.length ? (
                          <div className="admin-quality-contact-suggestions" aria-label="Nájdené návrhy doplnení">
                            <div className="admin-quality-contact-suggestions-heading">
                              <strong>Nájdené zo zdrojov</strong>
                              <span>{profile.suggestions.length}</span>
                            </div>
                            {profile.suggestions.map((suggestion) => {
                              const acceptKey = `quality-accept-${suggestion.origin}-${suggestion.suggestionId}-${suggestion.field}`;
                              const rejectKey = `quality-reject-${suggestion.origin}-${suggestion.suggestionId}-${suggestion.field}`;
                              const isBusy = busy === acceptKey || busy === rejectKey;
                              return (
                                <div
                                  className={`admin-quality-contact-suggestion${suggestion.reviewMode === "manual" ? " is-manual" : ""}`}
                                  key={`${suggestion.origin}:${suggestion.suggestionId}:${suggestion.field}`}
                                >
                                  <div>
                                    <span>
                                      {suggestion.label}
                                      {suggestion.reviewMode === "manual" ? " · vyžaduje kontrolu" : ""}
                                    </span>
                                    <strong className={suggestion.field === "description" ? "is-long-value" : undefined}>
                                      {suggestion.proposed}
                                    </strong>
                                    <small>
                                      Zdroj:{" "}
                                      {suggestion.sourceUrl ? (
                                        <a href={suggestion.sourceUrl} target="_blank" rel="noreferrer">
                                          {suggestion.sourceLabel || "Otvoriť zdroj"} ↗
                                        </a>
                                      ) : (suggestion.sourceLabel || "Automatizácia")}
                                      {" · "}nájdené {checkedAt(suggestion.detectedAt)}
                                      {suggestion.note ? <> · {suggestion.note}</> : null}
                                    </small>
                                  </div>
                                  <div className="admin-quality-contact-actions">
                                    {suggestion.reviewMode === "accept" ? (
                                      <button
                                        type="button"
                                        className="is-primary"
                                        disabled={isBusy}
                                        onClick={() => void reviewFieldSuggestion(profile.id, suggestion, "accept")}
                                      >
                                        {busy === acceptKey ? "Preberám…" : "Prevziať"}
                                      </button>
                                    ) : (
                                      <Link className="is-primary" href={profile.href}>
                                        Skontrolovať v profile
                                      </Link>
                                    )}
                                    <button
                                      type="button"
                                      disabled={isBusy}
                                      onClick={() => void reviewFieldSuggestion(profile.id, suggestion, "reject")}
                                    >
                                      {busy === rejectKey ? "Zamietam…" : "Zamietnuť"}
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                      <div className="admin-row-actions">
                        <Link className="admin-row-edit" href={profile.href}>Doplniť údaje</Link>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="admin-empty">
                  <span>✓</span>
                  <h2>Profily sú kompletné</h2>
                  <p>{hasProfileFilters ? "Aktuálnym filtrom nezodpovedá žiadny problémový profil." : "Kontrola nenašla chýbajúce údaje podľa aktuálnych pravidiel."}</p>
                </div>
              )}

              {data.profilePagination.totalPages > 1 && (
                <nav className="admin-quality-pagination" aria-label="Stránkovanie problémov profilov">
                  {data.profilePagination.page > 1 ? (
                    <Link href={pageHref("page", data.profilePagination.page - 1)}>← Predchádzajúca</Link>
                  ) : <span />}
                  <strong>Strana {data.profilePagination.page} z {data.profilePagination.totalPages}</strong>
                  {data.profilePagination.page < data.profilePagination.totalPages ? (
                    <Link href={pageHref("page", data.profilePagination.page + 1)}>Ďalšia →</Link>
                  ) : <span />}
                </nav>
              )}
            </>
          )}
        </section>
      ) : (
        <>
          <section className="admin-panel admin-quality-panel">
            <div className="admin-quality-section-heading admin-quality-section-heading--actions">
              <div>
                <h2>Obrázky na kontrolu</h2>
                <p>
                  Najprv schváľ nové alebo zmenené obrázky. Chyby zdroja zostanú v zozname bez rozbitia rozloženia.
                </p>
              </div>
              <Link className="admin-quality-secondary-link" href={sectionHref("profiles")}>
                Späť na profily
              </Link>
            </div>

            {message && <p className="admin-flash" role={resultTone === "error" ? "alert" : "status"}>{message}</p>}
            {failedItems.length > 0 ? (
              <div className={styles.failedPanel} role="status">
                <strong>Nepodarilo sa spracovať {failedItems.length} položiek</strong>
                <ul>{failedItems.map(({ id, error }) => <li key={id}>ID {id}: {error}</li>)}</ul>
                <p>Neúspešné položky zostanú označené, ak sú ešte na tejto strane.</p>
              </div>
            ) : null}
            {mediaUnavailable && (
              <p className="admin-message admin-message--error">
                Monitoring obrázkov momentálne nie je dostupný. Skús obnoviť údaje.
                {reference(data.sections.media.errorRef)}
              </p>
            )}
          </section>

          <section className="admin-panel admin-quality-panel">
            {mediaUnavailable ? (
              <p className="admin-message admin-message--error">
                Zoznam problémov obrázkov nie je dostupný.
                {reference(data.sections.media.errorRef)}
              </p>
            ) : (
              <>
                <div className="admin-quality-summary-line">
                  <span>Na schválenie {count(data.summary.changedMedia)}</span>
                  <span>Chyby zdroja {count(data.summary.missingMediaSource)}</span>
                  <span>Spolu {count(data.summary.mediaIssues)}</span>
                </div>
                <p className="admin-help-results">
                  Zobrazené {data.mediaPagination.from}–{data.mediaPagination.to} z {data.mediaPagination.totalItems}.
                </p>

                {lookupsUnavailable && data.media.length > 0 && (
                  <p className="admin-message admin-message--error">
                    Názvy niektorých profilov alebo podujatí sa nepodarilo načítať; zobrazené sú bezpečné ID.
                    {reference(data.sections.lookups.errorRef)}
                  </p>
                )}

                {reviewableMediaIds.length ? (
                  <div className={styles.selectAll}>
                    <label>
                      <input type="checkbox" checked={allReviewableSelected}
                        onChange={(event) => setSelectedMedia(event.target.checked
                          ? new Set(reviewableMediaIds) : new Set())} />
                      Označiť všetky obrázky na tejto strane ({reviewableMediaIds.length})
                    </label>
                  </div>
                ) : null}
                {visibleSelectedMedia.size > 0 ? (
                  <AdminBulkActionToolbar selectedCount={visibleSelectedMedia.size}
                    selectionDescription="Výber platí len pre aktuálnu stranu."
                    primaryAction={<AdminActionButton variant="primary" disabled={busy !== null}
                      onClick={() => openMediaDecision("accept", [...visibleSelectedMedia])}>Schváliť označené</AdminActionButton>}
                    destructiveAction={<AdminActionButton variant="destructive" disabled={busy !== null}
                      onClick={() => openMediaDecision("reject", [...visibleSelectedMedia])}>Zamietnuť označené</AdminActionButton>}
                    onClear={() => setSelectedMedia(new Set())} />
                ) : null}

                {data.media.length ? (
                  <div className="admin-quality-media-list">
                    {data.media.map(({ monitor, label, href, category }) => {
                      const hasCandidate = Boolean(monitor.candidateImageKey);
                      const hasCurrent = Boolean(monitor.activeImageKey);
                      return (
                        <article
                          className={`admin-quality-media-card ${styles.reviewCard} ${hasCandidate ? "has-candidate" : "is-source-issue"}`}
                          key={monitor.id}
                        >
                          <div className="admin-quality-media-preview" aria-label={hasCandidate ? `Porovnanie obrázkov – ${label}` : `Stav obrázka – ${label}`}>
                            {hasCurrent && hasCandidate ? (
                              <figure>
                                <span>Aktuálny</span>
                                <img src={`/media/${monitor.activeImageKey}`} alt={`Aktuálny obrázok pre ${label}`} />
                              </figure>
                            ) : null}
                            {hasCandidate ? (
                              <figure>
                                <span>{hasCurrent ? "Nový" : "Nájdený"}</span>
                                <img src={`/media/${monitor.candidateImageKey}`} alt={`Navrhovaný obrázok pre ${label}`} />
                              </figure>
                            ) : (
                              <div className="admin-quality-media-placeholder" aria-hidden="true">!</div>
                            )}
                          </div>

                          <div className="admin-quality-media-content">
                            {hasCandidate ? (
                              <label>
                                <input
                                  type="checkbox"
                                  checked={visibleSelectedMedia.has(monitor.id)}
                                  onChange={(event) => {
                                    setSelectedMedia((current) => {
                                      const next = new Set(current);
                                      if (event.target.checked) next.add(monitor.id);
                                      else next.delete(monitor.id);
                                      return next;
                                    });
                                  }}
                                />{" "}
                                Označiť obrázok
                              </label>
                            ) : null}
                            <div className="admin-article-tags">
                              <span>{data.categoryOptions.find((option) => option.value === category)?.label || (monitor.entityType === "MANAGED_EVENT" ? "Podujatia" : "Profil")}</span>
                              <span className={`admin-quality-status ${mediaStatusTone(monitor.status)}`}>
                                {mediaStatusLabel(monitor.status)}
                              </span>
                            </div>
                            <h2><Link href={href}>{label}</Link></h2>
                            <p className="admin-help-results">
                              Posledná kontrola: {checkedAt(monitor.lastCheckedAt)}
                            </p>

                            {(monitor.sourceImageUrl || monitor.candidateImageUrl) && (
                              <details className="admin-quality-source-details">
                                <summary>Zdroj a technické údaje</summary>
                                {monitor.sourceImageUrl && (
                                  <p>
                                    <strong>Zdroj:</strong>{" "}
                                    <a href={monitor.sourceImageUrl} target="_blank" rel="noreferrer">{monitor.sourceImageUrl}</a>
                                  </p>
                                )}
                                {monitor.candidateImageUrl && monitor.candidateImageUrl !== monitor.sourceImageUrl && (
                                  <p>
                                    <strong>Nový kandidát:</strong>{" "}
                                    <a href={monitor.candidateImageUrl} target="_blank" rel="noreferrer">{monitor.candidateImageUrl}</a>
                                  </p>
                                )}
                              </details>
                            )}
                          </div>

                          <div className={`admin-quality-media-actions ${styles.reviewActions}`}>
                            {hasCandidate ? (
                              <>
                                <AdminActionButton variant="primary" disabled={busy !== null}
                                  aria-label={`Schváliť obrázok – ${label}`}
                                  onClick={() => openMediaDecision("accept", [monitor.id])}>Schváliť obrázok</AdminActionButton>
                                <AdminActionButton variant="destructive" disabled={busy !== null}
                                  aria-label={`Zamietnuť obrázok – ${label}`}
                                  onClick={() => openMediaDecision("reject", [monitor.id])}>Zamietnuť</AdminActionButton>
                                <AdminActionButton variant="secondary" disabled={busy !== null}
                                  aria-label={`Detailne porovnať obrázky – ${label}`}
                                  onClick={() => { setReviewHistory(null); setDetailId(monitor.id); }}>Porovnať detailne</AdminActionButton>
                              </>
                            ) : null}
                            <Link href={href}>Otvoriť {monitor.entityType === "MANAGED_EVENT" ? "podujatie" : "profil"}</Link>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="admin-empty">
                    <span>✓</span>
                    <h2>Bez problémov</h2>
                    <p>Žiadny sledovaný obrázok momentálne nevyžaduje zásah.</p>
                  </div>
                )}

                {data.mediaPagination.totalPages > 1 && (
                  <nav className="admin-quality-pagination" aria-label="Stránkovanie problémov obrázkov">
                    {data.mediaPagination.page > 1 ? (
                      <Link href={pageHref("mediaPage", data.mediaPagination.page - 1)}>← Predchádzajúca</Link>
                    ) : <span />}
                    <strong>Strana {data.mediaPagination.page} z {data.mediaPagination.totalPages}</strong>
                    {data.mediaPagination.page < data.mediaPagination.totalPages ? (
                      <Link href={pageHref("mediaPage", data.mediaPagination.page + 1)}>Ďalšia →</Link>
                    ) : <span />}
                  </nav>
                )}
              </>
            )}
          </section>
        </>
      )}
    </>
  );
}
