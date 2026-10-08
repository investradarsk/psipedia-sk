import Link from "next/link";
import type { ReactNode } from "react";
import { chatGPTSignOutPath, type ChatGPTUser } from "@/app/chatgpt-auth";
import { loadExactAdminAttentionSummary } from "@/lib/admin-attention-queue-store";
import { AdminBreadcrumbs, AdminNavigation } from "./admin-navigation";
import { AdminStickyMetrics } from "./admin-sticky-metrics";
import { PawMark } from "./icons";
import styles from "./admin-shell.module.css";

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true" focusable="false">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

async function AdminNotificationBell({ count, partial = false }: { count?: number; partial?: boolean }) {
  let activeCount = count;
  let incomplete = partial;
  if (activeCount === undefined) {
    const summary = await loadExactAdminAttentionSummary();
    activeCount = summary.active;
    incomplete = summary.availability !== "OK";
  }
  const label = incomplete
    ? `Upozornenia: najmenej ${activeCount} aktívnych položiek; niektoré zdroje nie sú dostupné`
    : activeCount === 0
      ? "Upozornenia: žiadne aktívne položky"
      : activeCount === 1
        ? "Upozornenia: 1 aktívna položka"
        : `Upozornenia: ${activeCount} aktívnych položiek`;
  const badge = activeCount > 0
    ? `${activeCount > 99 ? "99+" : activeCount}${incomplete ? "+" : ""}`
    : incomplete ? "!" : null;

  return (
    <Link
      href="/admin/operations"
      className={styles.notificationLink}
      aria-label={label}
      title="Otvoriť upozornenia"
      data-testid="admin-notification-bell"
    >
      <BellIcon />
      {badge && <span className={styles.badge} aria-hidden="true">{badge}</span>}
    </Link>
  );
}

export function AdminShell({
  user,
  eyebrow,
  title,
  description,
  actions,
  children,
  attentionCount,
  attentionCountPartial,
}: {
  user: ChatGPTUser;
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  attentionCount?: number;
  attentionCountPartial?: boolean;
}) {
  return (
    <main id="obsah" className="admin-root" data-admin-shell>
      <AdminStickyMetrics />
      <div className="admin-shell shell">
        <header className={`admin-topbar ${styles.topbarSticky}`} data-admin-topbar>
          <Link href="/admin" className="admin-brand" aria-label="Psipedia redakcia – pracovný prehľad">
            <span><PawMark size={23} /></span><strong>Psipedia</strong><small>redakcia</small>
          </Link>
          <div className={styles.topbarActions}>
            <AdminNotificationBell count={attentionCount} partial={attentionCountPartial} />
            <div className="admin-account">
              <span><small>Prihlásený používateľ</small><strong>{user.displayName}</strong></span>
              <a href={chatGPTSignOutPath("/", user.authProvider)}>Odhlásiť</a>
            </div>
          </div>
        </header>

        <AdminNavigation stickyClassName={styles.stickyNav} />
        <AdminBreadcrumbs />

        <div className={`admin-heading ${styles.headingAnchor}`}>
          <div>
            <span className="admin-eyebrow">{eyebrow}</span>
            <h1>{title}</h1>
            {description && <p>{description}</p>}
          </div>
          {actions && <div className="admin-heading-actions">{actions}</div>}
        </div>

        <div className={styles.contentArea}>{children}</div>

        <footer className="admin-footer">
          <span>Zmeny sa na verejnom webe ukážu až po publikovaní obsahu.</span>
          <a href="/" target="_blank" rel="noreferrer">Otvoriť Psipedia.sk ↗</a>
        </footer>
      </div>
    </main>
  );
}
