export const dynamic = "force-dynamic";

/**
 * Public correction proposals were retired in step 1/10. Fail closed for
 * bookmarked clients and direct API callers. The Partner claim/edit workflow
 * is the only supported route to changing a public service profile.
 */
export async function POST() {
  return Response.json(
    { error: "Verejné návrhy úprav už neprijímame. O správu profilu požiadajte cez Partner účet." },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}
