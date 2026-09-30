"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
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
  const [message, setMessage] = useState("");
  const [selectedMedia, setSelectedMedia] = useState<Set<number>>(new Set());
  const activeSection = searchParams.get("section") === "media" ? "media" : "profiles";
  const hasProfileFilters = data.category !== "all"
    || data.issue !== "all"
    || data.profileStatus !== "all"
    || data.priority !== "all"
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

  async function bulkMediaAction(action: "accept" | "reject", ids = [...visibleSelectedMedia]) {
    if (!ids.length) return;
    setBusy(`bulk-${action}`);
    setMessage("");
    try {
      const response = await fetch("/api/admin/data-quality/media/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ids }),
      });
      const result = await response.json() as {
        error?: string;
        requested?: number;
        updated?: number;
        failed?: Array<{ id: number; error: string }>;
      };
      if (!response.ok && !result.updated) throw new Error(result.error || "Hromadná akcia sa nepodarila.");
      const failed = result.failed?.length ?? 0;
      setMessage(action === "accept"
        ? `Schválené obrázky: ${result.updated ?? 0} z ${result.requested ?? ids.length}.${failed ? ` Zlyhalo: ${failed}.` : ""}`
        : `Zamietnuté obrázky: ${result.updated ?? 0} z ${result.requested ?? ids.length}. Pre zamietnuté položky sa hneď hľadá ďalší vhodný kandidát.${failed ? ` Zlyhalo: ${failed}.` : ""}`);
      setSelectedMedia(new Set());
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Hromadná akcia sa nepodarila.");
    } finally {
      setBusy(null);
    }
  }

  async function acceptCandidate(id: number) {
    setBusy(`accept-${id}`);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/data-quality/media/${id}/accept`, { method: "POST" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Obrázok sa nepodarilo potvrdiť.");
      setMessage("Obrázok bol schválený, uložený na Psipedii a prepojený s profilom alebo podujatím.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Obrázok sa nepodarilo potvrdiť.");
    } finally {
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

            {message && <p className="admin-flash" role="status">{message}</p>}
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
                  <div className="admin-quality-summary-line" data-admin-quality-bulk>
                    <label>
                      <input
                        type="checkbox"
                        checked={allReviewableSelected}
                        onChange={(event) => {
                          setSelectedMedia(event.target.checked ? new Set(reviewableMediaIds) : new Set());
                        }}
                      />{" "}
                      Označiť všetky obrázky na tejto strane
                    </label>
                    <span>Označené {visibleSelectedMedia.size}</span>
                    <button
                      type="button"
                      disabled={!visibleSelectedMedia.size || busy !== null}
                      onClick={() => void bulkMediaAction("accept")}
                    >
                      {busy === "bulk-accept" ? "Schvaľujem…" : "Schváliť označené"}
                    </button>
                    <button
                      type="button"
                      disabled={!visibleSelectedMedia.size || busy !== null}
                      onClick={() => void bulkMediaAction("reject")}
                    >
                      {busy === "bulk-reject" ? "Zamietam…" : "Zamietnuť a hľadať iný"}
                    </button>
                  </div>
                ) : null}

                {data.media.length ? (
                  <div className="admin-quality-media-list">
                    {data.media.map(({ monitor, label, href, category }) => {
                      const hasCandidate = Boolean(monitor.candidateImageKey);
                      const hasCurrent = Boolean(monitor.activeImageKey);
                      return (
                        <article
                          className={`admin-quality-media-card ${hasCandidate ? "has-candidate" : "is-source-issue"}`}
                          key={monitor.id}
                        >
                          <div className="admin-quality-media-preview" aria-label={hasCandidate ? "Porovnanie obrázkov" : "Stav obrázka"}>
                            {hasCurrent && hasCandidate ? (
                              <figure>
                                <span>Aktuálny</span>
                                <img src={`/media/${monitor.activeImageKey}`} alt="" />
                              </figure>
                            ) : null}
                            {hasCandidate ? (
                              <figure>
                                <span>{hasCurrent ? "Nový" : "Nájdený"}</span>
                                <img src={`/media/${monitor.candidateImageKey}`} alt="" />
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

                          <div className="admin-quality-media-actions">
                            {hasCandidate && (
                              <>
                                <button
                                  className="is-primary"
                                  type="button"
                                  disabled={busy !== null}
                                  onClick={() => acceptCandidate(monitor.id)}
                                >
                                  {busy === `accept-${monitor.id}` ? "Ukladám…" : "Schváliť obrázok"}
                                </button>
                                <button
                                  type="button"
                                  disabled={busy !== null}
                                  onClick={() => void bulkMediaAction("reject", [monitor.id])}
                                >
                                  Zamietnuť · hľadať iný
                                </button>
                              </>
                            )}
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
