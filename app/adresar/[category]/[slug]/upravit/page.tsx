import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DirectoryProfileChangeForm } from "@/components/directory-profile-change-form";
import { editableDirectoryProfileData, specializedChangeRequestFields } from "@/lib/directory-change-request";
import { getDirectoryCategory } from "@/lib/directory";
import { getPublishedDirectoryProfile } from "@/lib/directory-store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Navrhnúť úpravu profilu | Psipedia", robots: { index: false, follow: false } };
type Props = { params: Promise<{ category: string; slug: string }> };

export default async function DirectoryProfileChangePage({ params }: Props) {
  const { category, slug } = await params;
  const profile = await getPublishedDirectoryProfile(category, slug);
  const categoryInfo = getDirectoryCategory(category);
  if (!profile || !categoryInfo) notFound();
  return <main id="obsah" className="directory-change-page"><header className="directory-change-hero"><div className="shell"><nav className="article-breadcrumbs" aria-label="Navigácia"><Link href="/">Domov</Link><span>/</span><Link href="/adresar">Služby pre psov</Link><span>/</span><Link href={`/adresar/${profile.category}/${profile.slug}`}>{profile.name}</Link><span>/</span><span>Navrhnúť úpravu</span></nav><span className="eyebrow">Úprava profilu</span><h1>Navrhnúť úpravu profilu</h1><p>Skontrolujte predvyplnené údaje a pošlite redakcii iba potrebné zmeny. Verejný profil sa odoslaním nezmení.</p></div></header><div className="section shell"><DirectoryProfileChangeForm profile={{ id: profile.id, name: profile.name, slug: profile.slug, category: profile.category, categoryLabel: categoryInfo.label }} initialData={editableDirectoryProfileData(profile)} specializedFields={specializedChangeRequestFields[profile.category] ?? []} /></div></main>;
}
