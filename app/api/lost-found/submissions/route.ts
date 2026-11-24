/**
 * Retired anonymous LOST/FOUND create endpoint.
 *
 * The historic moderation data, private reporter contacts and image records are
 * still readable by the existing Admin workflow. This endpoint must not accept
 * new anonymous writes even if an old HTML form or bot posts directly to it.
 * The replacement is the authenticated /api/partner/canonical-drafts workflow.
 */
export const dynamic = "force-dynamic";

export async function POST(_request: Request) {
  return Response.json(
    {
      error: "Na odoslanie hlásenia sa prihláste alebo zaregistrujte do Partner účtu.",
      code: "PARTNER_ACCOUNT_REQUIRED",
      partnerUrl: "/partner/koncepty/novy/nahlasit",
    },
    { status: 410, headers: { "Cache-Control": "private, no-store" } },
  );
}
