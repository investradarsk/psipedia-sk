"use client";

import { PublicActionButton } from "@/components/public-visual-system";
import styles from "./map-consent-state.module.css";

/** One consent prompt for the map and profile maps. Text content stays outside this gate. */
export function MapConsentState({
  onGrant,
  alternative,
  testId,
  alreadyGranted = false,
}: {
  onGrant: () => void;
  alternative: string;
  testId?: string;
  alreadyGranted?: boolean;
}) {
  return (
    <div className={styles.state} data-public-map-consent data-testid={testId}>
      <strong>{alreadyGranted ? "Zobraziť interaktívnu Google mapu?" : "Načítať interaktívnu Google mapu?"}</strong>
      <p>{alternative} {alreadyGranted ? "Mapu načítame až po kliknutí." : "Mapu načítame až po vašom povolení."}</p>
      <PublicActionButton type="button" onClick={onGrant}>
        {alreadyGranted ? "Zobraziť Google mapu" : "Povoliť Google Maps"}
      </PublicActionButton>
      <small>
        Použitím mapy súhlasíte s{" "}
        <a href="https://maps.google.com/help/terms_maps/" target="_blank" rel="noreferrer">
          podmienkami Google Maps
        </a>
        . Pozrite si{" "}
        <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">
          ochranu súkromia Google
        </a>
        .
      </small>
    </div>
  );
}
