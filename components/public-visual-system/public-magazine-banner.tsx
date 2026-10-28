import Link from "next/link";
import { ArrowIcon } from "@/components/icons";
import styles from "./public-magazine-banner.module.css";

/** Approved compact homepage variant. Its DOM, links and responsive layout are unchanged. */
export function PublicMagazineBanner({
  title,
  description,
  label,
  href,
  testId,
}: {
  title: string;
  description: string;
  label: string;
  href: string;
  testId: string;
}) {
  return (
    <section className={["shell home-magazine-banner ps-public-banner-frame", styles.magazine].join(" ")} data-home-banner={testId} aria-label={title}>
      <div>
        <span className="eyebrow">Psipedia spája ľudí so psami</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <Link href={href} className="button button--dark">
        {label} <ArrowIcon size={18} />
      </Link>
    </section>
  );
}

