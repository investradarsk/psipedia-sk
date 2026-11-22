import type { ReactNode } from "react";
import { PublicLandingSectionHeading } from "./public-landing-layout";
import styles from "./public-category-section.module.css";

/** One category heading + navigation presentation for Help, Services and Events. */
export function PublicCategorySection({
  eyebrow, title, description, id, children,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  id: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.section} aria-labelledby={id} data-public-category-section>
      <PublicLandingSectionHeading
        eyebrow={eyebrow}
        title={title}
        description={description}
        id={id}
      />
      <div className={styles.navigation} data-public-category-navigation>
        {children}
      </div>
    </section>
  );
}
