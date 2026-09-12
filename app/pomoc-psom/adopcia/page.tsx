import type { Metadata } from "next";
import Link from "next/link";
import { AdoptionCatalog } from "@/components/adoption-catalog";
import { getPublicAdoptions } from "@/lib/adoption-store";
import { getPublishedHelpCases } from "@/lib/help-store";
import { buildPageMetadata } from "@/lib/seo";
import { isAdoptionAgeCategory, isAdoptionSex, isAdoptionSize, isAdoptionSort, type AdoptionPublicFilters } from "@/lib/adoption";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
function truthy(value: string | undefined) { return value === "1" || value === "true" || value === "ano"; }

function parseFilters(params: Record<string, string | string[] | undefined>): AdoptionPublicFilters {
  const sex = first(params.pohlavie) || "";
  const size = first(params.velkost) || "";
  const age = first(params.vek) || "";
  const sort = first(params.radenie) || "";
  const statusValue = first(params.stav);
  return {
    q: first(params.q)?.trim() || "",
    region: first(params.kraj)?.trim() || "",
    sex: isAdoptionSex(sex) ? sex : "",
    size: isAdoptionSize(size) ? size : "",
    age: isAdoptionAgeCategory(age) ? age : "",
    children: truthy(first(params.deti)), dogs: truthy(first(params.psy)), cats: truthy(first(params.macky)),
    status: statusValue === "RESERVED" || statusValue === "ADOPTED" ? statusValue : "ACTIVE",
    sort: isAdoptionSort(sort) ? sort : "newest",
    page: Math.max(1, Number(first(params.strana)) || 1),
  };
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams;
  const hasFacet = Object.values(params).some((value) => value !== undefined && (Array.isArray(value) ? value.length : value.length));
  return buildPageMetadata({
    title: "Psy na adopciu",
    description: "Prehľad psov, ktoré hľadajú nový domov. Filtruj podľa kraja, veku, pohlavia, veľkosti a kompatibility.",
    path: "/pomoc-psom/adopcia",
    robots: hasFacet ? { index: false, follow: true } : undefined,
  });
}

export default async function AdoptionPage({ searchParams }: Props) {
  const filters = parseFilters(await searchParams);
  const [result, legacy] = await Promise.all([getPublicAdoptions(filters), getPublishedHelpCases("adopcia")]);
  return <main id="obsah">
    <AdoptionCatalog result={result} filters={filters} legacy={legacy} />
    <section className="shell" style={{ paddingBottom: "3rem" }}><p><Link href="/pomoc-psom">← Späť na Pomoc psom</Link></p></section>
  </main>;
}
