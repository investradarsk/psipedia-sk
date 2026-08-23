import Link from "next/link";
import { chatGPTSignOutPath } from "@/app/chatgpt-auth";

export default function AdminDeniedPage() {
  return (
    <main id="obsah" className="admin-denied">
      <div>
        <span>🔐</span>
        <p className="admin-eyebrow">Chránená redakcia</p>
        <h1>Tento účet nemá prístup</h1>
        <p>Administrácia je dostupná iba schválenému redakčnému účtu Psipedia.sk.</p>
        <div>
          <Link className="admin-primary-action" href={chatGPTSignOutPath("/admin")}>Prihlásiť sa iným účtom</Link>
          <Link href="/">Späť na web</Link>
        </div>
      </div>
    </main>
  );
}
