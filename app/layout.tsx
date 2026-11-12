import type { Metadata } from "next";
import { cookies } from "next/headers";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { NativeHistoryNavigation } from "@/components/native-history-navigation";
import { CookieConsent } from "@/components/cookie-consent";
import { ProgrammaticAdLoader } from "@/components/programmatic-ad-loader";
import { StructuredData } from "@/components/structured-data";
import { LazyBackToTop } from "@/components/lazy-back-to-top";
import { isValidGooglePublisherClientId } from "@/lib/monetization";
import { getNavigationItems } from "@/lib/navigation-store";
import { portalSections } from "@/lib/portal";
import { buildPublicHeaderNavigation } from "@/lib/public-header-navigation";
import { getPublicPartnerSession } from "@/lib/public-partner-session";
import { PARTNER_SESSION_COOKIE } from "@/lib/partner-auth-store";
import { buildSiteIdentityJsonLd, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/seo";
import "./globals.css";
import "./design-system.css";
import "./breed-hero-safe-zone.css";
import "./navigation-loading.css";


// The shared navigation is D1-backed. Keep the layout runtime-rendered; public
// anonymous HTML is cached at the Worker edge after a successful render.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  title: {
    default: "Psipedia.sk – rozumej svojmu psovi",
    template: "%s | Psipedia.sk",
  },
  description: SITE_DESCRIPTION,
  keywords: ["psy", "výcvik psa", "zdravie psa", "plemená psov", "starostlivosť o psa", "labrador"],
  authors: [{ name: "Redakcia Psipedia", url: "/o-nas" }],
  creator: "Redakcia Psipedia",
  publisher: SITE_NAME,
  category: "Psy a starostlivosť o zvieratá",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  verification: process.env.GOOGLE_SITE_VERIFICATION
    ? { google: process.env.GOOGLE_SITE_VERIFICATION }
    : undefined,
  alternates: {
    types: {
      "application/rss+xml": [{ url: "/feed.xml", title: "Psipedia.sk – nové články a novinky" }],
    },
  },
  openGraph: {
    type: "website",
    locale: "sk_SK",
    siteName: "Psipedia.sk",
    title: "Psipedia.sk – rozumej svojmu psovi",
    description: SITE_DESCRIPTION,
    images: [{ url: "/images/hero-labrador.webp", width: 1536, height: 1024, alt: "Čierny labrador na lúke" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Psipedia.sk – rozumej svojmu psovi",
    description: SITE_DESCRIPTION,
    images: ["/images/hero-labrador.webp"],
  },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Navigation is D1-backed while an optional partner session may require its
  // own lookup. Start both independently instead of adding their latencies.
  const navigationPromise = getNavigationItems();
  const jar = await cookies();
  const partnerToken = jar.get(PARTNER_SESSION_COOKIE)?.value;
  const [navigationRows, partnerSession] = await Promise.all([
    navigationPromise,
    partnerToken ? getPublicPartnerSession(partnerToken) : Promise.resolve(null),
  ]);
  const navigationItems = buildPublicHeaderNavigation(navigationRows, portalSections);
  const programmaticClientId = process.env.GOOGLE_ADSENSE_CLIENT_ID ?? "";
  const programmaticEnabled = process.env.PROGRAMMATIC_ADS_ENABLED === "true";
  const advertisingConsentEnabled = programmaticEnabled && isValidGooglePublisherClientId(programmaticClientId);

  return (
    <html lang="sk">
      <body>
        <StructuredData value={buildSiteIdentityJsonLd()} />
        <NativeHistoryNavigation />
        <SiteHeader navigationItems={navigationItems} partnerAuthenticated={Boolean(partnerSession)} />
        {children}
        <SiteFooter />
        <LazyBackToTop />
        <CookieConsent advertisingEnabled={advertisingConsentEnabled} />
        <ProgrammaticAdLoader enabled={advertisingConsentEnabled} clientId={programmaticClientId} />
      </body>
    </html>
  );
}
