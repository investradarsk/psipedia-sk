"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AdminActionButton,
  AdminDrawer,
  AdminHelpText,
} from "@/components/admin-interaction-system";
import type {
  ManagedPortalSection,
  ManagedPortalSectionArticleCountResult,
} from "@/lib/section-store";
import type { PortalSubpage } from "@/lib/portal";
import styles from "./admin-section-editor.module.css";

function lines(value?: string[]) {
  return value?.join("\n") ?? "";
}

function fromLines(value: string) {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

function serviceLines(value?: { label: string; href: string }[]) {
  return value?.map((item) => `${item.label} | ${item.href}`).join("\n") ?? "";
}

function fromServiceLines(value: string) {
  return value.split("\n").map((item) => {
    const [label, ...href] = item.split("|");
    return { label: label.trim(), href: href.join("|").trim() };
  }).filter((item) => item.label && item.href);
}

function formattedUpdatedAt(value?: string) {
  if (!value) return "nezistené";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "nezistené";
  return new Intl.DateTimeFormat("sk-SK", { dateStyle: "medium" }).format(date);
}

type SettingsTarget = { sectionSlug: string; subIndex: number } | null;

export function AdminSectionEditor({
  initialSections,
  articleCounts,
}: {
  initialSections: ManagedPortalSection[];
  articleCounts: ManagedPortalSectionArticleCountResult;
}) {
  const [sections, setSections] = useState(initialSections);
  const [open, setOpen] = useState<string | null>(initialSections[0]?.slug ?? null);
  const [query, setQuery] = useState("");
  const [settingsTarget, setSettingsTarget] = useState<SettingsTarget>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const visibleSections = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("sk-SK");
    if (!needle) return sections;
    return sections.filter((section) =>
      [section.label, section.slug, section.description, ...section.subpages.flatMap((subpage) => [subpage.label, subpage.slug])]
        .join(" ")
        .toLocaleLowerCase("sk-SK")
        .includes(needle),
    );
  }, [query, sections]);

  const settingsSection = settingsTarget ? sections.find((section) => section.slug === settingsTarget.sectionSlug) : null;
  const settingsSubpage = settingsSection && settingsTarget ? settingsSection.subpages[settingsTarget.subIndex] : null;

  function update(slug: string, patch: Partial<ManagedPortalSection>) {
    setSections((current) => current.map((section) => section.slug === slug ? { ...section, ...patch } : section));
    setMessage("");
    setError("");
  }

  function updateSubpage(sectionSlug: string, index: number, patch: Partial<PortalSubpage>) {
    setSections((current) => current.map((section) => section.slug === sectionSlug
      ? { ...section, subpages: section.subpages.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) }
      : section));
    setMessage("");
    setError("");
  }

  function move(index: number, direction: -1 | 1) {
    setSections((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((section, position) => ({ ...section, position }));
    });
  }

  function addSubpage(slug: string) {
    setSections((current) => current.map((section) => section.slug === slug
      ? { ...section, subpages: [...section.subpages, { slug: "nova-podsekcia", label: "Nová podsekcia", description: "" }] }
      : section));
  }

  function removeSubpage(slug: string, index: number) {
    const section = sections.find((item) => item.slug === slug);
    const target = section?.subpages[index];
    if (!target || !window.confirm(`Odstrániť podsekciu „${target.label}“ z tejto sekcie? Zmena sa uloží až po kliknutí na Uložiť sekcie.`)) return;
    setSections((current) => current.map((item) => item.slug === slug
      ? { ...item, subpages: item.subpages.filter((_, itemIndex) => itemIndex !== index) }
      : item));
  }

  function moveSubpage(slug: string, index: number, direction: -1 | 1) {
    setSections((current) => current.map((section) => {
      if (section.slug !== slug) return section;
      const target = index + direction;
      if (target < 0 || target >= section.subpages.length) return section;
      const subpages = [...section.subpages];
      [subpages[index], subpages[target]] = [subpages[target], subpages[index]];
      return { ...section, subpages };
    }));
  }

  async function save() {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/sections", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sections }),
      });
      const data = await response.json() as { sections?: ManagedPortalSection[]; error?: string };
      if (!response.ok || !data.sections) throw new Error(data.error || "Sekcie sa nepodarilo uložiť.");
      setSections(data.sections);
      setMessage("Sekcie sú uložené. Verejný web používa nové texty, viditeľnosť aj poradie.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Sekcie sa nepodarilo uložiť.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.workspace} data-testid="admin-section-management">
      <div className={styles.toolbar}>
        <label className={styles.search}>
          <span>Hľadať sekciu alebo podsekciu</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Napr. Šteniatka, zdravie, socializácia…"
          />
        </label>
        <div className={styles.contractNote}>
          <strong>Hierarchia:</strong> hlavná sekcia → podsekcie/kategórie.
          <span>Poradie a viditeľnosť sa premietajú na verejný web.</span>
        </div>
      </div>

      <div className={styles.list}>
        {visibleSections.map((section) => {
          const index = sections.findIndex((item) => item.slug === section.slug);
          const counts = articleCounts.counts[section.slug];
          const articleCountText = !section.articleEnabled
            ? "Články sa tu nespravujú"
            : articleCounts.available
              ? `${counts?.total ?? 0} článkov`
              : "Počet článkov nedostupný";
          const directAdminHref = section.slug === "steniatka" ? "/admin/steniatka" : "/admin";

          return (
            <article className={styles.sectionCard} key={section.slug}>
              <header className={styles.sectionRow}>
                <button
                  type="button"
                  className={styles.sectionToggle}
                  aria-expanded={open === section.slug}
                  aria-controls={`section-editor-${section.slug}`}
                  onClick={() => setOpen(open === section.slug ? null : section.slug)}
                >
                  <span className={styles.icon} aria-hidden="true">{section.icon}</span>
                  <span className={styles.sectionIdentity}>
                    <strong>{section.label}</strong>
                    <small>/{section.slug}</small>
                  </span>
                </button>

                <div className={styles.meta}>
                  <span className={styles.typeBadge}>Hlavná sekcia</span>
                  <span className={section.visible ? styles.visibleBadge : styles.hiddenBadge}>
                    {section.visible ? "Zobrazená" : "Skrytá"}
                  </span>
                  <span>{section.subpages.length} podsekcií</span>
                  <span>{articleCountText}</span>
                  <span>Upravené {formattedUpdatedAt(section.updatedAt)}</span>
                </div>

                <div className={styles.rowActions}>
                  <Link href={`/${section.slug}`} target="_blank">Verejná stránka ↗</Link>
                  {section.articleEnabled && <Link href={directAdminHref}>{section.slug === "steniatka" ? "Články sekcie" : "Správa článkov"}</Link>}
                  <button type="button" onClick={() => update(section.slug, { visible: !section.visible })}>
                    {section.visible ? "Skryť" : "Zobraziť"}
                  </button>
                  <button type="button" aria-label={`Posunúť ${section.label} vyššie`} disabled={index === 0} onClick={() => move(index, -1)}>↑</button>
                  <button type="button" aria-label={`Posunúť ${section.label} nižšie`} disabled={index === sections.length - 1} onClick={() => move(index, 1)}>↓</button>
                </div>
              </header>

              {open === section.slug && (
                <div className={styles.editor} id={`section-editor-${section.slug}`}>
                  <section className={styles.primaryFields} aria-label={`Verejný obsah sekcie ${section.label}`}>
                    <div className={styles.fieldGrid}>
                      <label>
                        <span>Názov sekcie</span>
                        <input value={section.label} onChange={(event) => update(section.slug, { label: event.currentTarget.value })} />
                      </label>
                      <label>
                        <span>Krátky nadpis</span>
                        <input value={section.eyebrow} onChange={(event) => update(section.slug, { eyebrow: event.currentTarget.value })} />
                      </label>
                    </div>
                    <label>
                      <span>Popis pre karty a vyhľadávače</span>
                      <textarea rows={2} value={section.description} onChange={(event) => update(section.slug, { description: event.currentTarget.value })} />
                    </label>
                    <label>
                      <span>Úvodný text sekcie</span>
                      <textarea rows={4} value={section.intro} onChange={(event) => update(section.slug, { intro: event.currentTarget.value })} />
                    </label>
                    <AdminHelpText term="Editor">
                      Tento kontrakt je dnes plain text. Rich-text editor z ARTICLE-ADMIN sa sem nepripája bez samostatnej zmeny dátového kontraktu.
                    </AdminHelpText>
                  </section>

                  <div className={styles.subsectionHeading}>
                    <div>
                      <strong>Podsekcie a kategórie</strong>
                      <small>Obsahujú verejný názov, adresu, texty a voliteľné SEO/meta nastavenia.</small>
                    </div>
                    <AdminActionButton variant="secondary" onClick={() => addSubpage(section.slug)}>+ Pridať podsekciu</AdminActionButton>
                  </div>

                  <div className={styles.subsectionList}>
                    {section.subpages.map((subpage, subIndex) => {
                      const completeness = [
                        subpage.intro,
                        subpage.popularTopics?.length,
                        subpage.commonQuestions?.length,
                        subpage.warningSigns?.length,
                        subpage.serviceLinks?.length,
                      ].filter(Boolean).length;
                      const isReviewSection = section.slug === "recenzie";
                      const isStructuredSection = ["starostlivost", "aktivity", "steniatka", "recenzie"].includes(section.slug);
                      const isActivitySection = section.slug === "aktivity";
                      const isPuppySection = section.slug === "steniatka";

                      return (
                        <article className={styles.subsection} key={`${subpage.slug}-${subIndex}`}>
                          <header className={styles.subsectionHeader}>
                            <div>
                              <span aria-hidden="true">{subpage.icon || "🐾"}</span>
                              <span>
                                <strong>{subpage.label || "Nová podsekcia"}</strong>
                                <small>/{section.slug}/{subpage.slug}</small>
                              </span>
                              <span className={styles.childBadge}>Podsekcia</span>
                              {isStructuredSection && <span className={styles.completeness}>{completeness}/5 obsahových častí</span>}
                            </div>
                            <div className={styles.subsectionActions}>
                              <button type="button" onClick={() => updateSubpage(section.slug, subIndex, { visible: subpage.visible === false })}>
                                {subpage.visible === false ? "Skrytá" : "Zobrazená"}
                              </button>
                              <button type="button" onClick={() => setSettingsTarget({ sectionSlug: section.slug, subIndex })}>Nastavenia</button>
                              <button type="button" aria-label="Posunúť podsekciu vyššie" disabled={subIndex === 0} onClick={() => moveSubpage(section.slug, subIndex, -1)}>↑</button>
                              <button type="button" aria-label="Posunúť podsekciu nižšie" disabled={subIndex === section.subpages.length - 1} onClick={() => moveSubpage(section.slug, subIndex, 1)}>↓</button>
                            </div>
                          </header>

                          <div className={styles.fieldGrid}>
                            <label>
                              <span>Ikona</span>
                              <input value={subpage.icon ?? ""} onChange={(event) => updateSubpage(section.slug, subIndex, { icon: event.currentTarget.value })} placeholder="🐾" />
                            </label>
                            <label>
                              <span>Názov</span>
                              <input value={subpage.label} onChange={(event) => updateSubpage(section.slug, subIndex, { label: event.currentTarget.value })} />
                            </label>
                          </div>
                          <label>
                            <span>Popis na karte</span>
                            <textarea rows={2} value={subpage.description} onChange={(event) => updateSubpage(section.slug, subIndex, { description: event.currentTarget.value })} />
                          </label>
                          <label>
                            <span>Úvod podstránky</span>
                            <textarea rows={3} value={subpage.intro ?? ""} onChange={(event) => updateSubpage(section.slug, subIndex, { intro: event.currentTarget.value })} />
                          </label>

                          {isStructuredSection && (
                            <details className={styles.structured} open={subIndex === 0}>
                              <summary>
                                {isReviewSection ? "Obsah kategórie recenzií a testov" : isActivitySection ? "Obsah oblasti výcviku a aktivít" : isPuppySection ? "Obsah oblasti Šteniatok" : "Obsah poradenskej oblasti"}
                              </summary>
                              <p>Každú položku zoznamu napíš na samostatný riadok. Odkazy zapisuj ako <code>Názov | /adresa</code>.</p>
                              <div className={styles.fieldGrid}>
                                <label>
                                  <span>{isReviewSection ? "Témy a kritériá výberu" : isActivitySection ? "Aktivity a témy" : isPuppySection ? "Témy tejto fázy" : "Najčastejšie témy"}</span>
                                  <textarea rows={5} value={lines(subpage.popularTopics)} onChange={(event) => updateSubpage(section.slug, subIndex, { popularTopics: fromLines(event.currentTarget.value) })} />
                                </label>
                                <label>
                                  <span>Najčastejšie otázky</span>
                                  <textarea rows={5} value={lines(subpage.commonQuestions)} onChange={(event) => updateSubpage(section.slug, subIndex, { commonQuestions: fromLines(event.currentTarget.value) })} />
                                </label>
                                <label>
                                  <span>{isReviewSection ? "Ako vyberať a čo porovnávať" : isActivitySection ? "Ako začať" : isPuppySection ? "Čo urobiť teraz" : "Čo sledovať alebo urobiť doma"}</span>
                                  <textarea rows={6} value={lines(subpage.homeSteps)} onChange={(event) => updateSubpage(section.slug, subIndex, { homeSteps: fromLines(event.currentTarget.value) })} />
                                </label>
                                <label>
                                  <span>{isReviewSection ? "Na čo si dať pozor" : isActivitySection ? "Bezpečnosť a limity" : isPuppySection ? "Na čo si dať pozor" : "Varovné signály"}</span>
                                  <textarea rows={6} value={lines(subpage.warningSigns)} onChange={(event) => updateSubpage(section.slug, subIndex, { warningSigns: fromLines(event.currentTarget.value) })} />
                                </label>
                                <label className={styles.fullField}>
                                  <span>{isReviewSection ? "Metodika testovania a redakčný kontext" : isActivitySection ? "Čo zvážiť pri výbere" : isPuppySection ? "Dôležité pre túto fázu" : "Kedy vyhľadať odborníka"}</span>
                                  <textarea rows={3} value={subpage.expertAdvice ?? ""} onChange={(event) => updateSubpage(section.slug, subIndex, { expertAdvice: event.currentTarget.value })} />
                                </label>
                                <label>
                                  <span>{isReviewSection ? "Súvisiace odkazy a služby" : isActivitySection || isPuppySection ? "Kontakty a súvisiace služby" : "Užitočné kontakty"}</span>
                                  <textarea rows={4} value={serviceLines(subpage.serviceLinks)} onChange={(event) => updateSubpage(section.slug, subIndex, { serviceLinks: fromServiceLines(event.currentTarget.value) })} />
                                </label>
                                <label>
                                  <span>Pripnuté články – slugy</span>
                                  <textarea rows={4} value={lines(subpage.featuredArticleSlugs)} onChange={(event) => updateSubpage(section.slug, subIndex, { featuredArticleSlugs: fromLines(event.currentTarget.value) })} />
                                </label>
                              </div>
                            </details>
                          )}

                          <div className={styles.subsectionFooter}>
                            {section.articleEnabled && (
                              <Link href={section.slug === "steniatka" ? `/admin/novy?sekcia=steniatka&oblast=${subpage.slug}` : "/admin/novy"}>
                                + Vytvoriť obsah
                              </Link>
                            )}
                            <button type="button" className={styles.remove} onClick={() => removeSubpage(section.slug, subIndex)}>Odstrániť podsekciu</button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {!visibleSections.length && (
        <div className={styles.empty}>
          <strong>Nenašla sa zodpovedajúca sekcia.</strong>
          <span>Skús iný názov, slug alebo názov podsekcie.</span>
        </div>
      )}

      <div className={styles.savebar}>
        <div>
          {message && <p role="status">{message}</p>}
          {error && <p role="alert" className={styles.error}>{error}</p>}
        </div>
        <AdminActionButton variant="primary" disabled={saving} onClick={() => void save()}>
          {saving ? "Ukladám…" : "Uložiť sekcie"}
        </AdminActionButton>
      </div>

      <AdminDrawer
        open={Boolean(settingsSubpage && settingsSection)}
        title={settingsSubpage ? `Nastavenia: ${settingsSubpage.label}` : "Nastavenia podsekcie"}
        description="Sekundárne technické, obrazové a SEO nastavenia. Zmeny sa uložia spolu s celou sekciou."
        onClose={() => setSettingsTarget(null)}
        footer={<AdminActionButton variant="primary" onClick={() => setSettingsTarget(null)}>Hotovo</AdminActionButton>}
      >
        {settingsSection && settingsSubpage && settingsTarget && (
          <div className={styles.drawerFields}>
            <label>
              <span>Slug / adresa</span>
              <input
                value={settingsSubpage.slug}
                onChange={(event) => updateSubpage(settingsSection.slug, settingsTarget.subIndex, {
                  slug: event.currentTarget.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
                })}
              />
            </label>
            <label>
              <span>Obrázok</span>
              <input
                value={settingsSubpage.imageUrl ?? ""}
                onChange={(event) => updateSubpage(settingsSection.slug, settingsTarget.subIndex, { imageUrl: event.currentTarget.value })}
                placeholder="/media/... alebo https://..."
              />
            </label>
            <label>
              <span>ALT text obrázka</span>
              <input
                value={settingsSubpage.imageAlt ?? ""}
                onChange={(event) => updateSubpage(settingsSection.slug, settingsTarget.subIndex, { imageAlt: event.currentTarget.value })}
              />
            </label>
            <label>
              <span>SEO title</span>
              <input
                value={settingsSubpage.seoTitle ?? ""}
                onChange={(event) => updateSubpage(settingsSection.slug, settingsTarget.subIndex, { seoTitle: event.currentTarget.value })}
              />
            </label>
            <label>
              <span>Meta description</span>
              <textarea
                rows={4}
                value={settingsSubpage.metaDescription ?? ""}
                onChange={(event) => updateSubpage(settingsSection.slug, settingsTarget.subIndex, { metaDescription: event.currentTarget.value })}
              />
            </label>
          </div>
        )}
      </AdminDrawer>
    </section>
  );
}
