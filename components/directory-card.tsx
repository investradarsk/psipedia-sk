import Link from "next/link";
import { ArrowIcon } from "@/components/icons";
import { directoryProfileHref, getDirectoryCategory, type PublicDirectoryProfile } from "@/lib/directory";

export function DirectoryCard({ profile }: { profile: PublicDirectoryProfile }) {
  const category = getDirectoryCategory(profile.category);
  const website = profile.websiteUrl && /^https?:\/\//i.test(profile.websiteUrl) ? profile.websiteUrl : null;
  const location = [profile.city, profile.district, profile.region].filter(Boolean).join(" · ");
  return (
    <article className={`directory-card${profile.featured ? " is-featured" : ""}`}>
      <Link className="directory-card-media" href={directoryProfileHref(profile)} aria-label={`Otvoriť profil ${profile.name}`}>
        {profile.imageUrl ? <img src={profile.imageUrl} alt={`Profil ${profile.name}`} /> : <span aria-hidden="true">{category?.icon ?? "🐾"}</span>}
        {profile.featured && <b>Odporúčame</b>}
      </Link>
      <div className="directory-card-body">
        <div className="directory-card-tags">
          <span>{category?.singular ?? "Služba pre psov"}</span>
        </div>
        <h3><Link href={directoryProfileHref(profile)}>{profile.name}</Link></h3>
        {profile.excerpt && <p>{profile.excerpt}</p>}
        {location && <div className="directory-card-location"><span aria-hidden="true">📍</span><span>{location}{profile.online ? " · aj online" : ""}</span></div>}
        {profile.services.length > 0 && <ul>{profile.services.slice(0, 4).map((service) => <li key={service}>{service}</li>)}</ul>}
        {profile.priceNote && <p className="directory-card-price"><strong>Orientačne:</strong> {profile.priceNote}</p>}
        <div className="directory-card-actions"><Link className="text-link" href={directoryProfileHref(profile)}>Profil a kontakt <ArrowIcon size={18} /></Link>{website && <a href={website} target="_blank" rel="noreferrer">Web ↗</a>}</div>
      </div>
    </article>
  );
}
