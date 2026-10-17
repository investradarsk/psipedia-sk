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
      <div className={`admin-shell shell ${styles.shellV3}`}>
        <div className={styles.workspace}>
          <aside className={styles.sidebarFrame} data-admin-sidebar-shell aria-label="Bočný panel Psipedia Admin">
            <Link href="/admin" className={styles.sidebarBrand} aria-label="Psipedia Admin – pracovný prehľad">
              <PawMark size={31} />
              <span>Psipedia<small>Admin</small></span>
            </Link>
            <AdminNavigation
              stickyClassName={styles.stickyNav}
              signOutHref={chatGPTSignOutPath("/", user.authProvider)}
              userDisplayName={user.displayName}
            />
          </aside>
          <div className={styles.workspacePage}>
            <header className={`admin-topbar ${styles.topbarSticky}`} data-admin-topbar>
              <Link href="/admin" className={styles.mobileBrand} aria-label="Psipedia Admin – pracovný prehľad">
                <PawMark size={25} />
                <span>Psipedia<small>Admin</small></span>
              </Link>
              <span className={styles.topbarCaption}>Psipedia · Administrácia</span>
              <div className={styles.topbarActions}>
                <Link href="/" className={styles.backToWeb} aria-label="Návrat na Psipedia.sk">↗ <span>Späť na web</span></Link>
                <AdminNotificationBell count={attentionCount} partial={attentionCountPartial} />
                <div className={`admin-account ${styles.account}`}>
                  <span><small>Prihlásený používateľ</small><strong>{user.displayName}</strong></span>
                  <a href={chatGPTSignOutPath("/", user.authProvider)} aria-label="Odhlásiť">
                    <span className={styles.logoutText}>Odhlásiť</span>
                    <span className={styles.logoutSymbol} aria-hidden="true">↪</span>
                  </a>
                </div>
              </div>
            </header>
            <div className={styles.workspaceMain}>
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
              </footer>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
