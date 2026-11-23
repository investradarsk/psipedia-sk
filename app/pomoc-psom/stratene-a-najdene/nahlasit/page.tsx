import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Historical public submission URL. No new anonymous form is rendered.
 * Existing reports and moderation records remain unchanged in D1.
 */
export default async function LostFoundSubmissionPage({
  searchParams,
}: {
  searchParams: Promise<{ druh?: string | string[]; type?: string | string[] }>;
}) {
  const query = await searchParams;
  const kind = typeof query.druh === "string" ? query.druh
    : typeof query.type === "string" ? query.type : "";
  const target = "/partner/koncepty/novy?typ=LOST_FOUND_DOG"
    + (kind === "LOST" || kind === "FOUND" ? "&druh=" + kind : "");
  redirect(target);
}
