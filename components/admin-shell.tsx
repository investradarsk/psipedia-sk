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
          <a href="/admin" className="admin-brand" aria-label="Psipedia redakcia – prehľad">
            <span><PawMark size={23} /></span>
            <strong>Psipedia</strong>
            <small>redakcia</small>
          </a>
          <div className="admin-account">
            <span>
              <small>Prihlásený používateľ</small>
              <strong>{user.displayName}</strong>
            </span>
            <a href={chatGPTSignOutPath("/", user.authProvider)}>Odhlásiť</a>
          </div>
        </header>

        <nav className="admin-section-nav" aria-label="Redakčné moduly">
          <Link href="/admin">Články a novinky</Link>
          <Link href="/admin/steniatka">Šteniatka</Link>
          <Link href="/admin/plemena">Plemená</Link>
          <Link href="/admin/sekcie">Sekcie</Link>
          <Link href="/admin/tipy">Tipy od čitateľov</Link>
          <Link href="/admin/podujatia">Podujatia</Link>
          <Link href="/admin/adresar">Adresár</Link>
          <Link href="/admin/dopyty">Dopyty</Link>
          <Link href="/admin/pomoc">Pomoc psom</Link>
          <Link href="/admin/navigacia">Navigácia</Link>
          <Link href="/admin/pravne">Právne centrum</Link>
          <Link href="/admin/import">Import dát</Link>
          <Link href="/adresar" target="_blank" rel="noreferrer">Verejný adresár ↗</Link>
          <Link href="/pomoc-psom" target="_blank" rel="noreferrer">Verejná pomoc ↗</Link>
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
