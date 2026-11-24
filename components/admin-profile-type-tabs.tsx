import Link from "next/link";
import styles from "./admin-profile-type-tabs.module.css";

const types = [
  { id: "services", label: "Služby a prevádzky", href: "/admin/adresar" },
  { id: "adopcia", label: "Adopcie", href: "/admin/pomoc-psom?category=adopcia" },
  { id: "stratene-a-najdene", label: "Stratené a nájdené", href: "/admin/pomoc-psom?category=stratene-a-najdene" },
  { id: "organizacie", label: "Organizácie", href: "/admin/pomoc-psom?category=organizacie" },
  { id: "ostatna-pomoc", label: "Ostatné profily pomoci", href: "/admin/pomoc-psom?category=ostatna-pomoc" },
] as const;

export function AdminProfileTypeTabs({ active }: { active: string }) {
  const selected = active === "utulky" ? "organizacie"
    : types.some((item) => item.id === active) ? active : "ostatna-pomoc";
  return (
    <nav aria-label="Typy profilov" className={styles.tabs} data-admin-profile-types>
      {types.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          prefetch={false}
          aria-current={item.id === selected ? "page" : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
