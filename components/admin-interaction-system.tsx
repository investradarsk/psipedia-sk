"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import styles from "./admin-interaction-system.module.css";

export type AdminActionVariant = "primary" | "secondary" | "neutral" | "destructive" | "link";

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function formatAdminSelectionSummary(count: number) {
  if (count === 1) return "Upravíš 1 vybranú položku";
  if (count >= 2 && count <= 4) return `Upravíš ${count} vybrané položky`;
  return `Upravíš ${count} vybraných položiek`;
}

export function AdminActionButton({
  variant = "neutral",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: AdminActionVariant }) {
  return (
    <button
      {...props}
      type={type}
      className={classes(styles.action, styles[variant], className)}
      data-admin-action={variant}
    />
  );
}

export function AdminActionLink({
  variant = "link",
  className,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: AdminActionVariant }) {
  return (
    <a
      {...props}
      className={classes(styles.action, styles[variant], className)}
      data-admin-action={variant}
    />
  );
}

export function AdminBulkActionToolbar({
  selectedCount,
  selectionDescription,
  primaryAction,
  secondaryActions,
  destructiveAction,
  onClear,
  clearLabel = "Zrušiť výber",
  ariaLabel = "Hromadný výber",
}: {
  selectedCount: number;
  selectionDescription?: string;
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  destructiveAction?: ReactNode;
  onClear: () => void;
  clearLabel?: string;
  ariaLabel?: string;
}) {
  return (
    <aside className={styles.bulkToolbar} aria-label={ariaLabel} data-admin-bulk-toolbar>
      <div className={styles.bulkSummary} aria-live="polite" aria-atomic="true">
        <strong>{formatAdminSelectionSummary(selectedCount)}</strong>
        {selectionDescription && <span>{selectionDescription}</span>}
      </div>
      <div className={styles.bulkActions}>
        {primaryAction && <div className={styles.primaryGroup}>{primaryAction}</div>}
        {secondaryActions && <div className={styles.secondaryGroup}>{secondaryActions}</div>}
        {destructiveAction && <div className={styles.destructiveGroup}>{destructiveAction}</div>}
        <AdminActionButton variant="link" onClick={onClear}>{clearLabel}</AdminActionButton>
      </div>
    </aside>
  );
}

function useAdminDialog(open: boolean) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      requestAnimationFrame(() => {
        const focusTarget = dialog.querySelector<HTMLElement>(
          '[data-admin-autofocus="true"], button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
        );
        focusTarget?.focus();
      });
      return;
    }

    if (!open && dialog.open) dialog.close();
  }, [open]);

  function restoreFocus() {
    requestAnimationFrame(() => restoreFocusRef.current?.focus());
  }

  return { dialogRef, restoreFocus };
}

export function AdminModalDialog({
  open,
  title,
  description,
  children,
  footer,
  onClose,
  className,
}: {
  open: boolean;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const { dialogRef, restoreFocus } = useAdminDialog(open);

  return (
    <dialog
      ref={dialogRef}
      className={classes(styles.dialog, className)}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={restoreFocus}
    >
      <div className={styles.dialogHeader}>
        <div>
          <h2 id={titleId}>{title}</h2>
          {description && <p id={descriptionId}>{description}</p>}
        </div>
        <AdminActionButton variant="neutral" aria-label="Zavrieť dialóg" onClick={onClose}>×</AdminActionButton>
      </div>
      {children && <div className={styles.dialogContent}>{children}</div>}
      {footer && <div className={styles.dialogFooter}>{footer}</div>}
    </dialog>
  );
}

export function AdminDestructiveConfirmDialog({
  open,
  title,
  description,
  affectedCount,
  affectedLabel,
  confirmLabel,
  pending = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description?: string;
  affectedCount: number;
  affectedLabel: string;
  confirmLabel: string;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AdminModalDialog
      open={open}
      title={title}
      description={description}
      onClose={onCancel}
      footer={(
        <>
          <AdminActionButton variant="neutral" onClick={onCancel} disabled={pending}>Zrušiť</AdminActionButton>
          <AdminActionButton
            variant="destructive"
            data-admin-autofocus="true"
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? "Spracúvam…" : confirmLabel}
          </AdminActionButton>
        </>
      )}
    >
      <p className={styles.impactSummary}>
        Táto akcia ovplyvní <strong>{affectedCount}</strong> {affectedLabel}.
      </p>
    </AdminModalDialog>
  );
}

export function AdminDrawer({
  open,
  title,
  description,
  children,
  footer,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const { dialogRef, restoreFocus } = useAdminDialog(open);

  return (
    <dialog
      ref={dialogRef}
      className={styles.drawer}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      data-admin-drawer
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={restoreFocus}
    >
      <div className={styles.drawerHeader}>
        <div>
          <h2 id={titleId}>{title}</h2>
          {description && <p id={descriptionId}>{description}</p>}
        </div>
        <AdminActionButton variant="neutral" aria-label="Zavrieť panel" onClick={onClose}>×</AdminActionButton>
      </div>
      <div className={styles.drawerBody}>{children}</div>
      {footer && <div className={styles.drawerFooter}>{footer}</div>}
    </dialog>
  );
}

export function AdminBulkEditShell({
  title = "Hromadná úprava",
  affectedCount,
  affectedLabel = "položiek",
  fieldSelection,
  newValue,
  unchangedNote,
  preview,
  validationMessage,
  confirmLabel = "Potvrdiť hromadnú úpravu",
  confirmDisabled = false,
  pending = false,
  onCancel,
  onConfirm,
}: {
  title?: string;
  affectedCount: number;
  affectedLabel?: string;
  fieldSelection: ReactNode;
  newValue: ReactNode;
  unchangedNote: ReactNode;
  preview: ReactNode;
  validationMessage?: string;
  confirmLabel?: string;
  confirmDisabled?: boolean;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const fieldId = useId();
  const valueId = useId();
  const previewId = useId();

  return (
    <section className={styles.bulkEditShell} aria-labelledby={titleId} data-admin-bulk-edit-shell>
      <header className={styles.bulkEditHeader}>
        <div>
          <span>Hromadná zmena</span>
          <h2 id={titleId}>{title}</h2>
        </div>
        <strong>{affectedCount} {affectedLabel}</strong>
      </header>

      <div className={styles.bulkEditGrid}>
        <section className={styles.bulkEditStep} aria-labelledby={fieldId}>
          <h3 id={fieldId}>1. Vyber pole</h3>
          {fieldSelection}
        </section>
        <section className={styles.bulkEditStep} aria-labelledby={valueId}>
          <h3 id={valueId}>2. Nastav novú hodnotu</h3>
          {newValue}
        </section>
      </div>

      <p className={styles.unchangedNote}><strong>Nezmení sa:</strong> {unchangedNote}</p>

      <section className={styles.bulkEditPreview} aria-labelledby={previewId}>
        <h3 id={previewId}>3. Skontroluj súhrn pred potvrdením</h3>
        <p>Úprava ovplyvní <strong>{affectedCount}</strong> {affectedLabel}.</p>
        {preview}
      </section>

      {validationMessage && <p className={styles.validation} role="alert">{validationMessage}</p>}

      <footer className={styles.bulkEditFooter}>
        <AdminActionButton variant="neutral" onClick={onCancel} disabled={pending}>Zrušiť</AdminActionButton>
        <AdminActionButton
          variant="primary"
          onClick={onConfirm}
          disabled={pending || confirmDisabled || Boolean(validationMessage)}
        >
          {pending ? "Ukladám…" : confirmLabel}
        </AdminActionButton>
      </footer>
    </section>
  );
}

export type AdminEditorSectionLink = { id: string; label: string };

export function AdminStickyEditorNavigation({
  sections,
  ariaLabel = "Sekcie editora",
}: {
  sections: AdminEditorSectionLink[];
  ariaLabel?: string;
}) {
  const [currentSectionId, setCurrentSectionId] = useState(sections[0]?.id ?? "");

  useEffect(() => {
    if (!sections.length) return;
    const validIds = new Set(sections.map((section) => section.id));
    const hash = decodeURIComponent(window.location.hash.replace(/^#/, ""));
    const hashFrame = hash && validIds.has(hash)
      ? window.requestAnimationFrame(() => setCurrentSectionId(hash))
      : null;

    const targets = sections
      .map((section) => document.getElementById(section.id))
      .filter((target): target is HTMLElement => Boolean(target));
    if (!targets.length || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible?.target.id) setCurrentSectionId(visible.target.id);
    }, { rootMargin: "-18% 0px -68% 0px", threshold: [0.05, 0.25, 0.6] });

    targets.forEach((target) => observer.observe(target));
    return () => {
      if (hashFrame !== null) window.cancelAnimationFrame(hashFrame);
      observer.disconnect();
    };
  }, [sections]);

  function goToSection(id: string) {
    const target = document.getElementById(id);
    if (!target) return;
    setCurrentSectionId(id);
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    if (target instanceof HTMLElement) target.focus({ preventScroll: true });
    window.history.replaceState(null, "", `#${encodeURIComponent(id)}`);
  }

  if (!sections.length) return null;

  return (
    <nav className={styles.editorNavigation} aria-label={ariaLabel} data-admin-editor-navigation>
      <div className={styles.editorNavigationLinks}>
        {sections.map((section) => (
          <a
            href={`#${section.id}`}
            key={section.id}
            aria-current={currentSectionId === section.id ? "location" : undefined}
            onClick={(event) => {
              event.preventDefault();
              goToSection(section.id);
            }}
          >
            {section.label}
          </a>
        ))}
      </div>
      <label className={styles.editorNavigationMobile}>
        <span>Sekcia</span>
        <select
          value={currentSectionId}
          aria-label={ariaLabel}
          onChange={(event) => goToSection(event.currentTarget.value)}
        >
          {sections.map((section) => <option value={section.id} key={section.id}>{section.label}</option>)}
        </select>
      </label>
    </nav>
  );
}

export function AdminEditorSection({
  id,
  children,
  className,
}: {
  id: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={classes(styles.editorSection, className)}
      tabIndex={-1}
      data-admin-editor-section
    >
      {children}
    </section>
  );
}

export function AdminHelpText({
  id,
  term,
  children,
}: {
  id?: string;
  term?: string;
  children: ReactNode;
}) {
  return (
    <p id={id} className={styles.helpText} data-admin-help-text>
      {term && <strong>{term}: </strong>}
      {children}
    </p>
  );
}
