import type { ReactNode } from "react";

// This is the historical Directory V1 styling used by public /adresar routes.
// Keeping it outside the shared Vinext CSS bundle removes it from the mobile
// homepage's render-blocking request without changing directory selectors.
export default function DirectoryLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <link
        rel="stylesheet"
        href="/styles/directory-146dc4e44713.css"
        precedence="high"
      />
      {children}
    </>
  );
}
