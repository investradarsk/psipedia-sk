/**
 * Browser-origin policy for credentialed Admin API mutations.
 *
 * Accepted: exact scheme/host/port Origin; or (for clients that omit Origin)
 * an explicit Sec-Fetch-Site: same-origin. Sec-Fetch-Site cross-site/same-site
 * is always rejected, even if Origin is forged. Requests without both signals
 * fail closed: no legacy Admin endpoint has a machine-authenticated exception.
 * This is independent of the identity check in requireAdminMutation().
 */
export function rejectUntrustedAdminMutationOrigin(request: Request): Response | null {
  const site = request.headers.get("sec-fetch-site");
  const origin = request.headers.get("origin");

  if (site !== null && site !== "same-origin" && site !== "none") {
    return Response.json({ error: "Cross-site požiadavka bola odmietnutá." }, { status: 403 });
  }

  // A browser with no Origin may still supply the unforgeable Fetch Metadata
  // same-origin signal. 'none' cannot authenticate a mutating navigation.
  if (origin === null) {
    return site === "same-origin"
      ? null
      : Response.json({ error: "Chýba dôveryhodný pôvod požiadavky." }, { status: 403 });
  }

  try {
    const parsed = new URL(origin);
    const target = new URL(request.url);
    if (
      (parsed.protocol !== "https:" && parsed.protocol !== "http:")
      || origin !== parsed.origin
      || parsed.origin !== target.origin
    ) {
      return Response.json({ error: "Neplatný origin." }, { status: 403 });
    }
  } catch {
    return Response.json({ error: "Neplatný origin." }, { status: 403 });
  }

  return null;
}
