"use client";

import { useId, useState } from "react";
import { PartnerAuthForm } from "@/components/partner-auth-form";
import { PartnerPasswordAuthForm } from "@/components/partner-password-auth-form";

type Props = {
  mode: "register" | "login";
  siteKey: string;
  returnTo?: string | null;
};

type Method = "password" | "email";

export function PartnerAuthMethodSwitcher({ mode, siteKey, returnTo = null }: Props) {
  const [method, setMethod] = useState<Method>("password");
  const id = useId();
  const panelId = id + "-method-panel";

  return (
    <div className="partner-auth-method-selector">
      <div className="partner-auth-method-tabs" role="group" aria-label="Spôsob prihlásenia">
        <button type="button" aria-pressed={method === "password"} aria-controls={panelId}
          onClick={() => setMethod("password")}>Heslo</button>
        <button type="button" aria-pressed={method === "email"} aria-controls={panelId}
          onClick={() => setMethod("email")}>E-mailový odkaz</button>
      </div>
      <div id={panelId}>
        {method === "password" ? (
          <PartnerPasswordAuthForm mode={mode} siteKey={siteKey} returnTo={returnTo} />
        ) : (
          <>
            <p className="partner-auth-method-description">
              {mode === "login"
                ? "Pošleme vám jednorazový prihlasovací odkaz platný 15 minút."
                : "Ak nechcete používať heslo, môžete sa zaregistrovať jednorazovým odkazom na e-mail."}
            </p>
            <PartnerAuthForm mode={mode} siteKey={siteKey} returnTo={returnTo} />
          </>
        )}
      </div>
    </div>
  );
}
