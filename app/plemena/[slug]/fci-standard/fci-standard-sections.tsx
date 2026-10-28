import styles from "./fci-standard.module.css";

export type FciStandardFact = { label: string; value: string };
export type FciStandardItem = {
  label?: string;
  paragraphs?: string[];
  facts?: FciStandardFact[];
};
export type FciStandardGroup = {
  id: string;
  title: string;
  items: FciStandardItem[];
};

/**
 * One permanently visible, server-rendered FCI reference for all breeds.
 * Anchor links preserve fast desktop navigation without hiding expert content.
 */
export function FciStandardSections({ groups }: { groups: FciStandardGroup[] }) {
  return (
    <div className={styles.standardLayout}>
      <aside className={styles.standardSidebar} aria-label="Obsah FCI štandardu" data-testid="fci-sidebar">
        <p>Obsah štandardu</p>
        <nav aria-label="Prejsť na časť FCI štandardu">
          {groups.map((group, index) => (
            <a key={group.id} href={`#${group.id}`}>
              <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              {group.title}
            </a>
          ))}
        </nav>
      </aside>

      <div className={styles.standardMain}>
        <div className={styles.standardSectionList}>
          {groups.map((group, index) => (
            <section id={group.id} key={group.id} className={styles.standardSection} data-fci-group={group.id}>
              <h2 className={styles.standardSectionHeading}>
                <span className={styles.standardSectionIndex} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <span className={styles.standardSectionTitle}>{group.title}</span>
              </h2>
              <div className={styles.standardSectionBody}>
                {group.items.map((item, itemIndex) => {
                  // Do not repeat a heading when the group and its only subtopic
                  // have the same name (e.g. "Chyby" > "Chyby").
                  const repeatedHeading = item.label?.trim().toLocaleLowerCase("sk")
                    === group.title.trim().toLocaleLowerCase("sk");
                  return (
                    <div className={styles.standardSubsection} key={`${group.id}-${item.label ?? itemIndex}`} data-fci-subsection>
                      {item.label && !repeatedHeading ? <h3>{item.label}</h3> : null}
                      {item.facts?.length ? (
                        <dl className={styles.measurementFacts}>
                          {item.facts.map((fact) => (
                            <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>
                          ))}
                        </dl>
                      ) : null}
                      {item.paragraphs?.length ? (
                        <div className={styles.standardProse}>
                          {item.paragraphs.map((paragraph, paragraphIndex) => (
                            <p key={paragraphIndex}>{paragraph}</p>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
