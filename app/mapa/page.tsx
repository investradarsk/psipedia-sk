import type { Metadata } from "next";
import { env } from "cloudflare:workers";
import Link from "next/link";
import { MapExperience } from "@/components/map/map-experience";
import { parseMapUiFilters } from "@/lib/map-public-ui";
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

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

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

export default async function MapPage({ searchParams }: Props) {
  const rawSearchParams = await searchParams;
  const initialFilters = parseMapUiFilters(rawSearchParams);
  const mapUiTestMode = process.env.MAP_UI_TEST_RENDERER === "1";
  const testMissingConfig = mapUiTestMode && rawSearchParams.__mapConfig === "missing";
  const runtimeLaunchEnv = mapLaunchEnvironment();
  const launchEnv = testMissingConfig
    ? { ...runtimeLaunchEnv, GOOGLE_MAPS_BROWSER_API_KEY: "", GOOGLE_MAPS_MAP_ID: "" }
    : runtimeLaunchEnv;
  const googleRendererEnabled = googleMapsRendererConfigured(launchEnv);
  const publicMapEnabled = publicMapLaunchEnabled(launchEnv);
  const googleApiKey = googleRendererEnabled ? launchEnv.GOOGLE_MAPS_BROWSER_API_KEY ?? "" : "";
  const googleMapId = googleRendererEnabled ? launchEnv.GOOGLE_MAPS_MAP_ID ?? "" : "";
  const testRenderer = mapUiTestMode && rawSearchParams.__mapRenderer !== "real";

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
        initialFilters={initialFilters}
        googleApiKey={googleApiKey}
        googleMapId={googleMapId}
        testRenderer={testRenderer}
        rendererEnabled={googleRendererEnabled}
      />

      <aside className={styles.providerDisclosure} aria-label="Informácie o mapovom podklade">
        Interaktívny mapový podklad poskytuje Google Maps a načíta sa až po tvojom výslovnom povolení.
        Používanie Google Maps podlieha{" "}
        <a href="https://maps.google.com/help/terms_maps/" target="_blank" rel="noreferrer">podmienkam Google Maps</a>
        {" "}a{" "}
        <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">zásadám ochrany súkromia Google</a>.
        Lokalizačné údaje Psipedie a rozhodnutia o ich verejnosti zostávajú v databáze Psipedie.
      </aside>
    </main>
  );
}
