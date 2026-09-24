import Link from "next/link";
import type { PublicPartnerProfileManagementState } from "@/lib/partner-public-profile";
import styles from "./partner-public-ownership.module.css";

function ManagementContent({ state }: { state: PublicPartnerProfileManagementState }) {
  if (state.kind === "member") {
    return (
      <>
        <div>
          <h2>Tento profil spravujete cez Partner účet.</h2>
          <p>Zmeny verejných údajov odošlete na kontrolu priamo zo svojho Partner účtu.</p>
        </div>
        <div className={styles.actions}>
          {state.editHref ? <Link className={styles.primaryCta} href={state.editHref}>Upraviť profil</Link> : null}
          <Link className={styles.secondaryCta} href={state.accountHref}>Otvoriť Partner účet</Link>
        </div>
      </>
    );
  }

  if (state.kind === "pending") {
    return (
      <>
        <div>
          <h2>Žiadosť o správu profilu čaká na kontrolu.</h2>
          <p>Ďalšiu žiadosť netreba posielať. Stav nájdete vo svojom Partner účte.</p>
        </div>
        <div className={styles.actions}>
          <Link className={styles.primaryCta} href={state.requestHref}>Zobraziť stav žiadosti</Link>
        </div>
      </>
    );
  }

  if (state.kind === "rejected") {
    return (
      <>
        <div>
          <h2>Predchádzajúca žiadosť bola zamietnutá.</h2>
          <p>{state.hasDecisionNote ? "Dôvod nájdete v histórii žiadostí." : "Stav predchádzajúcej žiadosti nájdete vo svojom Partner účte."}</p>
        </div>
        <div className={styles.actions}>
          <Link className={styles.primaryCta} href={state.claimHref}>Požiadať znova o správu profilu</Link>
          <Link className={styles.secondaryCta} href={state.requestHref}>{state.hasDecisionNote ? "Pozrieť dôvod" : "Zobraziť žiadosti"}</Link>
        </div>
      </>
    );
  }

  if (state.kind === "eligible") {
    return (
      <>
        <div>
          <h2>Spravujete tento profil?</h2>
          <p>Ak ste majiteľ alebo poverený správca, môžete požiadať o jeho správu cez Partner účet.</p>
        </div>
        <div className={styles.actions}>
          <Link className={styles.primaryCta} href={state.claimHref}>Požiadať o správu profilu</Link>
        </div>
      </>
    );
  }

  return (
    <>
      <div>
        <h2>Spravujete tento profil?</h2>
        <p>Správa základných údajov profilu je bezplatná. Prihláste sa do Partner účtu a požiadajte o jeho správu.</p>
      </div>
      <div className={styles.actions}>
        <Link className={styles.primaryCta} href={state.managementHref}>Spravovať tento profil</Link>
      </div>
    </>
  );
}

export function PartnerPublicOwnership({
  state,
  correctionHref,
}: {
  state: PublicPartnerProfileManagementState;
  correctionHref: string;
}) {
  return (
    <aside className={styles.wrap} aria-label="Správa a oprava profilu">
      <div className={styles.inner}>
        <section className={styles.management} aria-labelledby="partner-profile-management-heading">
          {state.verified ? (
            <span
              className={styles.verified}
              title="Psipedia overila oprávnenie Partnera spravovať tento profil. Nejde o odporúčanie služby ani platené zvýraznenie."
            >
              ✓ Overený správca
            </span>
          ) : null}
          <div className={styles.managementContent}>
            <ManagementContent state={state} />
          </div>
        </section>

        <section className={styles.correction} aria-labelledby="partner-profile-correction-heading">
          <div>
            <h3 id="partner-profile-correction-heading">Našli ste nesprávny údaj?</h3>
            <p>Opravu môže navrhnúť každý návštevník. Návrh opravy nevytvára právo spravovať profil.</p>
          </div>
          <Link className={styles.correctionCta} href={correctionHref}>Navrhnúť opravu údajov</Link>
        </section>
      </div>
    </aside>
  );
}
