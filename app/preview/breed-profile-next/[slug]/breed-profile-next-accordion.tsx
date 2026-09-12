"use client";

import { useId, useState, type ReactNode } from "react";
import styles from "./breed-profile-next.module.css";

type Props = {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  defaultOpen?: boolean;
};

export function BreedProfileNextAccordion({ title, eyebrow, children, defaultOpen = false }: Props) {
  const reactId = useId();
  const id = `breed-profile-next-${reactId.replace(/:/g, "")}`;
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={`${styles.accordion}${open ? ` ${styles.accordionOpen}` : ""}`}>
      <h3 className={styles.accordionHeading}>
        <button
          type="button"
          className={styles.accordionButton}
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          id={`${id}-trigger`}
          onClick={() => setOpen((value) => !value)}
        >
          <span>
            {eyebrow ? <small>{eyebrow}</small> : null}
            <strong>{title}</strong>
          </span>
          <span className={styles.accordionIcon} aria-hidden="true">{open ? "−" : "+"}</span>
        </button>
      </h3>
      <div
        id={`${id}-panel`}
        role="region"
        aria-labelledby={`${id}-trigger`}
        className={styles.accordionPanel}
        hidden={!open}
      >
        <div className={styles.accordionContent}>{children}</div>
      </div>
    </section>
  );
}
