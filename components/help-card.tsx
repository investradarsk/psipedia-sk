import Link from "next/link";
import { ArrowIcon } from "@/components/icons";
import {
  formatHelpAmount,
  formatHelpDate,
  getHelpCategory,
  helpCaseHref,
  helpProgress,
  type HelpCase,
} from "@/lib/help";

export function HelpCard({ item }: { item: HelpCase }) {
  const category = getHelpCategory(item.category);
  const progress = helpProgress(item);
  return (
    <article className={`help-card${item.urgent && !item.resolved ? " is-urgent" : ""}${item.resolved ? " is-resolved" : ""}`}>
      <Link className="help-card-media" href={helpCaseHref(item)} aria-label={`Otvoriť ${item.title}`}>
        {item.imageUrl ? <img src={item.imageUrl} alt={item.dogName ? `${item.dogName} – ${item.title}` : item.title} /> : <span aria-hidden="true">{category?.icon ?? "🐾"}</span>}
        <div>{item.resolved ? <b className="is-resolved">Vybavené</b> : item.urgent ? <b className="is-urgent">Urgentné</b> : null}</div>
      </Link>
      <div className="help-card-body">
        <div className="help-card-tags"><span>{category?.singular}</span>{item.verified && <b>✓ Overené</b>}</div>
        <h3><Link href={helpCaseHref(item)}>{item.title}</Link></h3>
        <p>{item.excerpt}</p>
        <div className="help-card-location"><span aria-hidden="true">📍</span><span>{item.city} · {item.region}</span></div>
        {(item.dogName || item.breed || item.ageNote) && <p className="help-card-dog">{[item.dogName, item.breed, item.ageNote].filter(Boolean).join(" · ")}</p>}
        {progress !== null && <div className="help-card-progress"><div><span style={{ width: `${progress}%` }} /></div><p><strong>{formatHelpAmount(item.raisedAmount ?? 0)}</strong> z {formatHelpAmount(item.goalAmount)} · {progress} %</p></div>}
        {item.deadlineDate && !item.resolved && <small className="help-card-deadline">Termín: {formatHelpDate(item.deadlineDate)}</small>}
        <Link className="text-link" href={helpCaseHref(item)}>{item.resolved ? "Pozrieť výsledok" : "Detail a možnosti pomoci"} <ArrowIcon size={18} /></Link>
      </div>
    </article>
  );
}
