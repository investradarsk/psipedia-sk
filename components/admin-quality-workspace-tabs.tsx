import Link from "next/link";
import { qualityTabs, type QualityTab } from "@/lib/admin-quality-workspace";
import styles from "./admin-quality-workspace-tabs.module.css";

export function AdminQualityWorkspaceTabs({ active }: { active: QualityTab }) {
  return (
    <nav className={styles.tabs} aria-label="Pracovisko Kvalita údajov" data-admin-quality-tabs>
      {qualityTabs.map((section) => (
        <Link key={section.id} href={section.href} prefetch={false}
          className={active === section.id ? `${styles.tab} ${styles.active}` : styles.tab}
          aria-current={active === section.id ? "page" : undefined}>
          {section.label}
        </Link>
      ))}
    </nav>
  );
}
