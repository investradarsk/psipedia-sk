import type { Metadata, Viewport } from "next";
import { AdminPwaRegistration } from "@/components/admin-pwa-registration";

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
  return <>{children}<AdminPwaRegistration /></>;
}
