import Link from "next/link";
import { ArrowIcon } from "@/components/icons";
import { directoryProfileHref, getDirectoryCategory, type PublicDirectoryProfile } from "@/lib/directory";

export function DirectoryCard({ profile }: { profile: PublicDirectoryProfile }) {
  const category = getDirectoryCategory(profile.category);
  return (
    <article className={`directory-card${profile.featured ? " is-featured" : ""}`}>
      <Link className="directory-card-media" href={directoryProfileHref(profile)} aria-label={`Otvoriť profil ${profile.name}`}>
        {profile.imageUrl ? <img src={profile.imageUrl} alt="" /> : <span aria-hidden="true">{category?.icon ?? "🐾"}</span>}
        {profile.featured && <b>Odporúčame</b>}
      </Link>
      <div className="directory-card-body">
        <div className="directory-card-tags">
          <span>{category?.singular ?? category?.label}</span>
          {profile.verified && <b>✓ Overený profil</b>}
        </div>
        <h3><Link href={directoryProfileHref(profile)}>{profile.name}</Link></h3>
        <p>{profile.excerpt}</p>
        <div className="directory-card-location"><span aria-hidden="true">📍</span><span>{profile.city} · {profile.region}{profile.online ? " · aj online" : ""}</span></div>
        {profile.services.length > 0 && <ul>{profile.services.slice(0, 3).map((service) => <li key={service}>{service}</li>)}</ul>}
        <Link className="text-link" href={directoryProfileHref(profile)}>Profil a kontakt <ArrowIcon size={18} /></Link>
      </div>
    </article>
  );
}
