"use client";

import { useState, type ReactNode } from "react";
import {
  AdminUiCard,
  AdminUiCardContent,
  AdminUiCardDescription,
  AdminUiCardHeader,
  AdminUiCardTitle,
} from "@/components/admin-shadcn-editor-primitives";
import styles from "./admin-shadcn-editor.module.css";
import { AdminSharedEditorNavigation } from "@/components/admin-shared-editor-navigation";

export type AdminUnifiedEditorSection = {
  id: string;
  label: string;
  description?: string;
  content: ReactNode;
};

/**
 * One document scroll, one active section at a time, accessible section list.
 * All panels stay mounted (but hidden) so inactive uncontrolled inputs and
 * rich-text editor instances are not discarded on navigation.
 *
 * The caller owns field state, validation, dirty guarding, API persistence,
 * publishing, Notion synchronization and image uploads.
 */
export function AdminUnifiedEditorWorkspace({
  sections,
  status,
  actions,
  preview,
  previewLabel = "Náhľad",
}: {
  sections: AdminUnifiedEditorSection[];
  status?: ReactNode;
  actions?: ReactNode;
  preview?: ReactNode;
  previewLabel?: string;
}) {
  const [activeId, setActiveId] = useState(sections[0]?.id ?? "");
  const [previewOpen, setPreviewOpen] = useState(false);
  const currentId = sections.some((section) => section.id === activeId)
    ? activeId
    : sections[0]?.id ?? "";

  return (
    <div className={styles.workspace} data-admin-unified-editor data-editor-scroll="document">
      <div className={styles.previewBar}>
        <div className={styles.statusLine}>{status}</div>
        {preview ? (
          <button type="button" className={styles.buttonSecondary} aria-expanded={previewOpen}
            aria-controls="admin-unified-preview" onClick={() => setPreviewOpen((open) => !open)}>
            {previewOpen ? "Skryť náhľad" : previewLabel}
          </button>
        ) : null}
      </div>
      {preview ? (
        <aside id="admin-unified-preview" className={styles.previewPane} aria-label={previewLabel} hidden={!previewOpen}>
          {preview}
        </aside>
      ) : null}
      <div className={styles.editorGrid}>
        <AdminSharedEditorNavigation
          sections={sections} activeId={currentId} onNavigate={setActiveId}
          layout="sidebar" mode="switch" ariaLabel="Sekcie editora"
        />
        <div className={styles.mainColumn}>
          {sections.map((section) => (
            <section className={styles.section} key={section.id} id={"unified-section-" + section.id}
              hidden={section.id !== currentId} aria-labelledby={"unified-title-" + section.id}
              data-editor-section={section.id}>
              <AdminUiCard>
                <AdminUiCardHeader>
                  <AdminUiCardTitle>
                    <h2 id={"unified-title-" + section.id}>{section.label}</h2>
                  </AdminUiCardTitle>
                  {section.description ? <AdminUiCardDescription>{section.description}</AdminUiCardDescription> : null}
                </AdminUiCardHeader>
                <AdminUiCardContent>{section.content}</AdminUiCardContent>
              </AdminUiCard>
            </section>
          ))}
        </div>
      </div>
      {actions ? <footer className={styles.footer} data-unified-editor-actions>{actions}</footer> : null}
    </div>
  );
}

export function AdminUnifiedEditorFields({ children }: { children: ReactNode }) {
  return <div className={styles.fields}>{children}</div>;
}

export function AdminUnifiedEditorField({
  id,
  label,
  hint,
  required = false,
  wide = false,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={styles.field} data-wide={wide}>
      <label htmlFor={id}>{label}{required ? <span aria-hidden="true"> *</span> : null}</label>
      {children}
      {hint ? <small id={id + "-hint"}>{hint}</small> : null}
    </div>
  );
}
