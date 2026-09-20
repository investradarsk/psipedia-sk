"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./admin-pwa.module.css";

type PushUiState =
  | "loading"
  | "unsupported"
  | "not-configured"
  | "permission-not-granted"
  | "disabled"
  | "enabled"
  | "error";

type PushConfig = {
  enabled: boolean;
  configured: boolean;
  publicKey: string | null;
};

function base64UrlToUint8Array(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const raw = atob(padded);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function platformLabel() {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("iphone") || ua.includes("ipad")) return "iOS/iPadOS";
  if (ua.includes("android")) return "Android";
  if (ua.includes("edg/")) return "Edge desktop";
  if (ua.includes("chrome/")) return "Chrome desktop";
  if (ua.includes("safari/")) return "Safari";
  return "Web browser";
}

async function getRegistration() {
  const existing = await navigator.serviceWorker.getRegistration("/admin/");
  if (existing) return existing;
  return navigator.serviceWorker.register("/sw.js", { scope: "/admin/" });
}

export function AdminPwaSettings() {
  const [pushState, setPushState] = useState<PushUiState>("loading");
  const [config, setConfig] = useState<PushConfig | null>(null);
  const [message, setMessage] = useState("");
  const [standalone, setStandalone] = useState(false);
  const [ios, setIos] = useState(false);
  const [serviceWorkerSupported, setServiceWorkerSupported] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const [busy, setBusy] = useState(false);

  const inspect = useCallback(async () => {
    setMessage("");
    setStandalone(isStandalone());
    setIos(isIos());

    const hasServiceWorker = "serviceWorker" in navigator;
    const hasPushManager = "PushManager" in window;
    const hasNotifications = "Notification" in window;
    setServiceWorkerSupported(hasServiceWorker);
    setNotificationPermission(hasNotifications ? Notification.permission : "unsupported");

    if (!hasServiceWorker || !hasPushManager || !hasNotifications) {
      setPushState("unsupported");
      return;
    }

    try {
      const response = await fetch("/api/admin/push/config", {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Push konfiguráciu sa nepodarilo načítať.");
      const nextConfig = await response.json() as PushConfig;
      setConfig(nextConfig);
      if (!nextConfig.configured || !nextConfig.publicKey) {
        setPushState("not-configured");
        return;
      }

      if (Notification.permission !== "granted") {
        setPushState("permission-not-granted");
        return;
      }

      const registration = await getRegistration();
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        setPushState("disabled");
        return;
      }

      const statusResponse = await fetch("/api/admin/push/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ action: "status", endpoint: subscription.endpoint }),
      });
      if (!statusResponse.ok) throw new Error("Stav zariadenia sa nepodarilo overiť.");
      const status = await statusResponse.json() as { enabled?: boolean };
      setPushState(status.enabled ? "enabled" : "disabled");
    } catch (error) {
      setPushState("error");
      setMessage(error instanceof Error ? error.message : "Stav upozornení sa nepodarilo zistiť.");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void inspect();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [inspect]);

  async function enableNotifications() {
    if (!config?.publicKey || busy) return;
    setBusy(true);
    setMessage("");
    try {
      if (isIos() && !isStandalone()) {
        setMessage("Na iPhone/iPade najprv pridaj Psipedia admin na plochu cez Zdieľať → Pridať na plochu a otvor ho z ikony.");
        return;
      }

      const permission = Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission !== "granted") {
        setPushState("permission-not-granted");
        setMessage(permission === "denied"
          ? "Prehliadač upozornenia zablokoval. Povolenie zmeň v nastavení stránky alebo prehliadača."
          : "Upozornenia neboli povolené.");
        return;
      }

      const registration = await getRegistration();
      const current = await registration.pushManager.getSubscription();
      const subscription = current ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(config.publicKey),
      });
      const json = subscription.toJSON();
      if (!json.keys?.p256dh || !json.keys.auth) throw new Error("Prehliadač neposkytol push kľúče.");

      const response = await fetch("/api/admin/push/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          action: "enable",
          endpoint: subscription.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
          label: standalone ? "Psipedia admin app" : "Psipedia admin browser",
          platform: platformLabel(),
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "Zariadenie sa nepodarilo zaregistrovať.");
      }
      setPushState("enabled");
      setMessage("Upozornenia sú na tomto zariadení zapnuté.");
    } catch (error) {
      setPushState("error");
      setMessage(error instanceof Error ? error.message : "Upozornenia sa nepodarilo zapnúť.");
    } finally {
      setBusy(false);
    }
  }

  async function disableNotifications() {
    if (busy || !("serviceWorker" in navigator)) return;
    setBusy(true);
    setMessage("");
    try {
      const registration = await navigator.serviceWorker.getRegistration("/admin/");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        const response = await fetch("/api/admin/push/subscription", {
          method: "DELETE",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        if (!response.ok) throw new Error("Serverové upozornenia sa nepodarilo vypnúť.");
        await subscription.unsubscribe();
      }
      setPushState("disabled");
      setMessage("Upozornenia sú na tomto zariadení vypnuté.");
    } catch (error) {
      setPushState("error");
      setMessage(error instanceof Error ? error.message : "Upozornenia sa nepodarilo vypnúť.");
    } finally {
      setBusy(false);
    }
  }

  const stateLabel: Record<PushUiState, string> = {
    loading: "Zisťujem stav…",
    unsupported: "Tento prehliadač Web Push nepodporuje",
    "not-configured": "Push zatiaľ nie je nakonfigurovaný",
    "permission-not-granted": "Povolenie nebolo udelené",
    disabled: "Vypnuté na tomto zariadení",
    enabled: "Zapnuté na tomto zariadení",
    error: "Chyba pri overení stavu",
  };

  return (
    <div className={styles.settingsGrid} data-testid="admin-pwa-settings">
      <section className="admin-panel">
        <h2>Admin aplikácia</h2>
        <dl className={styles.statusList}>
          <div><dt>Režim</dt><dd>{standalone ? "Nainštalovaná aplikácia" : "V prehliadači"}</dd></div>
          <div><dt>Offline úpravy</dt><dd>Vypnuté</dd></div>
          <div><dt>Service worker</dt><dd>{serviceWorkerSupported ? "Podporovaný" : "Nepodporovaný"}</dd></div>
        </dl>
        {!standalone && (
          <div className={styles.installNote}>
            <strong>Nainštalovanie</strong>
            <p>
              {ios
                ? "Na iPhone/iPade použi Zdieľať → Pridať na plochu. Potom admin otváraj z ikony na ploche."
                : "Ak prehliadač ponúka inštaláciu webovej aplikácie, použi jeho menu alebo ikonu Inštalovať v paneli adresy."}
            </p>
          </div>
        )}
        <p className={styles.safetyNote}>Admin nikdy neukladá publikovanie ani iné redakčné zmeny do offline fronty.</p>
      </section>

      <section className="admin-panel">
        <h2>Upozornenia na tomto zariadení</h2>
        <p>Push používame iba na dôležité položky, ktoré vyžadujú pozornosť. Povolenie sa zobrazí až po tvojom kliknutí.</p>
        <dl className={styles.statusList}>
          <div><dt>Stav</dt><dd data-testid="push-state">{stateLabel[pushState]}</dd></div>
          <div><dt>Povolenie</dt><dd>{notificationPermission}</dd></div>
        </dl>

        <div className="admin-form-actions">
          {pushState !== "enabled" && pushState !== "unsupported" && pushState !== "not-configured" && (
            <button className="is-primary" type="button" onClick={enableNotifications} disabled={busy || !config?.publicKey}>
              {busy ? "Zapínam…" : "Zapnúť upozornenia na tomto zariadení"}
            </button>
          )}
          {pushState === "enabled" && (
            <button className="is-danger" type="button" onClick={disableNotifications} disabled={busy}>
              {busy ? "Vypínam…" : "Vypnúť upozornenia"}
            </button>
          )}
          <button type="button" onClick={() => void inspect()} disabled={busy}>Obnoviť stav</button>
        </div>
        {pushState === "not-configured" && (
          <p className={styles.infoNote}>Aplikácia funguje normálne aj bez push. Produkčné VAPID kľúče zatiaľ nie sú aktívne.</p>
        )}
        {message && <p className={styles.message} role="status" aria-live="polite">{message}</p>}
      </section>
    </div>
  );
}
