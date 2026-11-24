import type { ReactNode } from "react";

// This is the route-owned Premium Editorial directory styling used by public /adresar routes.
// Keeping it outside the shared Vinext CSS bundle removes it from the mobile
// homepage's render-blocking request without changing directory selectors.
export default function DirectoryLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <link
        rel="stylesheet"
        href="/styles/directory-cd5bd5dee982.css"
        precedence="high"
      />
      {children}
    </>
  );
}
