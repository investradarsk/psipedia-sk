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
          <a href="/admin">Články a novinky</a>
          <a href="/admin/tipy">Tipy od čitateľov</a>
          <a href="/admin/podujatia">Podujatia</a>
          <a href="/admin/adresar">Adresár</a>
          <a href="/admin/dopyty">Dopyty</a>
          <a href="/admin/pomoc">Pomoc psom</a>
          <a href="/admin/pravne">Právne centrum</a>
          <a href="/adresar" target="_blank" rel="noreferrer">Verejný adresár ↗</a>
          <a href="/pomoc-psom" target="_blank" rel="noreferrer">Verejná pomoc ↗</a>
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
