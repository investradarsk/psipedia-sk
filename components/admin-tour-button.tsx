"use client";

import { CircleHelp } from "lucide-react";
import { useState } from "react";
import styles from "./admin-tour-button.module.css";

/** Opt-in tutorial: never opens automatically or modifies admin data. */
export function AdminTourButton() {
  const [starting, setStarting] = useState(false);
  async function startTour() {
    if (starting) return;
    setStarting(true);
    try {
      // Driver is loaded only after an explicit user action, reducing admin JS.
      const { driver } = await import("driver.js");
      const tour = driver({
        showProgress: true,
        animate: true,
        allowClose: true,
        skipMissingElement: true,
        progressText: "{{current}} z {{total}}",
        nextBtnText: "Ďalej →",
        prevBtnText: "← Späť",
        doneBtnText: "Hotovo",
        closeBtnLabel: "Zavrieť sprievodcu",
        steps: [
          { popover: {
            title: "Vitaj v administrácii Psipedia",
            description: "Ukážem ti najdôležitejšie miesta. Nič neukladám ani neupravujem.",
          }},
          { element: "[data-admin-sidebar-shell]", popover: {
            title: "Hlavné sekcie",
            description: "Vľavo nájdeš články, plemená, adresár, automatizácie a nastavenia.",
            side: "right", align: "start",
          }},
          { element: "[data-admin-quick-nav-trigger]", popover: {
            title: "Vyhľadávanie v celom admine",
            description: "Napíš meno psa, veterinára, názov článku alebo funkciu. Funguje aj Ctrl + K.",
            side: "bottom", align: "start",
          }},
          { element: '[data-testid="admin-notification-bell"]', popover: {
            title: "Upozornenia",
            description: "Tu otvoríš pracovné upozornenia a záznamy vyžadujúce pozornosť.",
            side: "bottom", align: "end",
          }},
          { element: ".admin-heading", popover: {
            title: "Aktuálna agenda",
            description: "Nadpis ti hovorí, v ktorej časti pracuješ. Každá agenda má vlastné filtre a editor.",
            side: "bottom", align: "start",
          }},
          { popover: {
            title: "Hotovo!",
            description: "Teraz si môžeš otvoriť konkrétny profil. Sprievodcu spustíš znovu cez toto tlačidlo.",
          }},
        ],
      });
      tour.drive();
    } catch (error) {
      console.error("Admin tour unavailable", error);
    } finally {
      setStarting(false);
    }
  }
  return <button type="button" className={styles.button} onClick={() => void startTour()} disabled={starting} aria-label="Spustiť sprievodcu administráciou" data-admin-tour-trigger>
    <CircleHelp size={16} aria-hidden="true" />
    <span>{starting ? "Otváram…" : "Sprievodca"}</span>
  </button>;
}
