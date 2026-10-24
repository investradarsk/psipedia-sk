import Link from "next/link";
import type { ReactNode } from "react";

/** Existing editorial CTA variant; global article selectors retain its approved presentation. */
export function PublicArticleCallout({
  text,
  href,
  buttonText,
  sponsored = false,
  newTab = false,
}: {
  text?: ReactNode;
  href: string;
  buttonText: string;
  sponsored?: boolean;
  newTab?: boolean;
}) {
  const rel = sponsored
    ? `sponsored nofollow${newTab ? " noreferrer" : ""}`
    : newTab
      ? "noreferrer"
      : undefined;
  return (
    <aside
      className={`article-block-cta ${sponsored ? "is-sponsored" : ""}`}
      data-public-article-callout
    >
      {(text || sponsored) && (
        <div>
          {sponsored && <span className="article-block-cta-disclosure">Partnerský odkaz</span>}
          {text && <p>{text}</p>}
        </div>
      )}
      <Link
        className="article-block-cta-button"
        href={href}
        target={newTab ? "_blank" : undefined}
        rel={rel}
      >
        {buttonText}
        <span aria-hidden="true">→</span>
        {newTab && <span className="sr-only"> (otvorí sa v novom okne)</span>}
      </Link>
    </aside>
  );
}
