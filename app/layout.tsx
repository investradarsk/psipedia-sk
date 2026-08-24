import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { CookieConsent } from "@/components/cookie-consent";
import { getHeaderSearchIndex } from "@/lib/portal-search";
import { getNavigationItems } from "@/lib/navigation-store";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/seo";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  title: {
    default: "Psipedia.sk – rozumej svojmu psovi",
    template: "%s | Psipedia.sk",
  },
  description: `${SITE_DESCRIPTION} Slovenská psia encyklopédia pre každý deň.`,
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
    description: "Overené súvislosti a praktické návody pre lepší život so psom.",
    images: [{ url: "/images/hero-labrador.webp", width: 1536, height: 1024, alt: "Čierny labrador na lúke" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Psipedia.sk – rozumej svojmu psovi",
    description: "Praktické návody pre lepší život so psom.",
    images: ["/images/hero-labrador.webp"],
  },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [searchIndex, navigationItems] = await Promise.all([getHeaderSearchIndex(), getNavigationItems()]);

  return (
    <html lang="sk">
      <head>
        <meta
          name="robots"
          content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
        />
      </head>
      <body>
        <SiteHeader searchIndex={searchIndex} navigationItems={navigationItems} />
        {children}
        <SiteFooter />
        <CookieConsent />
      </body>
    </html>
  );
}
