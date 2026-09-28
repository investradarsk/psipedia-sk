import type { Metadata } from "next";
import Link from "next/link";
import { PawMark } from "@/components/icons";

export const metadata: Metadata = {
  title: "Stránka sa nenašla",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <main id="obsah" className="not-found">
      <div>
        <span><PawMark size={70} /></span>
        <h1>Táto stopa nikam nevedie</h1>
        <p>Stránka možno zmenila adresu alebo ešte len vzniká. Na domovskej stránke určite nájdeš inú užitočnú cestu.</p>
        <Link href="/" className="button button--dark">Späť na Psipediu</Link>
      </div>
    </main>
  );
}
