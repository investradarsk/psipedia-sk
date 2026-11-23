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
  const target = kind === "LOST" ? "/partner/koncepty/novy/strateny"
    : kind === "FOUND" ? "/partner/koncepty/novy/najdeny"
    : "/partner/koncepty/novy/nahlasit";
  redirect(target);
}
