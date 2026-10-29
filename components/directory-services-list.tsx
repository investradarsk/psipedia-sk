"use client";

import { useState } from "react";
import styles from "./directory-profile-detail.module.css";

/** One services presentation for all public directory profile categories. */
export function DirectoryServicesList({ services }: { services: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? services : services.slice(0, 10);
  if (!services.length) return null;
  // First ten are five-and-five; after expansion balance every extra item.
  const midpoint = expanded ? Math.ceil(visible.length / 2) : Math.min(5, Math.ceil(visible.length / 2));
  const columns = [visible.slice(0, midpoint), visible.slice(midpoint)];
  return (
    <div data-directory-services-count={services.length}>
      <div className={styles.servicesColumns}>
        {columns.map((items, index) => items.length > 0 ? (
          <ul className={styles.servicesList} key={index}>
            {items.map((service, i) => <li key={service + ":" + i}>{service}</li>)}
          </ul>
        ) : null)}
      </div>
      {services.length > 10 ? (
        <button
          className={styles.servicesExpand}
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Zobraziť menej" : `Zobraziť všetky služby (${services.length})`}
        </button>
      ) : null}
    </div>
  );
}
