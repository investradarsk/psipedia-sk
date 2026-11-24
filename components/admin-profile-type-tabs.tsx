import Link from "next/link";
import type { ReactNode } from "react";
import { adminProfileTypes, type AdminProfileType } from "@/lib/admin-profile-workspace";
import styles from "./admin-profile-type-tabs.module.css";

export function AdminProfileTypeTabs({ active }: { active: AdminProfileType }) {
  return (
    <nav aria-label="Typy profilov" className={styles.tabs} data-admin-profile-types>
      {adminProfileTypes.map((item) => (
        <Link key={item.id} href={item.href} prefetch={false} aria-current={item.id === active ? "page" : undefined}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function AdminProfileActions({ active, children }: { active: AdminProfileType; children?: ReactNode }) {
  const item = adminProfileTypes.find((entry) => entry.id === active) ?? adminProfileTypes[0];
  return (
    <>
      {children}
      <Link className="admin-primary-action" href={item.createHref} prefetch={false} data-admin-profile-create>
        {item.createLabel}
      </Link>
    </>
  );
}
