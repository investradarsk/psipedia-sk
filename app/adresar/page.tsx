import type { Metadata } from "next";
import { DirectoryPage } from "@/components/directory-page";
import { getPublishedDirectoryProfiles } from "@/lib/directory-store";
import { buildPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildPageMetadata({
  title: "Adresár psieho sveta",
  description: "Tréneri, psie školy, kluby, útulky, veterinári a ďalšie služby pre psov na Slovensku.",
  path: "/adresar",
});

export default async function DirectoryHomePage() {
  return <DirectoryPage profiles={await getPublishedDirectoryProfiles()} />;
}
