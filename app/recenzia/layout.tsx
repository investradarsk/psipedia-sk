import type { Metadata } from "next";
import "./review-auth.css";

export const metadata: Metadata = {
  title: "Prístup k profilovej recenzii",
  description: "Bezpečné overenie e-mailu pre napísanie profilovej recenzie na Psipedia.sk.",
  robots: { index: false, follow: false },
};

export default function ReviewAuthorLayout({ children }: { children: React.ReactNode }) {
  return children;
}
