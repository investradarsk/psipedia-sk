"use client";

import { useId, useState } from "react";

export type BreedFciAccordionSection = {
  title: string;
  items: Array<{ label: string; paragraphs: string[] }>;
};

export function BreedFciAccordion({ sections }: { sections: BreedFciAccordionSection[] }) {
  const baseId = useId();
  const [openSections, setOpenSections] = useState<Set<number>>(() => new Set());

  function toggle(index: number) {
    setOpenSections((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  }

  return <div className="breed-fci-accordion">
    {sections.map((section, index) => {
      const open = openSections.has(index);
      const panelId = `${baseId}-panel-${index}`;
      const buttonId = `${baseId}-button-${index}`;
      return <section className="breed-fci-section" key={section.title}>
        <h3>
          <button type="button" id={buttonId} aria-expanded={open} aria-controls={panelId} onClick={() => toggle(index)}>
            <span>{section.title}</span><span className="breed-fci-toggle" aria-hidden="true">{open ? "−" : "+"}</span>
          </button>
        </h3>
        <div id={panelId} role="region" aria-labelledby={buttonId} hidden={!open}>
          {section.items.map((item) => <div className="breed-fci-item" key={item.label}>
            {section.items.length > 1 && <h4>{item.label}</h4>}
            {item.paragraphs.map((paragraph, paragraphIndex) => <p key={`${item.label}-${paragraphIndex}`}>{paragraph}</p>)}
          </div>)}
        </div>
      </section>;
    })}
  </div>;
}
