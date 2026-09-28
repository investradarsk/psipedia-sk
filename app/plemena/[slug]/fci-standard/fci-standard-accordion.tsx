"use client";

import { useMemo, useState } from "react";
import styles from "./fci-standard.module.css";

export type FciAccordionFact = { label: string; value: string };
export type FciAccordionItem = {
  label?: string;
  paragraphs?: string[];
  facts?: FciAccordionFact[];
};
export type FciAccordionGroup = {
  id: string;
  title: string;
  items: FciAccordionItem[];
};

type Props = { groups: FciAccordionGroup[] };

export function FciStandardAccordions({ groups }: Props) {
  const firstGroupId = groups[0]?.id ?? "";
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set(firstGroupId ? [firstGroupId] : []));
  const allIds = useMemo(() => groups.map((group) => group.id), [groups]);

  function setGroupOpen(id: string, open: boolean) {
    setOpenIds((current) => {
      const next = new Set(current);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function openAndScroll(id: string) {
    setGroupOpen(id, true);
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  return (
    <div className={styles.standardLayout}>
      <aside className={styles.standardSidebar} aria-label="Obsah FCI štandardu" data-testid="fci-sidebar">
        <p>Obsah štandardu</p>
        <nav>
          {groups.map((group, index) => (
            <button type="button" key={group.id} onClick={() => openAndScroll(group.id)}>
              <span>{String(index + 1).padStart(2, "0")}</span>{group.title}
            </button>
          ))}
        </nav>
      </aside>

      <div className={styles.standardMain}>
        <div className={styles.standardControls} aria-label="Ovládanie FCI štandardu">
          <button type="button" onClick={() => setOpenIds(new Set(allIds))} data-testid="fci-expand-all">
            Rozbaliť celý štandard
          </button>
          <span aria-hidden="true">·</span>
          <button type="button" onClick={() => setOpenIds(new Set())} data-testid="fci-collapse-all">
            Zbaliť všetko
          </button>
        </div>

        <div className={styles.standardAccordionList}>
          {groups.map((group, index) => {
            const open = openIds.has(group.id);
            const triggerId = `${group.id}-trigger`;
            const panelId = `${group.id}-panel`;
            return (
              <section
                key={group.id}
                id={group.id}
                className={`${styles.standardAccordion}${open ? ` ${styles.standardAccordionOpen}` : ""}`}
                data-fci-group={group.id}
              >
                <h2>
                  <button
                    type="button"
                    id={triggerId}
                    aria-expanded={open}
                    aria-controls={panelId}
                    data-fci-trigger={group.id}
                    onClick={() => setGroupOpen(group.id, !open)}
                  >
                    <span className={styles.standardAccordionIndex}>{String(index + 1).padStart(2, "0")}</span>
                    <span className={styles.standardAccordionTitle}>{group.title}</span>
                    <span className={styles.standardAccordionIcon} aria-hidden="true">{open ? "−" : "+"}</span>
                  </button>
                </h2>

                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={triggerId}
                  className={styles.standardAccordionPanel}
                  hidden={!open}
                >
                  <div className={styles.standardAccordionBody}>
                    {group.items.map((item, itemIndex) => (
                      <section
                        className={styles.standardSubsection}
                        key={`${group.id}-${item.label ?? itemIndex}`}
                        data-fci-subsection
                      >
                        {item.label ? <h3>{item.label}</h3> : null}
                        {item.facts?.length ? (
                          <dl className={styles.measurementFacts}>
                            {item.facts.map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}
                          </dl>
                        ) : null}
                        {item.paragraphs?.length ? (
                          <div className={styles.standardProse}>
                            {item.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                          </div>
                        ) : null}
                      </section>
                    ))}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
