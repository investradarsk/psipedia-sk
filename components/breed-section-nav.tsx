import { SectionTabs } from "@/components/page-system";
import styles from "./breed-section-nav.module.css";

export type BreedSectionNavItem = {
  id: string;
  label: string;
};

/** Plain anchors: no scroll tracking, sticky overlap or animated active state. */
export function BreedSectionNav({ items }: { items: BreedSectionNavItem[] }) {
  if (!items.length) return null;
  return (
    <SectionTabs label="Navigácia v profile plemena" className={styles.nav}>
      {items.map((item) => (
        <a className="section-tab" href={`#${item.id}`} key={item.id}>
          {item.label}
        </a>
      ))}
    </SectionTabs>
  );
}
