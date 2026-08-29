import Link from "next/link";
import type { ArticleFeedback } from "@/lib/article-feedback-store";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("sk-SK", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Bratislava" }).format(new Date(value));
}

export function AdminArticleFeedbackDashboard({ feedback }: { feedback: ArticleFeedback[] }) {
  const helpful = feedback.filter((item) => item.helpful).length;
  const notHelpful = feedback.length - helpful;
  const withComment = feedback.filter((item) => !item.helpful && item.missingText).length;
  const helpfulRate = feedback.length ? Math.round((helpful / feedback.length) * 100) : 0;

  return (
    <>
      <section className="admin-stats" aria-label="Súhrn hodnotení článkov">
        <div><span>Všetky hodnotenia</span><strong>{feedback.length}</strong></div>
        <div><span>Užitočné</span><strong>{helpfulRate} %</strong></div>
        <div><span>Odpovede s podnetom</span><strong>{withComment}</strong></div>
      </section>
      <section className="admin-panel admin-feedback-panel">
        <div className="admin-feedback-summary"><strong>👍 {helpful} Áno</strong><strong>👎 {notHelpful} Nie</strong></div>
        {feedback.length ? (
          <div className="admin-feedback-list">
            {feedback.map((item) => (
              <article id={`hodnotenie-${item.id}`} className={item.helpful ? "is-helpful" : "is-not-helpful"} key={item.id}>
                <header><span>{item.helpful ? "👍 Áno" : "👎 Nie"}</span><time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time></header>
                <h2>{item.articleTitle}</h2>
                {item.missingText ? <blockquote>{item.missingText}</blockquote> : !item.helpful ? <p className="admin-feedback-empty-note">Bez doplňujúcej odpovede.</p> : null}
                <Link href={item.articlePath} target="_blank" rel="noreferrer">Otvoriť článok ↗</Link>
              </article>
            ))}
          </div>
        ) : <div className="admin-empty"><span>👍</span><h2>Zatiaľ bez hodnotení</h2><p>Odpovede čitateľov sa po prvom hodnotení zobrazia tu.</p></div>}
      </section>
    </>
  );
}
