import type { Metadata } from "next";
import { DirectoryPage } from "@/components/directory-page";
import { getPublishedDirectoryProfiles } from "@/lib/directory-store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Adresár psieho sveta",
  description: "Tréneri, psie školy, kluby, útulky, veterinári a ďalšie služby pre psov na Slovensku.",
  alternates: { canonical: "/adresar" },
};

export default async function DirectoryHomePage() {
  return <DirectoryPage profiles={await getPublishedDirectoryProfiles()} />;
}
