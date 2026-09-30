import Link from "next/link";
import styles from "./admin-section-hub.module.css";

export type AdminSectionHubItem = {
  label: string;
  description: string;
  href: string;
  icon?: string;
};

export function AdminSectionHub({ items }: { items: readonly AdminSectionHubItem[] }) {
  return (
    <section className={styles.grid} aria-label="Kategórie">
      {items.map((item) => (
        <Link className={styles.card} href={item.href} key={item.href}>
          <span className={styles.icon} aria-hidden="true">{item.icon ?? "🐾"}</span>
          <div>
            <h2>{item.label}</h2>
            <p>{item.description}</p>
          </div>
          <strong>Otvoriť →</strong>
        </Link>
      ))}
    </section>
  );
}
