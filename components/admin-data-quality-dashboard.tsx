"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DataQualityDashboard } from "@/lib/data-quality-store";

function mediaStatusLabel(status: string) {
  if (status === "CHANGED") return "Obrázok sa na zdroji zmenil";
  if (status === "CANDIDATE") return "Nájdený nový obrázok";
  if (status === "MISSING") return "Zdroj obrázka chýba";
  if (status === "ERROR") return "Kontrola zdroja zlyhala";
  return status;
}

function checkedAt(value: string | null) {
  if (!value) return "Ešte nekontrolované";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("sk-SK", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

export function AdminDataQualityDashboard({ data }: { data: DataQualityDashboard }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

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

  async function acceptCandidate(id: number) {
    setBusy(`accept-${id}`);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/data-quality/media/${id}/accept`, { method: "POST" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Obrázok sa nepodarilo potvrdiť.");
      setMessage("Nový obrázok bol uložený na Psipedii a prepojený s profilom/podujatím.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Obrázok sa nepodarilo potvrdiť.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <section className="admin-stats" aria-label="Kvalita údajov">
        <div><span>Profily s problémom</span><strong>{data.summary.profilesWithIssues}</strong></div>
        <div><span>Bez obrázka</span><strong>{data.summary.missingImage}</strong></div>
        <div><span>Zmena obrázka</span><strong>{data.summary.changedMedia}</strong></div>
        <div><span>Nefunkčný zdroj</span><strong>{data.summary.missingMediaSource}</strong></div>
      </section>

      <section className="admin-panel">
        <div className="admin-heading-actions" style={{ justifyContent: "space-between", width: "100%" }}>
          <div>
            <h2>Automatická kontrola obrázkov</h2>
            <p className="admin-help-results">
              Zdroj sa kontroluje najviac raz za 24 hodín. Verejný obrázok zostáva uložený v R2, kým nový kandidát nepotvrdíš.
            </p>
          </div>
          <button className="admin-primary-action" type="button" disabled={busy === "run" || !data.monitorReady} onClick={runMediaCheck}>
            {busy === "run" ? "Kontrolujem…" : "Skontrolovať teraz"}
          </button>
        </div>
        {message && <p className="admin-flash" role="status">{message}</p>}
        {!data.monitorReady && <p className="admin-message admin-message--error">Migrácia monitoringu obrázkov ešte nie je nasadená.</p>}
      </section>

      <section className="admin-panel">
        <h2>Chýbajúce údaje v profiloch</h2>
        <p className="admin-help-results">
          Popis {data.summary.missingDescription} · Telefón {data.summary.missingPhone} · E-mail {data.summary.missingEmail} · Web {data.summary.missingWebsite} · Adresa {data.summary.incompleteAddress}
        </p>
        {data.profiles.length ? (
          <div className="admin-article-list">
            {data.profiles.map((profile) => (
              <article className="admin-article-row" key={profile.id}>
                <div className="admin-article-main">
                  <div className="admin-article-tags">
                    <span>{profile.category}</span>
                    <span>{profile.status === "published" ? "Publikované" : "Koncept"}</span>
                  </div>
                  <h2><Link href={profile.href}>{profile.name}</Link></h2>
                  <p>{profile.issues.map((issue) => issue.label).join(" · ")}</p>
                </div>
                <div className="admin-row-actions">
                  <Link className="admin-row-edit" href={profile.href}>Doplniť údaje</Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="admin-empty"><span>✓</span><h2>Profily sú kompletné</h2><p>Aktuálne nevidím chýbajúce údaje.</p></div>
        )}
      </section>

      <section className="admin-panel">
        <h2>Zmeny a chyby obrázkov</h2>
        <p className="admin-help-results">Aktívne položky: <strong>{data.summary.mediaIssues}</strong></p>
        {data.media.length ? (
          <div className="admin-article-list">
            {data.media.map(({ monitor, label, href }) => (
              <article className="admin-article-row" key={monitor.id}>
                {monitor.candidateImageKey ? (
                  <div className="admin-directory-thumb" style={{ overflow: "hidden" }}>
                    <img src={`/media/${monitor.candidateImageKey}`} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                  </div>
                ) : null}
                <div className="admin-article-main">
                  <div className="admin-article-tags">
                    <span>{monitor.entityType === "MANAGED_EVENT" ? "Podujatie" : "Profil"}</span>
                    <span>{mediaStatusLabel(monitor.status)}</span>
                  </div>
                  <h2><Link href={href}>{label}</Link></h2>
                  <p>{monitor.lastError || "Zdrojový obrázok vyžaduje kontrolu."}</p>
                  <p className="admin-help-results">Posledná kontrola: {checkedAt(monitor.lastCheckedAt)}</p>
                  {monitor.sourceImageUrl && <p className="admin-help-results">Zdroj: <a href={monitor.sourceImageUrl} target="_blank" rel="noreferrer">{monitor.sourceImageUrl}</a></p>}
                  {monitor.candidateImageUrl && monitor.candidateImageUrl !== monitor.sourceImageUrl && <p className="admin-help-results">Nový kandidát: <a href={monitor.candidateImageUrl} target="_blank" rel="noreferrer">{monitor.candidateImageUrl}</a></p>}
                </div>
                <div className="admin-row-actions">
                  <Link className="admin-row-edit" href={href}>Otvoriť</Link>
                  {monitor.candidateImageKey && (
                    <button type="button" disabled={busy === `accept-${monitor.id}`} onClick={() => acceptCandidate(monitor.id)}>
                      {busy === `accept-${monitor.id}` ? "Ukladám…" : "Použiť nový obrázok"}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="admin-empty"><span>✓</span><h2>Bez problémov</h2><p>Žiadny sledovaný obrázok momentálne nevyžaduje zásah.</p></div>
        )}
      </section>
    </>
  );
}
