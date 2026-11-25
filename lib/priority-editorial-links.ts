import { env } from "cloudflare:workers";
import { boundInternalDiscoveryLinks, type InternalDiscoveryLink } from "./internal-discovery";

type PriorityLink = InternalDiscoveryLink & { profile?: { category: string; slug: string } };
type LinkDatabase = Pick<D1Database, "prepare">;

function directoryProfile(
  category: string,
  slug: string,
  label: string,
  description: string,
): PriorityLink {
  return { href: `/adresar/${category}/${slug}`, label, description, profile: { category, slug } };
}

const directory: PriorityLink = { href: "/adresar", label: "Adresár služieb pre psov" };
const breeds: PriorityLink = { href: "/plemena", label: "Atlas plemien psov" };
const events: PriorityLink = { href: "/podujatia", label: "Kalendár podujatí pre psov" };
const veterinarians: PriorityLink = {
  href: "/adresar/veterinari",
  label: "Veterinári podľa lokality",
};
const breeders: PriorityLink = {
  href: "/adresar/chovatelske-stanice",
  label: "Chovateľské stanice podľa plemena",
};
const primavet = directoryProfile(
  "veterinari",
  "veterinarna-klinika-primavet",
  "Veterinárna klinika PrimaVet",
  "Bratislava – Rača",
);
const canisArena = directoryProfile(
  "treneri",
  "canis-arena",
  "CANIS arena",
  "Rally obedience a ďalšie psie športy v Moste pri Bratislave",
);
const spiritas = directoryProfile(
  "dalsie-sluzby",
  "spiritas-krematorium-pre-psy-zilina",
  "Spiritas – krematórium pre psy",
  "Žilina – Mojšova Lúčka",
);
const emalera = directoryProfile(
  "chovatelske-stanice",
  "emalera",
  "Emalera",
  "Jack Russell teriéry, Skalica",
);
const abAstris = directoryProfile(
  "chovatelske-stanice",
  "ab-astris",
  "Ab Astris",
  "Čierne stredné bradáče, Bratislava",
);

const priorityLinks = new Map<string, readonly PriorityLink[]>([
  ["/starostlivost/kedy-ist-so-psom-k-veterinarovi", [veterinarians, primavet]],
  ["/aktivity/rally-obedience-so-psom-ako-zacat", [events, canisArena]],
  ["/steniatka/ako-vybrat-dobreho-chovatela", [breeds, breeders]],
  ["/aktivity/prva-vystava-psa-ako-pripravit-psa-aj-seba-na-vystavny-kruh", [events]],
  ["/plemena/teriery/jack-russell-terier", [emalera, breeders]],
  ["/plemena/pince-bradace-molosy-salasnicke/bradac", [abAstris, breeders]],
  ["/adresar/veterinari", [primavet, directory]],
  ["/adresar/treneri", [canisArena, events]],
  ["/adresar/dalsie-sluzby", [spiritas, directory]],
]);

async function publishedTargets(database: LinkDatabase, targets: readonly PriorityLink[]) {
  const profiles = targets.flatMap((link) => (link.profile ? [link.profile] : []));
  if (!profiles.length) return new Set<string>();

  const rows = await database
    .prepare(
      `
    SELECT d.category, d.slug
    FROM directory_profiles d
    LEFT JOIN directory_profile_seo seo ON seo.profile_id = d.id
    WHERE d.status = 'published' AND d.archived_at IS NULL
      AND COALESCE(seo.noindex, 0) = 0
      AND TRIM(COALESCE(seo.canonical_url, '')) IN (
        '', '/adresar/' || d.category || '/' || d.slug,
        'https://psipedia.sk/adresar/' || d.category || '/' || d.slug
      )
      AND (${profiles.map(() => "(d.category = ? AND d.slug = ?)").join(" OR ")})
  `,
    )
    .bind(...profiles.flatMap((profile) => [profile.category, profile.slug]))
    .all<{ category: string; slug: string }>();
  return new Set(rows.results.map(({ category, slug }) => `/adresar/${category}/${slug}`));
}

export async function listPriorityEditorialLinks(
  sourcePath: string,
  database: LinkDatabase | undefined = (env as unknown as { DB?: LinkDatabase }).DB,
) {
  const links = priorityLinks.get(sourcePath);
  if (!links) return [];

  const validProfiles = database
    ? await publishedTargets(database, links).catch((error: unknown) => {
        console.error("Priority editorial link targets unavailable", {
          sourcePath,
          error: error instanceof Error ? error.name : "UnknownError",
        });
        return new Set<string>();
      })
    : new Set<string>();

  return boundInternalDiscoveryLinks(
    links.flatMap(({ profile, ...link }) =>
      !profile || validProfiles.has(link.href) ? [link] : [],
    ),
    3,
  );
}
