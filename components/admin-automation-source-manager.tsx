"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AutomationSourceAdminRow, AutomationSourceCandidateRow } from "@/lib/data-automation-source-store";
import type { AutomationDiscoveryRoot } from "@/lib/data-automation-discovery-store";
import { automationConnectorTypes, automationEntityTypes } from "@/lib/data-automation";
import styles from "./admin-operations-ux.module.css";

const defaultConfig = "{}";

async function jsonMutation(url: string, method: "POST" | "PUT", body: unknown) {
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(payload.error || "Operácia zlyhala.");
  return payload;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("sk-SK", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Bratislava",
  }).format(date);
}

function sourceState(source: AutomationSourceAdminRow) {
  if (source.lastRunStatus === "FAILED" || source.lastErrorCode) return { label: "Problém", className: styles.badgeDanger };
  if (source.reviewStatus === "PENDING") return { label: "Čaká na schválenie", className: styles.badgeWarning };
  if (!source.enabled) return { label: "Vypnutý", className: styles.badgeWarning };
  if (!source.lastRunStatus) return { label: "Ešte nekontrolovaný", className: styles.badgeWarning };
  return { label: "V poriadku", className: styles.badgeGood };
}

export function AdminAutomationSourceManager({
  sources,
  candidates,
  discoveryRoots,
}: {
  sources: AutomationSourceAdminRow[];
  candidates: AutomationSourceCandidateRow[];
  discoveryRoots: AutomationDiscoveryRoot[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    sourceKey: "",
    label: "",
    entityType: "EVENT",
    connectorType: "CONTROLLED_HTML",
    sourceUrl: "",
    cadenceMinutes: "1440",
    throttleMs: "1000",
    timeoutMs: "8000",
    retryMaxAttempts: "2",
    retryBackoffMs: "1000",
    maxRecordsPerRun: "100",
    config: defaultConfig,
  });

  const newCandidates = candidates.filter((candidate) => candidate.reviewStatus === "NEW");
  const reviewedCandidates = candidates.filter((candidate) => candidate.reviewStatus !== "NEW");
  const attentionSources = sources.filter((source) =>
    source.reviewStatus === "PENDING"
    || source.lastRunStatus === "FAILED"
    || Boolean(source.lastErrorCode)
  );
  const stableSources = sources.filter((source) => !attentionSources.some((item) => item.id === source.id));

  function field(name: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function createSource(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await jsonMutation("/api/admin/automation-sources", "POST", form);
      setMessage("Zdroj bol vytvorený. Je vypnutý a čaká na tvoje schválenie.");
      setForm((current) => ({ ...current, sourceKey: "", label: "", sourceUrl: "", config: defaultConfig }));
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Zdroj sa nepodarilo vytvoriť.");
    } finally {
      setBusy(false);
    }
  }

  async function candidateAction(id: number, action: "approve" | "reject" | "suppress") {
    setBusy(true);
    setMessage("");
    try {
      await jsonMutation("/api/admin/automation-source-candidates/" + id, "PUT", { action, suppressedDays: 30 });
      setMessage(action === "approve"
        ? "Návrh bol prijatý. Vznikol vypnutý zdroj, ktorý ešte treba skontrolovať a schváliť."
        : action === "reject"
          ? "Návrh bol zamietnutý."
          : "Návrh bol odložený na 30 dní.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Návrh sa nepodarilo spracovať.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {message && <p className="admin-flash" role="status">{message}</p>}

      <section id="kandidati" className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>Čaká na tvoje rozhodnutie</h2>
            <p>Automatizácia našla nové možné zdroje. Tu iba rozhodneš, či ich chceš zaradiť medzi zdroje Psipedie.</p>
          </div>
          <span className={styles.sectionCount}>{newCandidates.length}</span>
        </div>

        {newCandidates.length ? (
          <div className={styles.itemList}>
            {newCandidates.map((candidate) => (
              <div className={styles.itemCard} key={candidate.id}>
                <div className={styles.itemMain}>
                  <div className={styles.itemTitle}>
                    <strong>{candidate.label}</strong>
                    <span className={[styles.badge, styles.badgeWarning].join(" ")}>Nový návrh</span>
                  </div>
                  <p>{candidate.reason}</p>
                  <p><a href={candidate.sourceUrl} target="_blank" rel="noreferrer">Otvoriť nájdený web ↗</a></p>
                </div>
                <div className={styles.actionStack}>
                  <button className="is-primary" type="button" disabled={busy} onClick={() => void candidateAction(candidate.id, "approve")}>Pridať medzi zdroje</button>
                  <button className="is-danger" type="button" disabled={busy} onClick={() => void candidateAction(candidate.id, "reject")}>Zamietnuť</button>
                  <button type="button" disabled={busy} onClick={() => void candidateAction(candidate.id, "suppress")}>Odložiť 30 dní</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>Momentálne tu nie je žiadny nový zdroj, ktorý by od teba vyžadoval rozhodnutie.</div>
        )}

        {reviewedCandidates.length > 0 && (
          <details className={styles.advanced}>
            <summary>Vybavené návrhy ({reviewedCandidates.length})</summary>
            <div className={styles.advancedBody}>
              <div className={styles.techGrid}>
                {reviewedCandidates.map((candidate) => (
                  <div className={styles.techRow} key={candidate.id}>
                    <strong>{candidate.label}</strong>
                    <span>{candidate.reviewStatus}</span>
                    <span>{formatDate(candidate.lastDetectedAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          </details>
        )}
      </section>

      <section id="zdroje" className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>Monitorované zdroje</h2>
            <p>Najprv sú zobrazené zdroje, ktoré potrebujú zásah. Ostatné môžeš nechať bežať bez kontroly.</p>
          </div>
          <span className={styles.sectionCount}>{sources.length}</span>
        </div>

        {attentionSources.length > 0 && (
          <>
            <div className={styles.itemList}>
              {attentionSources.map((source) => {
                const state = sourceState(source);
                return (
                  <div className={styles.itemCard} key={source.id}>
                    <div className={styles.itemMain}>
                      <div className={styles.itemTitle}>
                        <strong>{source.label}</strong>
                        <span className={[styles.badge, state.className].join(" ")}>{state.label}</span>
                      </div>
                      <p>{source.lastErrorCode ? "Posledná chyba: " + source.lastErrorCode : "Ďalšia kontrola: " + formatDate(source.nextCheckAt)}</p>
                    </div>
                    <Link className={styles.itemAction} href={"/admin/automatizacie/zdroje/" + source.id}>Skontrolovať</Link>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {stableSources.length > 0 && (
          <details className={styles.advanced} open={attentionSources.length === 0}>
            <summary>Ostatné zdroje ({stableSources.length})</summary>
            <div className={styles.advancedBody}>
              <div className={styles.itemList}>
                {stableSources.map((source) => {
                  const state = sourceState(source);
                  return (
                    <div className={styles.itemCard} key={source.id}>
                      <div className={styles.itemMain}>
                        <div className={styles.itemTitle}>
                          <strong>{source.label}</strong>
                          <span className={[styles.badge, state.className].join(" ")}>{state.label}</span>
                        </div>
                        <p>Ďalšia kontrola: {formatDate(source.nextCheckAt)}</p>
                      </div>
                      <Link className={styles.itemAction} href={"/admin/automatizacie/zdroje/" + source.id}>Otvoriť</Link>
                    </div>
                  );
                })}
              </div>
            </div>
          </details>
        )}

        {!sources.length && <div className={styles.empty}>Zatiaľ nie je nastavený žiadny monitorovaný zdroj.</div>}
      </section>

      <section id="discovery" className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>Automatické hľadanie nových zdrojov</h2>
            <p>Toto sú schválené miesta, ktoré systém občas prejde a hľadá v nich ďalšie relevantné weby. Nemusíš ich bežne riešiť.</p>
          </div>
          <span className={styles.sectionCount}>{discoveryRoots.length}</span>
        </div>

        {discoveryRoots.length ? (
          <div className={styles.itemList}>
            {discoveryRoots.map((root) => (
              <div className={styles.itemCard} key={root.id}>
                <div className={styles.itemMain}>
                  <div className={styles.itemTitle}>
                    <strong>{root.label}</strong>
                    <span className={[styles.badge, root.lastErrorCode ? styles.badgeDanger : root.enabled ? styles.badgeGood : styles.badgeWarning].join(" ")}>
                      {root.lastErrorCode ? "Problém" : root.enabled ? "Aktívne" : "Vypnuté"}
                    </span>
                  </div>
                  <p>Posledná kontrola: {formatDate(root.lastCheckedAt)} · ďalšia: {formatDate(root.nextCheckAt)}</p>
                </div>
                {root.sourceUrl ? <a className={styles.itemAction} href={root.sourceUrl} target="_blank" rel="noreferrer">Otvoriť zoznam ↗</a> : null}
              </div>
            ))}
          </div>
        ) : <div className={styles.empty}>Nie je nastavené žiadne automatické hľadanie zdrojov.</div>}

        <details className={styles.advanced}>
          <summary>Technické údaje discovery</summary>
          <div className={styles.advancedBody}>
            <div className={styles.techGrid}>
              {discoveryRoots.map((root) => (
                <div className={styles.techRow} key={"root-" + root.id}>
                  <strong>{root.rootKey}</strong>
                  <span>{root.discoveryType} · {root.entityType} · {root.reviewStatus}</span>
                  <span>last success {formatDate(root.lastSuccessAt)} · cadence {root.cadenceMinutes} min · error {root.lastErrorCode ?? "—"}</span>
                </div>
              ))}
            </div>
          </div>
        </details>
      </section>

      <details className={styles.advanced}>
        <summary>Pokročilé: pridať zdroj ručne</summary>
        <div className={styles.advancedBody}>
          <p>Táto časť je určená pre technické nastavenie nového zdroja. Nový zdroj zostane vypnutý, kým ho výslovne neschváliš.</p>
          <form onSubmit={createSource} className="admin-form" aria-label="Pridať automation source">
            <div className="admin-form-grid">
              <label className="admin-field"><span>Source key</span><input required value={form.sourceKey} onChange={(e) => field("sourceKey", e.target.value)} placeholder="napr. klub-events" /></label>
              <label className="admin-field"><span>Názov</span><input required value={form.label} onChange={(e) => field("label", e.target.value)} /></label>
              <label className="admin-field"><span>Entity type</span><select value={form.entityType} onChange={(e) => field("entityType", e.target.value)}>{automationEntityTypes.map((value) => <option key={value}>{value}</option>)}</select></label>
              <label className="admin-field"><span>Connector</span><select value={form.connectorType} onChange={(e) => field("connectorType", e.target.value)}>{automationConnectorTypes.map((value) => <option key={value}>{value}</option>)}</select></label>
              <label className="admin-field admin-field-wide"><span>Source URL</span><input type="url" value={form.sourceUrl} onChange={(e) => field("sourceUrl", e.target.value)} placeholder="https://…" /></label>
              <label className="admin-field"><span>Cadence (min)</span><input type="number" min={60} max={43200} value={form.cadenceMinutes} onChange={(e) => field("cadenceMinutes", e.target.value)} /></label>
              <label className="admin-field"><span>Timeout (ms)</span><input type="number" min={1000} max={30000} value={form.timeoutMs} onChange={(e) => field("timeoutMs", e.target.value)} /></label>
              <label className="admin-field"><span>Throttle (ms)</span><input type="number" min={0} max={60000} value={form.throttleMs} onChange={(e) => field("throttleMs", e.target.value)} /></label>
              <label className="admin-field"><span>Max records/run</span><input type="number" min={1} max={500} value={form.maxRecordsPerRun} onChange={(e) => field("maxRecordsPerRun", e.target.value)} /></label>
              <label className="admin-field"><span>Retry pokusy</span><input type="number" min={0} max={4} value={form.retryMaxAttempts} onChange={(e) => field("retryMaxAttempts", e.target.value)} /></label>
              <label className="admin-field"><span>Retry backoff (ms)</span><input type="number" min={100} max={30000} value={form.retryBackoffMs} onChange={(e) => field("retryBackoffMs", e.target.value)} /></label>
            </div>
            <label className="admin-field"><span>Mapping / config JSON</span><textarea rows={8} value={form.config} onChange={(e) => field("config", e.target.value)} spellCheck={false} /></label>
            <div className="admin-form-actions"><button className="is-primary" type="submit" disabled={busy}>Vytvoriť vypnutý zdroj</button></div>
          </form>
        </div>
      </details>
    </>
  );
}
