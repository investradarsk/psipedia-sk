"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  type ArticleFeedback,
  type ArticleFeedbackStatus,
} from "@/lib/article-feedback-store";
import styles from "./admin-article-feedback-dashboard.module.css";
import { AdminInlineRowActions, AdminInlineCellSelect } from "@/components/admin-inline-edit-controls";

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

function statusClass(status: ArticleFeedbackStatus) {
  if (status === "new") return styles.statusNew;
  if (status === "reviewing") return styles.statusReviewing;
  if (status === "resolved") return styles.statusResolved;
  return styles.statusDismissed;
}

export function AdminArticleFeedbackDashboard({ feedback: initialFeedback }: { feedback: ArticleFeedback[] }) {
  const router = useRouter();
  const [feedback, setFeedback] = useState(initialFeedback);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [rowDraft, setRowDraft] = useState<{ id: number; status: ArticleFeedbackStatus; initialStatus: ArticleFeedbackStatus } | null>(null);

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
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Stav hodnotenia sa nepodarilo zmeniť.");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  function beginRow(item: ArticleFeedback) {
    if (busyId !== null || item.helpful) return;
    setRowDraft({ id: item.id, status: item.status, initialStatus: item.status });
  }
  async function saveRow(item: ArticleFeedback) {
    const draft = rowDraft;
    if (!draft || draft.id !== item.id || busyId !== null) return;
    if (item.status !== draft.initialStatus) {
      setMessage("Hodnotenie sa medzičasom zmenilo. Obnov zoznam.");
      return;
    }
    if (draft.status === item.status || await updateStatus(item, draft.status)) setRowDraft(null);
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
                <header className={styles.header}>
                  <span>{item.helpful ? "👍 Áno" : "👎 Nie"}</span>
                  {!item.helpful && <span className={`${styles.status} ${statusClass(item.status)}`}>{statusLabels[item.status]}</span>}
                  <time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time>
                </header>
                <h2>{item.articleTitle}</h2>
                {item.missingText ? <blockquote>{item.missingText}</blockquote> : !item.helpful ? <p className="admin-feedback-empty-note">Bez doplňujúcej odpovede.</p> : null}
                <Link href={item.articlePath} target="_blank" rel="noreferrer">Otvoriť článok ↗</Link>
                {!item.helpful && (
                  <footer className={styles.actions}>
                    {rowDraft?.id === item.id && <AdminInlineCellSelect
                      label={"Stav hodnotenia článku " + item.articleTitle}
                      value={rowDraft.status} disabled={busyId !== null}
                      options={Object.entries(statusLabels).map(([value,label]) => ({ value, label }))}
                      onChange={status => setRowDraft(prev => prev ? {...prev, status: status as ArticleFeedbackStatus} : null)}
                    />}
                    <AdminInlineRowActions editing={rowDraft?.id === item.id}
                      busy={busyId === item.id} disabled={busyId !== null || Boolean(rowDraft && rowDraft.id !== item.id)}
                      onEdit={() => beginRow(item)}
                      onSave={() => void saveRow(item)}
                      onCancel={() => { if (busyId === null) setRowDraft(null); }}
                    />
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
