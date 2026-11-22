export const dynamic = "force-dynamic";

/**
 * Retired after switching profile corrections to authorized Partner accounts.
 * Fail closed even when an old client or bookmarked email POSTs directly.
 * Historic outreach tokens remain valid for read-only guidance and opt-out.
 */
export async function POST() {
  return Response.json(
    { error: "Verejné návrhy úprav už neprijímame. Na správu profilu použite Partner účet." },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}
