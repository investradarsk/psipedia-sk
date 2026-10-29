import type { Metadata } from "next";
import { env } from "cloudflare:workers";
import Link from "next/link";
import { MapExperience } from "@/components/map/map-experience";
import { Breadcrumbs } from "@/components/page-system";
import { UnifiedSectionHero, UnifiedSectionHeroShell } from "@/components/public-visual-system";
import { getSectionHeroVisual } from "@/lib/section-visual-store";
import { buildListingPageMetadata } from "@/lib/listing-seo";
import { googleMapsRendererConfigured, publicMapLaunchEnabled } from "@/config/runtime-env";
import styles from "@/components/map/map-public.module.css";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const launchEnabled = publicMapLaunchEnabled(mapLaunchEnvironment());
  const metadata = buildListingPageMetadata({
    title: "Mapa Psipedie",
    description: "Preskúmaj služby pre psov, organizácie a podujatia na jednej spoločnej mape Psipedie.",
    path: "/mapa",
    searchParams: await searchParams,
  });
  return launchEnabled
    ? metadata
    : {
        ...metadata,
        robots: {
          index: false,
          follow: false,
          googleBot: { index: false, follow: false },
        },
      };
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

export default async function MapPage() {
  const mapUiTestMode = process.env.MAP_UI_TEST_RENDERER === "1";
  const heroVisual = await getSectionHeroVisual("section.mapa");
  const launchEnv = mapLaunchEnvironment();
  const publicMapEnabled = publicMapLaunchEnabled(launchEnv);
  const googleRendererEnabled = publicMapEnabled && googleMapsRendererConfigured(launchEnv);
  const googleApiKey = googleRendererEnabled ? launchEnv.GOOGLE_MAPS_BROWSER_API_KEY ?? "" : "";
  const googleMapId = googleRendererEnabled ? launchEnv.GOOGLE_MAPS_MAP_ID ?? "" : "";

  return (
    <main id="obsah" className={styles.page}>
      <UnifiedSectionHeroShell>
        <UnifiedSectionHero
          breadcrumbs={<Breadcrumbs><Link href="/">Domov</Link><span>/</span><span>Mapa Psipedie</span></Breadcrumbs>}
          eyebrow="Objavujte miesta a podujatia"
          hideQuickLinks
          title="Mapa Psipedie"
          intro="Vyhľadajte služby, organizácie a podujatia vo svojom okolí. Pri citlivých záznamoch zobrazujeme iba približnú oblasť."
          visual={heroVisual}
        />
      </UnifiedSectionHeroShell>

      <MapExperience
        googleApiKey={googleApiKey}
        googleMapId={googleMapId}
        testRendererEnvironment={mapUiTestMode}
        rendererEnabled={googleRendererEnabled}
      />

    </main>
  );
}
