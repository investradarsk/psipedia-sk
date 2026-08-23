import Link from "next/link";
import { chatGPTSignOutPath, getChatGPTUser } from "@/app/chatgpt-auth";

export default async function AdminDeniedPage() {
  const user = await getChatGPTUser();
  return (
    <main id="obsah" className="admin-denied">
      <div>
        <span>🔐</span>
        <p className="admin-eyebrow">Chránená redakcia</p>
        <h1>Tento účet nemá prístup</h1>
        <p>Administrácia je dostupná iba schválenému redakčnému účtu Psipedia.sk.</p>
        <div>
          <Link className="admin-primary-action" href={chatGPTSignOutPath("/admin", user?.authProvider)}>Prihlásiť sa iným účtom</Link>
          <Link href="/">Späť na web</Link>
        </div>
      </div>
    </main>
  );
}
