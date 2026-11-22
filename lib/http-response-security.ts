/**
 * Attach the browser MIME-sniffing protection at the Worker boundary.
 * The Worker can return cached HTML, static assets, redirects and early
 * access errors before reaching the framework router, so route-local
 * security headers alone cannot cover every response.
 */
export function ensureNoSniffHeader(response: Response): Response {
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
