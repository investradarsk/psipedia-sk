import Link from "next/link";
import { allDirectoryCategories } from "@/lib/directory";
import styles from "./admin-directory-module-nav.module.css";

const modules = [
  { key: "services", label: "Služby pre psov", href: "/admin/sluzby-pre-psov" },
  { key: "help", label: "Pomoc psom", href: "/admin/pomoc-psom" },
  { key: "events", label: "Podujatia", href: "/admin/podujatia" },
] as const;

export function AdminDirectoryModuleNav({ active }: { active: "services" | "help" | "events" }) {
  return <nav className={styles.modules} aria-label="Sekcie adresára">
    {modules.map((module) => <Link key={module.key} href={module.href} aria-current={active === module.key ? "page" : undefined}>{module.label}</Link>)}
  </nav>;
}

export function AdminDirectoryCategoryNav({ selected }: { selected: string }) {
  return <section className={styles.categoryWorkspace} aria-label="Kategórie a nástroje služieb pre psov">
    <div className={styles.categoryHeader}><h2>Kategórie služieb</h2><span>Vyber kategóriu, potom pracuj s tabuľkou profilov.</span></div>
    <nav className={styles.categories} aria-label="Kategórie profilov">
      <Link href="/admin/sluzby-pre-psov" aria-current={!selected ? "page" : undefined}>Všetky profily</Link>
      {allDirectoryCategories.map((category) => <Link
        key={category.slug}
        href={"/admin/sluzby-pre-psov?category=" + category.slug}
        aria-current={selected === category.slug ? "page" : undefined}
      >{category.icon} {category.label}</Link>)}
    </nav>
    <div className={styles.tools}>
      <div><strong>Správa katalógu a technické nástroje</strong><span>Oddelené od zoznamu profilov, bez zásahu do existujúcej synchronizácie.</span></div>
      <Link href="/admin/sluzby-pre-psov/katalog">Katalóg služieb a vlastností</Link>
      <Link href="/admin/adresar/navrhy">Návrhy úprav</Link>
    </div>
  </section>;
}
