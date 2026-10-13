"use client";

import { useId } from "react";
import type { ServiceFilterCategory } from "@/lib/directory-filter-contract";
import {
  buildDirectoryCategoryFilterPatch, getDirectoryCategoryFilterFields,
  scopeDirectoryCategoryFilterChanges, type DirectoryCategoryFilterChanges,
  type DirectoryCategoryFilterOriginals, type DirectoryCategoryFilterPatch,
  type DirectoryCategoryFilterReviewStates,
} from "@/lib/directory-category-filter-editor";
import styles from "./directory-category-filter-fields.module.css";

export type DirectoryCategoryFilterFieldsProps = {
  category: ServiceFilterCategory;
  /** Keys are registry IDs, never physical D1 fields. */
  originalValues: DirectoryCategoryFilterOriginals;
  reviewStates?: DirectoryCategoryFilterReviewStates;
  /** Controlled explicit edits, not the baseline. */
  changes: DirectoryCategoryFilterChanges;
  /** Pure callback; parent controls lifecycle. */
  onChange: (changes: DirectoryCategoryFilterChanges, patch: DirectoryCategoryFilterPatch) => void;
  disabled?: boolean;
  idPrefix?: string;
};

export function DirectoryCategoryFilterFields({
  category, originalValues, reviewStates = {}, changes, onChange, disabled = false, idPrefix,
}: DirectoryCategoryFilterFieldsProps) {
  const reactId = useId();
  const prefix = idPrefix ?? "directory-category-filter-" + reactId.replace(/:/g, "");
  const fields = getDirectoryCategoryFilterFields(category, originalValues, reviewStates);
  const scopedChanges = scopeDirectoryCategoryFilterChanges(category, changes);

  function changeField(id: string, selected: string) {
    const next = { ...scopedChanges };
    if (selected === "") delete next[id];
    else next[id] = selected;
    onChange(next, buildDirectoryCategoryFilterPatch(category, originalValues, next, reviewStates));
  }

  return (
    <section className={styles.section} aria-label="Kategóriové filtre" data-category-filter-editor={category}>
      <div className={styles.heading}>
        <h3>Kategóriové filtre</h3>
        <p>Vyplňte len údaje, ktoré poznáte. Nevyplnené neznamená „Nie“.</p>
      </div>
      <div className={styles.grid}>
        {fields.map((field) => {
          const id = prefix + "-" + field.id.replace(/[^a-z0-9]+/gi, "-");
          const hintId = id + "-hint";
          const selected = scopedChanges[field.id];
          const value = selected !== undefined && field.options.some((item) => item.value === selected)
            ? selected : field.initialValue;
          return (
            <div className={styles.field} key={field.id} data-filter-id={field.id} data-original-status={field.status}>
              <label className={styles.label} htmlFor={id}>{field.label}</label>
              <select className={styles.select} id={id} value={value} disabled={disabled}
                aria-describedby={hintId}
                aria-invalid={field.status === "invalid" || field.status === "conflict" ? true : undefined}
                onChange={(event) => changeField(field.id, event.target.value)}
              >
                <option value="">
                  {field.status === "conflict" ? "Konflikt – ponechať bez zmeny"
                    : field.status === "invalid" ? "Neplatný údaj – ponechať bez zmeny"
                    : "Nevyplnené – ponechať bez zmeny"}
                </option>
                {field.options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
              </select>
              <small className={field.status === "invalid" || field.status === "conflict" ? styles.warning : styles.hint} id={hintId}>
                {field.hint || "Zmena sa uloží len vtedy, ak sa líši od pôvodného údaja."}
              </small>
            </div>
          );
        })}
      </div>
    </section>
  );
}
