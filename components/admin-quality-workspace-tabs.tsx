import Link from "next/link";
import styles from "./admin-quality-workspace-tabs.module.css";

type QualityTab = "findings" | "missing" | "seo" | "links";

const sections: ReadonlyArray<{ id: QualityTab; label: string; href: string }> = [
  { id: "findings", label: "Nálezy na schválenie", href: "/admin/kvalita" },
  { id: "missing", label: "Chýbajúce polia", href: "/admin/kvalita/prehlad" },
  { id: "seo", label: "SEO audit", href: "/admin/kvalita/seo" },
  { id: "links", label: "Kontrola odkazov", href: "/admin/kontrola-odkazov" },
];

export function AdminQualityWorkspaceTabs({ active }: { active: QualityTab }) {
  return (
    <nav className={styles.tabs} aria-label="Pracoviská kvality a technických kontrol">
      {sections.map((section) => (
        <Link
          key={section.id}
          href={section.href}
          prefetch={false}
          className={active === section.id ? `${styles.tab} ${styles.active}` : styles.tab}
          aria-current={active === section.id ? "page" : undefined}
        >
          {section.label}
        </Link>
      ))}
    </nav>
  );
}
