import type { ReactNode } from "react";
import "./breed-reference.css";

// Route-only CSS: the full breed atlas/editorial reference rules are not
// required on the homepage, articles or directory.
export default function BreedLayout({ children }: { children: ReactNode }) {
  return children;
}
