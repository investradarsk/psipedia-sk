import Link from "next/link";
import {
  adminAttentionPriorities,
  adminAttentionPriorityLabels,
  adminAttentionSourceLabels,
  adminAttentionSourceTypes,
  type AdminAttentionFilters,
  type AdminAttentionItem,
  type AdminAttentionPriority,
  type AdminAttentionSourceType,
} from "@/lib/admin-attention-queue";
import styles from "./admin-attention-queue.module.css";

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Neznámy čas";
  return new Intl.DateTimeFormat("sk-SK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Bratislava",
  }).format(date);
}

function formatAge(days: number) {
  if (days <= 0) return "dnes";
  if (days === 1) return "1 deň";
  if (days >= 2 && days <= 4) return `${days} dni`;
  return `${days} dní`;
}

function priorityClass(priority: AdminAttentionPriority) {
  if (priority === "HIGH") return styles.high;
  if (priority === "LOW") return styles.low;
  return styles.medium;
}

export function AdminAttentionQueue({
  items,
  allItems,
  filters,
}: {
  items: AdminAttentionItem[];
  allItems: AdminAttentionItem[];
  filters: AdminAttentionFilters;
}) {
  const priorityCounts = Object.fromEntries(adminAttentionPriorities.map((priority) => [
    priority,
    allItems.filter((item) => item.priority === priority).length,
  ])) as Record<AdminAttentionPriority, number>;
  const sourceCounts = Object.fromEntries(adminAttentionSourceTypes.map((sourceType) => [
    sourceType,
    allItems.filter((item) => item.sourceType === sourceType).length,
  ])) as Record<AdminAttentionSourceType, number>;

  return (
    <div className={styles.workspace} data-testid="admin-attention-queue">
      <section className="admin-stats" aria-label="Súhrn položiek vyžadujúcich pozornosť">
        <div><span>Spolu</span><strong>{allItems.length}</strong></div>
        <div><span>Vysoká priorita</span><strong>{priorityCounts.HIGH}</strong></div>
        <div><span>Stredná priorita</span><strong>{priorityCounts.MEDIUM}</strong></div>
        <div><span>Nízka priorita</span><strong>{priorityCounts.LOW}</strong></div>
      </section>

      <ul className={styles.sourceCounts} aria-label="Počty podľa zdroja">
        {adminAttentionSourceTypes.map((sourceType) => (
          <li key={sourceType}><span>{adminAttentionSourceLabels[sourceType]}</span><strong>{sourceCounts[sourceType]}</strong></li>
        ))}
      </ul>

      <form className={styles.filters} method="get" aria-label="Filtrovať attention queue">
        <label>
          <span>Zdroj</span>
          <select name="source" defaultValue={filters.sourceType ?? "all"}>
            <option value="all">Všetky zdroje</option>
            {adminAttentionSourceTypes.map((sourceType) => <option key={sourceType} value={sourceType}>{adminAttentionSourceLabels[sourceType]}</option>)}
          </select>
        </label>
        <label>
          <span>Priorita</span>
          <select name="priority" defaultValue={filters.priority ?? "all"}>
            <option value="all">Všetky priority</option>
            {adminAttentionPriorities.map((priority) => <option key={priority} value={priority}>{adminAttentionPriorityLabels[priority]}</option>)}
          </select>
        </label>
        <button type="submit">Filtrovať</button>
      </form>

      {items.length ? (
        <section className={styles.list} aria-label="Položky vyžadujúce pozornosť">
          {items.map((item) => (
            <article className={styles.card} key={item.key} data-source={item.sourceType} data-priority={item.priority}>
              <header>
                <div className={styles.kicker}>
                  <span className={`${styles.priority} ${priorityClass(item.priority)}`}>{adminAttentionPriorityLabels[item.priority]}</span>
                  <span>{adminAttentionSourceLabels[item.sourceType]}</span>
                </div>
                <h2>{item.title}</h2>
                <div className={styles.meta}><span>Stav: {item.status}</span><span>ID: {item.sourceId}</span></div>
              </header>
              <div className={styles.reason}>
                <strong>Dôvod</strong>
                <p>{item.reason}</p>
              </div>
              <div className={styles.details}>
                <strong>{formatAge(item.ageDays)}</strong>
                <div className={styles.meta}><span title={formatTimestamp(item.relevantAt)}>Od {formatTimestamp(item.relevantAt)}</span></div>
                {item.metadata?.map((entry) => <div className={styles.meta} key={`${entry.label}:${entry.value}`}><span>{entry.label}: {entry.value}</span></div>)}
              </div>
              <Link className={styles.open} href={item.targetHref}>Otvoriť</Link>
            </article>
          ))}
        </section>
      ) : (
        <div className={styles.empty}>
          <h2>Žiadne položky pre zvolený filter</h2>
          <p>Attention Queue je odvodený read-only pohľad; nič sa tu automaticky nemení ani neoznačuje ako vybavené.</p>
        </div>
      )}
    </div>
  );
}
