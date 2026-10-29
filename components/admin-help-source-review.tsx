"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { HelpSourceCheckRow, HelpSourceState } from "@/lib/help-source-daily-check";
import styles from "./admin-help-source-review.module.css";

const stateLabel: Record<HelpSourceState, string> = {
  UNCHECKED: "Neskontrolované",
  ACTIVE_SIGNAL: "Zdroj naznačuje aktuálnosť",
  POSSIBLE_CHANGE: "Možná zmena stavu",
  UNCERTAIN: "Nedá sa potvrdiť",
  UNAVAILABLE: "Nedostupný zdroj",
  NO_SOURCE: "Bez zdrojového odkazu",
};

function sourceHref(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function AdminHelpSourceReview({ items }: { items: HelpSourceCheckRow[] }) {
  const router = useRouter();
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const isReviewDue = (item: HelpSourceCheckRow) => item.source_state !== "ACTIVE_SIGNAL"
    && (!item.last_reviewed_at || Date.now() - Date.parse(item.last_reviewed_at) >= 7 * 86_400_000);
  const urgent = items.filter(isReviewDue);
  const done = items.filter((item) => !isReviewDue(item));

  async function confirmCurrent(item: HelpSourceCheckRow) {
    const key = item.entity_type + ":" + item.entity_id;
    setPending(key);
    setError("");
    try {
      const response = await fetch(
        "/api/admin/help-source-checks/" + item.entity_type + "/" + item.entity_id,
        { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "CONFIRM_ACTIVE" }), cache: "no-store" },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || "Overenie sa nepodarilo uložiť.");
      }
      router.refresh();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Overenie sa nepodarilo uložiť.");
    } finally {
      setPending("");
    }
  }

  function cards(values: HelpSourceCheckRow[]) {
    return values.map((item) => {
      const key = item.entity_type + ":" + item.entity_id;
      const href = sourceHref(item.source_url);
      const editor = item.entity_type === "ADOPTION"
        ? "/admin/adopcie/" + item.entity_id
        : "/admin/stratene-najdene/" + item.entity_id;
      const checked = item.last_checked_at && !Number.isNaN(Date.parse(item.last_checked_at))
        ? new Intl.DateTimeFormat("sk-SK", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Bratislava" }).format(new Date(item.last_checked_at))
        : "Ešte nekontrolované";
      return (
        <article className={styles.card} key={key}>
          <div className={styles.head}>
            <div>
              <span className={styles.category}>{item.entity_type === "ADOPTION" ? "Adopcia" : "Stratené / nájdené"}</span>
              <h3>{item.title}</h3>
            </div>
            <span className={item.source_state === "ACTIVE_SIGNAL" ? styles.good : styles.warning}>
              {stateLabel[item.source_state]}
            </span>
          </div>
          <p>{item.evidence}</p>
          <p className={styles.meta}>Posledná kontrola: {checked}</p>
          {item.last_reviewed_at && <p className={styles.meta}>Ručne overené: {new Intl.DateTimeFormat("sk-SK", { dateStyle: "medium" }).format(new Date(item.last_reviewed_at))}</p>}
          <div className={styles.actions}>
            {href && <a href={href} target="_blank" rel="noopener noreferrer nofollow">Otvoriť zdroj</a>}
            <Link href={editor}>Otvoriť profil</Link>
            {item.source_state !== "ACTIVE_SIGNAL" && (
              <button type="button" disabled={pending === key}
                onClick={() => void confirmCurrent(item)}>
                {pending === key ? "Ukladám…" : "Potvrdzujem, že je stále aktuálny"}
              </button>
            )}
          </div>
        </article>
      );
    });
  }

  return (
    <div className={styles.layout}>
      <div className="admin-stats" aria-label="Stav kontroly zdrojov">
        <div><span>Vyžaduje ručnú kontrolu</span><strong>{urgent.length}</strong></div>
        <div><span>Bez ručnej kontroly</span><strong>{done.length}</strong></div>
      </div>
      <p className={styles.explainer}>
        Automatická kontrola nikdy nemení stav adopcie ani pátrania. Potvrdenie používaj až po
        skutočnom overení pôvodného zdroja; pri adopcii sa uloží aj dátum posledného overenia.
      </p>
      {error && <p className="admin-flash" role="alert">{error}</p>}
      <section aria-label="Potrebuje overenie">
        <h2>Na ručnú kontrolu ({urgent.length})</h2>
        {urgent.length ? <div className={styles.cards}>{cards(urgent)}</div> : <p>V načítanej dávke nie je žiadny nevybavený prípad.</p>}
      </section>
      <section aria-label="Ostatné výsledky">
        <h2>Už skontrolované ({done.length})</h2>
        {done.length ? <div className={styles.cards}>{cards(done)}</div> : <p>Zatiaľ žiadne.</p>}
      </section>
    </div>
  );
}
