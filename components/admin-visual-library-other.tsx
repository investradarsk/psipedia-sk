"use client";

import { useState } from "react";
import type { VisualLibraryExample, VisualExampleCategory } from "@/lib/visual-library-example-types";
import styles from "./admin-visual-library.module.css";

export function AdminVisualLibraryOther({
  category,
  examples,
}: {
  category: VisualExampleCategory;
  examples: readonly VisualLibraryExample[];
}) {
  const choices = examples.filter((item) => item.category === category);
  const [selectedId, setSelectedId] = useState("");
  const chosen = choices.find((item) => item.id === selectedId) ?? choices[0];

  return (
    <div className={styles.workspace}>
      <div className={styles.catalog} aria-label="Zoznam vizuálnych komponentov">
        <strong>Vyber prvok</strong>
        <div className={styles.catalogItems}>
          {choices.map((item) => (
            <button type="button" key={item.id} className={styles.catalogItem}
              aria-pressed={item.id === chosen?.id}
              onClick={() => setSelectedId(item.id)}>
              <span>{item.label}</span>
              <small>{item.uses.length} {item.uses.length === 1 ? "overené umiestnenie" : "overené umiestnenia"}</small>
            </button>
          ))}
          {!choices.length && <p>Pre túto kategóriu zatiaľ nemáme spoľahlivo overený náhľad. Neuvádzame vymyslené umiestnenia.</p>}
        </div>
      </div>

      {chosen && (
        <article className={styles.details} key={chosen.id}>
          <div className={styles.detailHead}>
            <div><span>Skutočný komponent Psipedie</span><h3>{chosen.label}</h3></div>
            <span className={styles.readOnly}>Iba na čítanie</span>
          </div>
          <div className={category === "hero" ? styles.heroPreview : styles.preview}>
            <div className={styles.previewComponent}>{chosen.preview}</div>
          </div>
          <p className={styles.explanation}>{chosen.explanation}</p>
          <div className={styles.usageHead}>
            <div>
              <h4>Kde sa používa</h4>
              <p>Odkazy vedú na reálne overené verejné stránky.</p>
            </div>
            <strong>{chosen.uses.length} umiestnení</strong>
          </div>
          <ul className={styles.usages}>
            {chosen.uses.map((use) => (
              <li key={use.url + use.anchorId}>
                <div>
                  <strong>{use.label}</strong>
                  <small>{use.placement}</small>
                  <code>{use.url}{use.anchorId ? "#" + use.anchorId : ""}</code>
                  {use.note ? <small>{use.note}</small> : null}
                </div>
                <a href={use.anchorId ? use.url + "#" + use.anchorId : use.url}
                  target="_blank" rel="noopener noreferrer">Otvoriť umiestnenie ↗</a>
              </li>
            ))}
          </ul>
          <p className={styles.nextStep}>Zmeny farieb a textov zatiaľ nie sú povolené. Najprv dokončíme audit variantov a kontrolu dopadu na ďalšie stránky.</p>
        </article>
      )}
    </div>
  );
}
