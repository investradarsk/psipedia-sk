import Link from "next/link";
import type { InternalDiscoveryLink } from "@/lib/internal-discovery";
import styles from "./related-entity-links.module.css";

export function RelatedEntityLinks({
  links,
  label,
}: {
  links: readonly InternalDiscoveryLink[];
  label: string;
}) {
  if (!links.length) return null;

  return (
    <ul className={styles.list} aria-label={label} data-internal-discovery>
      {links.map((link) => (
        <li key={link.href}>
          <Link href={link.href}>
            <span>
              <strong>{link.label}</strong>
              {link.description ? <small>{link.description}</small> : null}
            </span>
            <span aria-hidden="true">→</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
