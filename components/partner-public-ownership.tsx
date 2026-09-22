import Link from "next/link";
import styles from "./partner-public-ownership.module.css";

export function PartnerPublicOwnership({
  verified,
  claimHref,
}: {
  verified: boolean;
  claimHref: string;
}) {
  return (
    <aside className={styles.wrap} aria-label="Správa profilu">
      <div className={styles.inner}>
        <div>
          {verified ? (
            <span
              className={styles.verified}
              title="Psipedia overila oprávnenie Partnera spravovať tento profil. Nejde o odporúčanie služby ani platené zvýraznenie."
            >
              ✓ Overený správca
            </span>
          ) : null}
          <h2>Spravujete tento profil?</h2>
          <p>Správa základných údajov profilu je bezplatná. Po prihlásení môžete požiadať o jeho prevzatie.</p>
        </div>
        <Link className={styles.cta} href={claimHref}>Spravovať tento profil</Link>
      </div>
    </aside>
  );
}
