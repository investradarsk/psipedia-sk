"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  type ArticleFeedback,
  type ArticleFeedbackStatus,
} from "@/lib/article-feedback-store";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("sk-SK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Bratislava",
  }).format(new Date(value));
}

const statusLabels: Record<ArticleFeedbackStatus, string> = {
  new: "Nové",
  reviewing: "Rieši sa",
  resolved: "Vyriešené",
  dismissed: "Ignorované",
};

export function AdminArticleFeedbackDashboard({ feedback: initialFeedback }: { feedback: ArticleFeedback[] }) {
  const router = useRouter();
  const [feedback, setFeedback] = useState(initialFeedback);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  const helpful = feedback.filter((item) => item.helpful).length;
  const notHelpful = feedback.length - helpful;
  const withComment = feedback.filter((item) => !item.helpful && item.missingText).length;
  const helpfulRate = feedback.length ? Math.round((helpful / feedback.length) * 100) : 0;
  const active = feedback.filter((item) => !item.helpful && (item.status === "new" || item.status === "reviewing")).length;

  async function updateStatus(item: ArticleFeedback, status: ArticleFeedbackStatus) {
    setBusyId(item.id);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/article-feedback/${item.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const payload = await response.json() as { feedback?: ArticleFeedback; error?: string };
      if (!response.ok || !payload.feedback) {
        throw new Error(payload.error || "Stav hodnotenia sa nepodarilo zmeniť.");
      }
      setFeedback((current) => current.map((entry) => entry.id === item.id ? payload.feedback as ArticleFeedback : entry));
      setMessage(`Hodnotenie je označené ako „${statusLabels[status]}“.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Stav hodnotenia sa nepodarilo zmeniť.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <section className="admin-stats" aria-label="Súhrn hodnotení článkov">
        <div><span>Všetky hodnotenia</span><strong>{feedback.length}</strong></div>
        <div><span>Užitočné</span><strong>{helpfulRate} %</strong></div>
        <div><span>Aktívne podnety</span><strong>{active}</strong></div>
        <div><span>Odpovede s podnetom</span><strong>{withComment}</strong></div>
      </section>
      <section className="admin-panel admin-feedback-panel">
        <div className="admin-feedback-summary"><strong>👍 {helpful} Áno</strong><strong>👎 {notHelpful} Nie</strong></div>
        {message && <p className="admin-flash" role="status">{message}</p>}
        {feedback.length ? (
          <div className="admin-feedback-list">
            {feedback.map((item) => (
              <article id={`hodnotenie-${item.id}`} className={item.helpful ? "is-helpful" : "is-not-helpful"} key={item.id}>
                <header>
                  <span>{item.helpful ? "👍 Áno" : "👎 Nie"}</span>
                  {!item.helpful && <span className={`admin-inquiry-status is-${item.status}`}>{statusLabels[item.status]}</span>}
                  <time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time>
                </header>
                <h2>{item.articleTitle}</h2>
                {item.missingText ? <blockquote>{item.missingText}</blockquote> : !item.helpful ? <p className="admin-feedback-empty-note">Bez doplňujúcej odpovede.</p> : null}
                <Link href={item.articlePath} target="_blank" rel="noreferrer">Otvoriť článok ↗</Link>
                {!item.helpful && (
                  <footer>
                    {item.status !== "new" && <button type="button" disabled={busyId === item.id} onClick={() => void updateStatus(item, "new")}>Nové</button>}
                    {item.status !== "reviewing" && <button type="button" disabled={busyId === item.id} onClick={() => void updateStatus(item, "reviewing")}>Rieši sa</button>}
                    {item.status !== "resolved" && <button className="is-primary" type="button" disabled={busyId === item.id} onClick={() => void updateStatus(item, "resolved")}>Vyriešené</button>}
                    {item.status !== "dismissed" && <button type="button" disabled={busyId === item.id} onClick={() => void updateStatus(item, "dismissed")}>Ignorovať</button>}
                  </footer>
                )}
              </article>
            ))}
          </div>
        ) : <div className="admin-empty"><span>👍</span><h2>Zatiaľ bez hodnotení</h2><p>Odpovede čitateľov sa po prvom hodnotení zobrazia tu.</p></div>}
      </section>
    </>
  );
}
