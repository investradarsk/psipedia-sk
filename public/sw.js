const ADMIN_FALLBACK = "/admin/operations";

function safeAdminPath(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return ADMIN_FALLBACK;
  try {
    const url = new URL(value, self.location.origin);
    if (url.origin !== self.location.origin) return ADMIN_FALLBACK;
    if (url.pathname !== "/admin" && !url.pathname.startsWith("/admin/")) return ADMIN_FALLBACK;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return ADMIN_FALLBACK;
  }
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = typeof payload.title === "string" ? payload.title.slice(0, 90) : "Psipedia — upozornenie";
  const body = typeof payload.body === "string" ? payload.body.slice(0, 180) : "V admine je nová položka na kontrolu.";
  const url = safeAdminPath(payload.url);
  const tag = typeof payload.tag === "string" ? payload.tag.slice(0, 80) : "psipedia-admin";

  event.waitUntil(self.registration.showNotification(title, {
    body,
    tag,
    icon: "/pwa/icon-192.png",
    badge: "/pwa/icon-192.png",
    data: { url },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = safeAdminPath(event.notification.data?.url);
  const target = new URL(path, self.location.origin).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => {
      try {
        const url = new URL(client.url);
        return url.origin === self.location.origin
          && (url.pathname === "/admin" || url.pathname.startsWith("/admin/"));
      } catch {
        return false;
      }
    });

    // Never force-navigate an existing Admin tab from the service worker.
    // It cannot see a dirty form or invoke the React unsaved-change guard.
    // Reuse only an already matching tab; otherwise open the notification
    // target in a separate client so unsaved drafts remain intact.
    const matching = windows.find((client) => client.url === target);
    if (matching) return matching.focus();
    try {
      const opened = await self.clients.openWindow(target);
      if (opened) return opened.focus();
    } catch (error) {
      console.warn("Admin push could not open a separate window.", error);
    }
    // If the platform forbids new windows (notably some installed iOS PWAs),
    // focus the current admin without changing its route or discarding edits.
    return existing ? existing.focus() : undefined;
  })());
});
