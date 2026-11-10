import type { ReactNode } from "react";
import styles from "./breed-profile.module.css";

type Props = {
  title: string;
  children: ReactNode;
  /** Retained for callers; details are permanently visible by design. */
  defaultOpen?: boolean;
};

/** Shared open editorial section for every breed; no interactive disclosure. */
export function BreedProfileAccordion({ title, children }: Props) {
  return (
    <section className={styles.accordion} data-breed-profile-section={title}>
      <h3 className={styles.accordionHeading}>
        <strong>{title}</strong>
      </h3>
      <div className={styles.accordionPanel}>
        <div className={styles.accordionContent}>{children}</div>
      </div>
    </section>
  );
}
