"use client";

import { useState } from "react";

const FAVORITES_KEY = "psipedia-favorites";

export function PrivacyControls() {
  const [message, setMessage] = useState("");

  function clearDeviceData() {
    window.localStorage.removeItem(FAVORITES_KEY);
    window.dispatchEvent(new StorageEvent("storage", { key: FAVORITES_KEY }));
    setMessage("Obľúbené články boli z tohto zariadenia odstránené.");
  }

  return (
    <div className="privacy-controls">
      <button className="button button--dark" type="button" onClick={clearDeviceData}>Vymazať obľúbené z tohto zariadenia</button>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
