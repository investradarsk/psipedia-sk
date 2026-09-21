import type { Metadata } from "next";
import "./partner.css";

export const metadata: Metadata = {
  title: "Partner účet",
  description: "Bezpečný Partner účet pre firemné a organizačné profily na Psipedii.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function PartnerLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>;
}
