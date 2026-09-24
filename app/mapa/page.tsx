import type { Metadata } from "next";
import { env } from "cloudflare:workers";
import Link from "next/link";
import { MapExperience } from "@/components/map/map-experience";
import { buildPageMetadata } from "@/lib/seo";
import { googleMapsRendererConfigured, publicMapLaunchEnabled } from "@/config/runtime-env";
import styles from "@/components/map/map-public.module.css";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  const launchEnabled = publicMapLaunchEnabled(mapLaunchEnvironment());
  return buildPageMetadata({
    title: "Mapa Psipedie",
    description: "Preskúmaj služby pre psov, organizácie a podujatia na jednej spoločnej mape Psipedie.",
    path: "/mapa",
    canonical: "/mapa",
    robots: launchEnabled
      ? undefined
      : {
          index: false,
          follow: false,
          googleBot: { index: false, follow: false },
        },
  });
}

type MapRuntimeBindings = {
  PUBLIC_MAP_ENABLED?: string;
  GOOGLE_MAPS_BROWSER_API_KEY?: string;
  GOOGLE_MAPS_MAP_ID?: string;
};

function mapLaunchEnvironment() {
  const bindings = env as unknown as MapRuntimeBindings;
  return {
    PUBLIC_MAP_ENABLED: bindings.PUBLIC_MAP_ENABLED ?? process.env.PUBLIC_MAP_ENABLED,
    GOOGLE_MAPS_BROWSER_API_KEY: bindings.GOOGLE_MAPS_BROWSER_API_KEY ?? process.env.GOOGLE_MAPS_BROWSER_API_KEY,
    GOOGLE_MAPS_MAP_ID: bindings.GOOGLE_MAPS_MAP_ID ?? process.env.GOOGLE_MAPS_MAP_ID,
  };
}

export default function MapPage() {
  const mapUiTestMode = process.env.MAP_UI_TEST_RENDERER === "1";
  const launchEnv = mapLaunchEnvironment();
  const googleRendererEnabled = googleMapsRendererConfigured(launchEnv);
  const publicMapEnabled = publicMapLaunchEnabled(launchEnv);
  const googleApiKey = googleRendererEnabled ? launchEnv.GOOGLE_MAPS_BROWSER_API_KEY ?? "" : "";
  const googleMapId = googleRendererEnabled ? launchEnv.GOOGLE_MAPS_MAP_ID ?? "" : "";

  return (
    <main id="obsah" className={styles.page}>
      <section className={styles.hero}>
        <div className={`shell public-shell ${styles.heroInner}`}>
          <div className={styles.heroCopy}>
            <span className="eyebrow">Služby, pomoc a dianie v okolí</span>
            <h1>Mapa Psipedie</h1>
            <p>
              Nájdite služby pre psov, organizácie a aktuálne podujatia podľa oblasti.
              Mapa zobrazuje iba verejné lokality schválené v Psipedii; pri citlivejších
              záznamoch môže ísť zámerne iba o približnú polohu.
            </p>
          </div>
          <nav className={styles.heroLinks} aria-label="Súvisiace sekcie Psipedie">
            <Link href="/adresar">Služby pre psov</Link>
            <Link href="/organizacie">Organizácie</Link>
            <Link href="/podujatia">Podujatia</Link>
            <Link href="/pomoc-psom">Pomoc psom</Link>
          </nav>
        </div>
      </section>

      <MapExperience
        googleApiKey={googleApiKey}
        googleMapId={googleMapId}
        testRendererEnvironment={mapUiTestMode}
        rendererEnabled={googleRendererEnabled}
      />

    </main>
  );
}
