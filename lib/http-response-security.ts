/**
 * Attach the browser MIME-sniffing protection at the Worker boundary.
 * The Worker can return cached HTML, static assets, redirects and early
 * access errors before reaching the framework router, so route-local
 * security headers alone cannot cover every response.
 */
export function ensureNoSniffHeader(response: Response): Response {
  // Opaque/network-error and WebSocket upgrade responses cannot safely be
  // reconstructed as a normal Response and are never browser document assets.
  if (response.status === 0 || response.status === 101) return response;
  if (response.headers.get("x-content-type-options")?.trim().toLowerCase() === "nosniff") {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  // Preserve the original status, redirects, cache policy, cookies and body.
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
