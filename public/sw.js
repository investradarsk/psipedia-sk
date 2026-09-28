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

    if (existing) {
      if ("navigate" in existing && existing.url !== target) {
        try {
          await existing.navigate(target);
        } catch {
          // Focus the existing safe admin window even if navigation is unavailable.
        }
      }
      return existing.focus();
    }

    return self.clients.openWindow(target);
  })());
});
