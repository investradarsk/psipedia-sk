import Link from "next/link";
import type { FciGroup } from "@/lib/content";
import type { ManagedBreedIndexItem } from "@/lib/breed-store";

type BreedCrawlIndexProps = {
  breeds: ManagedBreedIndexItem[];
  groups: FciGroup[];
};

type BreedCrawlGroup = {
  number: number;
  label: string;
  breeds: ManagedBreedIndexItem[];
};

function crawlGroups(breeds: ManagedBreedIndexItem[], groups: FciGroup[]): BreedCrawlGroup[] {
  const labels = new Map(groups.map((group) => [group.number, group.label]));
  const grouped = new Map<number, ManagedBreedIndexItem[]>();

  for (const breed of breeds) {
    const items = grouped.get(breed.fciGroup) ?? [];
    items.push(breed);
    grouped.set(breed.fciGroup, items);
  }

  return [...grouped.entries()]
    .sort(([first], [second]) => first - second)
    .map(([number, items]) => ({
      number,
      label: labels.get(number) ?? items[0]?.group ?? `FCI skupina ${number}`,
      breeds: [...items].sort((first, second) => first.name.localeCompare(second.name, "sk")),
    }));
}

/**
 * Compact server-rendered crawl path for every published canonical breed.
 *
 * The interactive browser intentionally keeps its card load-more UX. This index
 * stays lightweight (text links only) so crawlers and users can reach every
 * detail through ordinary HTML anchors without rendering hundreds of cards.
 */
export function BreedCrawlIndex({ breeds, groups }: BreedCrawlIndexProps) {
  const groupedBreeds = crawlGroups(breeds, groups);

  if (groupedBreeds.length === 0) return null;

  return (
    <section className="breed-crawl-index" aria-labelledby="breed-crawl-index-title">
      <div className="breed-crawl-index-intro">
        <div>
          <span className="eyebrow">Kompletný index</span>
          <h2 id="breed-crawl-index-title">Všetky plemená v atlase</h2>
        </div>
        <p>
          Kompaktný prehľad podľa FCI skupín. Každé publikované plemeno má priamy odkaz na svoj profil.
        </p>
      </div>

      <details className="breed-crawl-index-details">
        <summary>Zobraziť všetky plemená ({breeds.length})</summary>
        <div className="breed-crawl-index-groups">
          {groupedBreeds.map((group) => (
            <section className="breed-crawl-group" key={group.number} aria-labelledby={`breed-crawl-group-${group.number}`}>
              <h3 id={`breed-crawl-group-${group.number}`}>
                FCI {group.number} · {group.label}
              </h3>
              <ul>
                {group.breeds.map((breed) => (
                  <li key={breed.slug}>
                    <Link href={`/plemena/${breed.slug}`}>{breed.name}</Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </details>
    </section>
  );
}
