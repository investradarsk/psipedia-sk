import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { AdminNavigationRecovery } from "@/components/admin-navigation-recovery";
import { AdminPwaRegistration } from "@/components/admin-pwa-registration";
import { AdminMobileDocumentNavigation } from "@/components/admin-mobile-document-navigation";
import { AdminQueryProvider } from "@/components/admin-query-provider";
// Legacy admin styles stay behind the admin route boundary.
import "./admin-root-extracted.css";
import "../navigation-hotfix.css";
import "./admin-legacy-scoped.css";
import "./admin-workspace.css";
import "./admin-unified-forms.css";
import "./admin-editorial-foundation.css";

export const viewport: Viewport = { themeColor: "#174b38" };

export const metadata: Metadata = {
  applicationName: "Psipedia Admin",
  title: { absolute: "Redakcia | Psipedia.sk" },
  manifest: "/manifest.webmanifest",
  icons: {
    apple: [{ url: "/pwa/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "Psipedia Admin",
    statusBarStyle: "default",
  },
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div data-admin-workspace>
      <nav aria-label="Preskočenie na obsah">
        <a className="admin-skip-link" href="#obsah">Preskočiť na obsah</a>
      </nav>
      <AdminQueryProvider>{children}</AdminQueryProvider>
      <Suspense fallback={null}><AdminNavigationRecovery /></Suspense>
      <AdminMobileDocumentNavigation />
      <AdminPwaRegistration />
    </div>
  );
}
