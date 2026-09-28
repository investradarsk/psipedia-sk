import type { Metadata } from "next";
import "./review-auth.css";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function ReviewAuthorLayout({ children }: { children: React.ReactNode }) {
  return children;
}
