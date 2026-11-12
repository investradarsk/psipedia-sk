import type { ReactNode } from "react";

// React 19 hoists route-owned stylesheets into <head> with precedence and
// suspends rendering until styles are ready. Unlike a Vite CSS import,
// this public file cannot be concatenated into the homepage's index CSS.
// Change the fingerprint whenever its contents change.
const BREED_STYLESHEET = "/styles/breed-reference-3f5dab25d000.css";

export default function BreedLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <link rel="stylesheet" href={BREED_STYLESHEET} precedence="high" />
      {children}
    </>
  );
}
