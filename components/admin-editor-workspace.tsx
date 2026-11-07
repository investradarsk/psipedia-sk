"use client";

import {
  useCallback,
  useMemo,
  useId,
  useRef,
  useState,
  useEffect,
  type ReactNode,
  type RefObject,
} from "react";
import {
  AdminActionButton,
  AdminEditorSection,
  AdminModalDialog,
} from "@/components/admin-interaction-system";
import styles from "./admin-editor-workspace.module.css";
import { AdminSharedEditorNavigation } from "@/components/admin-shared-editor-navigation";
import { AdminEditorFooter } from "@/components/admin-editor-footer";
import { AdminEditorSectionVisibility } from "@/components/admin-editor-section-visibility";

export { AdminEditorSection as EditorSection } from "@/components/admin-interaction-system";

export type EditorWorkspaceSection = { id: string; label: string; icon?: ReactNode };
export type EditorStatusTone = "neutral" | "success" | "warning" | "danger";

export function EditorStatus({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: EditorStatusTone;
}) {
  return <span className={styles.status} data-tone={tone} data-editor-status>{label}</span>;
}

export function EditorHeader({
  title,
  description,
  status,
  onClose,
  closeLabel,
}: {
  title?: string;
  description?: string;
  status?: ReactNode;
  onClose?: () => void;
  closeLabel?: string;
}) {
  const headingId = useId();
  if (!title && !description && !status && !onClose) return null;
  return (
    <header className={styles.header} data-editor-header aria-labelledby={title ? headingId : undefined}>
      <div className={styles.headerText}>
        {title && <h1 id={headingId}>{title}</h1>}
        {description && <p>{description}</p>}
        {status && <div className={styles.statusLine}>{status}</div>}
      </div>
      {onClose && (
        <AdminActionButton type="button" variant="neutral" onClick={onClose} aria-label={closeLabel ?? "Zavrieť editor"}>
          {closeLabel ?? "Zavrieť"}
        </AdminActionButton>
      )}
    </header>
  );
}

export function EditorSectionNavigation({
  sections,
  activeSection,
  onNavigate,
  previewAvailable = false,
  showingPreview = false,
  onTogglePreview,
  sectionMode = "scroll",
  articleLayout = false,
}: {
  sections: EditorWorkspaceSection[];
  activeSection: string;
  onNavigate: (id: string) => void;
  previewAvailable?: boolean;
  showingPreview?: boolean;
  onTogglePreview?: () => void;
  sectionMode?: "scroll" | "switch";
  articleLayout?: boolean;
}) {
  return (
    <div className={styles.navigation} data-editor-navigation>
      <AdminSharedEditorNavigation
        sections={sections}
        activeId={activeSection}
        onNavigate={onNavigate}
        ariaLabel="Sekcie pracovného editora"
        mode={sectionMode}
        layout={articleLayout || sectionMode === "switch" ? "sidebar" : "horizontal"}
      />
      {previewAvailable && (
        <button
          className={styles.previewToggle}
          type="button"
          aria-pressed={showingPreview}
          onClick={onTogglePreview}
        >
          {showingPreview ? "Späť na úpravy" : "Náhľad"}
        </button>
      )}
    </div>
  );
}

export function EditorContent({
  children,
  contentRef,
}: {
  children: ReactNode;
  contentRef?: RefObject<HTMLDivElement | null>;
}) {
  return <div className={styles.content} ref={contentRef} data-editor-content>{children}</div>;
}

export function EditorPreview({
  title = "Živý náhľad",
  focusable = false,
  children,
}: {
  title?: string;
  focusable?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={styles.preview} aria-label={title} tabIndex={focusable ? 0 : undefined} data-editor-preview>
      <h2>{title}</h2>
      <div className={styles.previewInner}>{children}</div>
    </section>
  );
}

export function EditorActionBar({
  primary,
  secondary,
  destructive,
  message,
  feedback,
}: {
  primary?: ReactNode;
  secondary?: ReactNode;
  destructive?: ReactNode;
  message?: ReactNode;
  /** Already-announced alert/status element; render without nesting in another live region. */
  feedback?: ReactNode;
}) {
  return (
    <AdminEditorFooter
      className={styles.actionBar}
      data-editor-actionbar
      destructive={destructive}
      message={message}
      feedback={feedback}
    >
      {secondary}{primary}
    </AdminEditorFooter>
  );
}

export function EditorUnsavedChangesGuard({
  active,
  open,
  onStay,
  onDiscard,
  allowNativeExitRef,
}: {
  active: boolean;
  open: boolean;
  onStay: () => void;
  onDiscard: () => void;
  allowNativeExitRef?: RefObject<boolean>;
}) {
  useEffect(() => {
    if (!active) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (allowNativeExitRef?.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active, allowNativeExitRef]);

  return (
    <AdminModalDialog
      open={open}
      title="Neuložené zmeny"
      description="Upravované údaje zatiaľ nie sú uložené."
      onClose={onStay}
      preferExplicitAutofocus
      footer={
        <>
          <AdminActionButton variant="neutral" data-admin-autofocus="true" onClick={onStay}>Pokračovať v úpravách</AdminActionButton>
          <AdminActionButton variant="destructive" onClick={onDiscard}>Zahodiť zmeny a zavrieť</AdminActionButton>
        </>
      }
    >
      <p>Ak teraz opustíte editor, neuložené úpravy sa stratia.</p>
    </AdminModalDialog>
  );
}

export function EditorWorkspace({
  mode = "modal",
  open = true,
  title,
  description,
  status,
  sections,
  preview,
  previewTitle,
  previewFocusable = false,
  actions,
  dirty = false,
  onClose,
  closeLabel,
  children,
  sectionMode = "scroll",
  articleLayout = false,
  summary,
  activeSectionId,
  onSectionChange,
}: {
  mode?: "modal" | "page";
  open?: boolean;
  title: string;
  description?: string;
  status?: ReactNode;
  sections: EditorWorkspaceSection[];
  /** One mounted section at a time (opt-in for canonical breed editor). */
  sectionMode?: "scroll" | "switch";
  /** Article-only visual layout, without changing shared profile editor behavior. */
  articleLayout?: boolean;
  /** Content displayed below the editor page heading. */
  summary?: ReactNode;
  /** Optional controlled section selection allows callers to reveal validation errors. */
  activeSectionId?: string;
  onSectionChange?: (id: string) => void;
  preview?: ReactNode;
  previewTitle?: string;
  previewFocusable?: boolean;
  /** Optional render callback lets custom footer buttons reuse the workspace's guarded close. */
  actions?: ReactNode | ((requestClose: () => void) => ReactNode);
  dirty?: boolean;
  onClose?: () => void;
  closeLabel?: string;
  children: ReactNode;
}) {
  const [activeSection, setActiveSection] = useState(sections[0]?.id ?? "");
  const [showPreview, setShowPreview] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const currentSection = sections.some((section) => section.id === (activeSectionId ?? activeSection))
    ? (activeSectionId ?? activeSection)
    : sections[0]?.id ?? "";
  const sectionVisibility = useMemo(() => ({ activeId: currentSection, mode: sectionMode }), [currentSection, sectionMode]);
  // A page editor follows the document viewport; modal editors retain their
  // isolated scroll pane and keyboard/focus behavior.
  useEffect(() => {
    if (mode !== "page" || sectionMode === "switch" || typeof IntersectionObserver === "undefined") return;
    const pane = contentRef.current;
    if (!pane) return;
    const allowed = new Set(sections.map((section) => section.id));
    const targets = Array.from(pane.querySelectorAll<HTMLElement>("[data-admin-editor-section]"))
      .filter((section) => allowed.has(section.id));
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting)
        .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top)[0];
      if (visible) {
        setActiveSection(visible.target.id);
        onSectionChange?.(visible.target.id);
      }
    }, { root: null, rootMargin: "-18% 0px -66% 0px", threshold: 0 });
    targets.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [mode, sectionMode, sections, onSectionChange]);

  const requestClose = useCallback(() => {
    if (!onClose) return;
    if (dirty) setConfirmClose(true);
    else onClose();
  }, [dirty, onClose]);
  const discard = () => {
    setConfirmClose(false);
    onClose?.();
  };
  const navigate = (id: string) => {
    if (!sections.some((section) => section.id === id)) return;
    setShowPreview(false);
    setActiveSection(id);
    onSectionChange?.(id);
    if (sectionMode === "switch") {
      // AdminSharedEditorNavigation already focuses and reveals this panel.
      // Do not launch a second smooth scroll, which causes mobile jumping.
      // Mounted sections retain their form values across navigation.
      return;
    }
    const target = Array.from(contentRef.current?.querySelectorAll<HTMLElement>("[data-admin-editor-section]") ?? [])
      .find((section) => section.id === id);
    if (target && contentRef.current) {
      if (mode === "page") {
        // Page editors scroll the document, never an inner pane.
        target.scrollIntoView({ block: "start", behavior: "smooth" });
      } else {
        // Dialogs keep their dedicated scroll region.
        const pane = contentRef.current;
        const relativeTop = target.getBoundingClientRect().top - pane.getBoundingClientRect().top;
        pane.scrollTo({ top: pane.scrollTop + relativeTop - 12, behavior: "smooth" });
      }
      target.focus({ preventScroll: true });
    }
  };

  const resolvedActions = typeof actions === "function" ? actions(requestClose) : actions;

  const body = (
    <div className={styles.workspace} data-editor-workspace data-mobile-panel={showPreview ? "preview" : "edit"}>
      <EditorHeader status={mode === "modal" ? status : undefined} />
      <EditorSectionNavigation
        sections={sections}
        activeSection={currentSection}
        onNavigate={navigate}
        sectionMode={sectionMode}
        articleLayout={articleLayout}
        previewAvailable={Boolean(preview)}
        showingPreview={showPreview}
        onTogglePreview={() => setShowPreview((value) => !value)}
      />
      <div className={styles.columns} data-editor-columns={preview ? "with-preview" : "single"}>
        <EditorContent contentRef={contentRef}>
          <AdminEditorSectionVisibility.Provider value={sectionVisibility}>
            {children}
          </AdminEditorSectionVisibility.Provider>
        </EditorContent>
        {preview && <EditorPreview title={previewTitle} focusable={previewFocusable}>{preview}</EditorPreview>}
      </div>
    </div>
  );

  return (
    <>
      {mode === "modal" ? (
        <AdminModalDialog
          open={open}
          title={title}
          description={description}
          className={styles.workspaceModal}
          onClose={requestClose}
          footer={resolvedActions}
        >
          {body}
        </AdminModalDialog>
      ) : (
        <section className={styles.pageWorkspace} aria-label={title} data-editor-page data-admin-form-system="v4" data-editor-section-mode={sectionMode} data-editor-layout={articleLayout ? "article" : undefined}>
          <EditorHeader title={title} description={description} status={status} onClose={onClose ? requestClose : undefined} closeLabel={closeLabel} />
          {summary}
          {body}
          {resolvedActions && <div className={styles.pageActions}>{resolvedActions}</div>}
        </section>
      )}
      <EditorUnsavedChangesGuard
        active={dirty && (mode === "page" || open)}
        open={confirmClose && (mode === "page" || open)}
        onStay={() => setConfirmClose(false)}
        onDiscard={discard}
      />
    </>
  );
}

// Field ownership, serialization, validation and publish decisions remain with each canonical editor.
void AdminEditorSection;
