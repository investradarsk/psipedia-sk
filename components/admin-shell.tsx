import Link from "next/link";
import type { ReactNode } from "react";
import { chatGPTSignOutPath, type ChatGPTUser } from "@/app/chatgpt-auth";
import { loadAdminAttentionQueue } from "@/lib/admin-attention-queue-store";
import { summarizeAdminAttention } from "@/lib/admin-attention-queue";
import { PawMark } from "./icons";
import styles from "./admin-shell.module.css";

const ADMIN_NAV_GROUP_LABEL_STYLE = { color: "#60756c" } as const;

function AdminNavigation() {
  return (
    <nav className="admin-section-nav flex-wrap max-[760px]:flex-nowrap" aria-label="Redakčné moduly">
      <div className="admin-nav-group"><span style={ADMIN_NAV_GROUP_LABEL_STYLE}>Obsah</span><div><Link href="/admin">Články</Link><Link href="/admin/steniatka">Šteniatka</Link><Link href="/admin/plemena">Plemená</Link><Link href="/admin/sekcie">Sekcie</Link></div></div>
      <div className="admin-nav-group"><span style={ADMIN_NAV_GROUP_LABEL_STYLE}>Komunita</span><div><Link href="/admin/operations">Operácie</Link><Link href="/admin/tipy">Tipy</Link><Link href="/admin/hodnotenia">Hodnotenia</Link><Link href="/admin/dopyty">Dopyty</Link></div></div>
      <div className="admin-nav-group"><span style={ADMIN_NAV_GROUP_LABEL_STYLE}>Portál</span><div><Link href="/admin/podujatia">Podujatia</Link><Link href="/admin/meniny">Psie meniny</Link><Link href="/admin/adresar">Adresár</Link><Link href="/admin/adresar/navrhy">Návrhy úprav</Link><Link href="/admin/pomoc">Pomoc</Link><Link href="/admin/organizacie">Organizácie</Link><Link href="/admin/adopcie">Adopcie</Link><Link href="/admin/stratene-najdene">Stratené / nájdené</Link></div></div>
      <div className="admin-nav-group"><span style={ADMIN_NAV_GROUP_LABEL_STYLE}>Nastavenia</span><div><Link href="/admin/nastavenia">Aplikácia</Link><Link href="/admin/navigacia">Navigácia</Link><Link href="/admin/monetizacia">Monetizácia</Link><Link href="/admin/pravne">Právne</Link><Link href="/admin/import">Import</Link></div></div>
      <div className="admin-nav-public"><Link href="/adresar" target="_blank" rel="noreferrer">Adresár ↗</Link><Link href="/pomoc-psom" target="_blank" rel="noreferrer">Pomoc ↗</Link></div>
    </nav>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true" focusable="false">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

async function AdminNotificationBell({ count }: { count?: number }) {
  let activeCount = count;
  if (activeCount === undefined) {
    activeCount = summarizeAdminAttention(await loadAdminAttentionQueue()).active;
  }
  const label = activeCount === 0
    ? "Upozornenia: žiadne aktívne položky"
    : activeCount === 1
      ? "Upozornenia: 1 aktívna položka"
      : `Upozornenia: ${activeCount} aktívnych položiek`;

  return (
    <Link
      href="/admin/operations"
      className={styles.notificationLink}
      aria-label={label}
      title="Otvoriť centrum pozornosti"
      data-testid="admin-notification-bell"
    >
      <BellIcon />
      {activeCount > 0 && <span className={styles.badge} aria-hidden="true">{activeCount > 99 ? "99+" : activeCount}</span>}
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
}: {
  user: ChatGPTUser;
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  attentionCount?: number;
}) {
  return (
    <main id="obsah" className="admin-root">
      <div className="admin-shell shell">
        <header className="admin-topbar">
          <Link href="/admin" className="admin-brand" aria-label="Psipedia redakcia – prehľad"><span><PawMark size={23} /></span><strong>Psipedia</strong><small>redakcia</small></Link>
          <div className={styles.topbarActions}>
            <AdminNotificationBell count={attentionCount} />
            <div className="admin-account"><span><small>Prihlásený používateľ</small><strong>{user.displayName}</strong></span><a href={chatGPTSignOutPath("/", user.authProvider)}>Odhlásiť</a></div>
          </div>
        </header>
        <AdminNavigation />
        <div className="admin-heading"><div><span className="admin-eyebrow">{eyebrow}</span><h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="admin-heading-actions">{actions}</div>}</div>
        {children}
        <footer className="admin-footer"><span>Zmeny sa na verejnom webe ukážu až po publikovaní obsahu.</span><a href="/" target="_blank" rel="noreferrer">Otvoriť Psipedia.sk ↗</a></footer>
      </div>
    </main>
  );
}
