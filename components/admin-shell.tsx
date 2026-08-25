import Link from "next/link";
import type { ReactNode } from "react";
import { chatGPTSignOutPath, type ChatGPTUser } from "@/app/chatgpt-auth";
import { PawMark } from "./icons";

export function AdminShell({
  user,
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  user: ChatGPTUser;
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main id="obsah" className="admin-root">
      <div className="admin-shell shell">
        <header className="admin-topbar">
          <Link href="/admin" className="admin-brand" aria-label="Psipedia redakcia – prehľad">
            <span><PawMark size={23} /></span>
            <strong>Psipedia</strong>
            <small>redakcia</small>
          </Link>
          <div className="admin-account">
            <span>
              <small>Prihlásený používateľ</small>
              <strong>{user.displayName}</strong>
            </span>
            <a href={chatGPTSignOutPath("/", user.authProvider)}>Odhlásiť</a>
          </div>
        </header>

        <nav className="admin-section-nav" aria-label="Redakčné moduly">
          <div className="admin-nav-group"><span>Obsah</span><div><Link href="/admin">Články</Link><Link href="/admin/steniatka">Šteniatka</Link><Link href="/admin/plemena">Plemená</Link><Link href="/admin/sekcie">Sekcie</Link></div></div>
          <div className="admin-nav-group"><span>Komunita</span><div><Link href="/admin/tipy">Tipy</Link><Link href="/admin/hodnotenia">Hodnotenia</Link><Link href="/admin/dopyty">Dopyty</Link></div></div>
          <div className="admin-nav-group"><span>Portál</span><div><Link href="/admin/podujatia">Podujatia</Link><Link href="/admin/adresar">Adresár</Link><Link href="/admin/pomoc">Pomoc</Link></div></div>
          <div className="admin-nav-group"><span>Nastavenia</span><div><Link href="/admin/navigacia">Navigácia</Link><Link href="/admin/pravne">Právne</Link><Link href="/admin/import">Import</Link></div></div>
          <div className="admin-nav-public"><Link href="/adresar" target="_blank" rel="noreferrer">Adresár ↗</Link><Link href="/pomoc-psom" target="_blank" rel="noreferrer">Pomoc ↗</Link></div>
        </nav>

        <div className="admin-heading">
          <div>
            <span className="admin-eyebrow">{eyebrow}</span>
            <h1>{title}</h1>
            {description && <p>{description}</p>}
          </div>
          {actions && <div className="admin-heading-actions">{actions}</div>}
        </div>

        {children}

        <footer className="admin-footer">
          <span>Zmeny sa na verejnom webe ukážu až po publikovaní obsahu.</span>
          <a href="/" target="_blank" rel="noreferrer">Otvoriť Psipedia.sk ↗</a>
        </footer>
      </div>
    </main>
  );
}
