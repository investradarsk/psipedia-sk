import Link from 'next/link';
import { env } from 'cloudflare:workers';
import { AdminShell } from '@/components/admin-shell';
import { requireAdminPageUser } from '@/lib/admin-auth';
import { auditPublishedBreeds } from '@/lib/breed-audit';
export const dynamic='force-dynamic';
export default async function BreedAuditPage(){
  const user=await requireAdminPageUser('/admin/plemena/audit');
  const report=await auditPublishedBreeds(env.DB,env);
  return <AdminShell user={user} eyebrow="Atlas plemien" title="Audit údajov plemien" description="Kontrola aktuálnych údajov a obrázkov bez zmien v profiloch." actions={<Link href="/admin/plemena">Späť na plemená</Link>}>
    <p>Publikované záznamy: <strong>{report.publishedCount}</strong> · Verejné kanonické profily: <strong>{report.canonicalCount}</strong> · Dostupné obrázky: <strong>{report.verifiedImageCount}</strong></p>
    <p>{report.note}</p><p><a href="/api/admin/breeds/audit" download="audit-plemien.json">Stiahnuť audit v JSON</a></p>
    {report.issues.length ? <table><thead><tr><th>Profil</th><th>Problém</th><th>Hodnota</th></tr></thead><tbody>{report.issues.map((issue,index)=><tr key={index}><td>{issue.ids.map((id,i)=><div key={id}><Link href={`/admin/plemena/${id}`}>{issue.slugs[i]}</Link></div>)}</td><td>{issue.code}</td><td>{issue.value}</td></tr>)}</tbody></table>:<p>V kontrolovaných údajoch sa nenašli anomálie.</p>}
    {report.excludedPublished.length>0&&<><h2>Publikované záznamy vyradené z verejného atlasu</h2><ul>{report.excludedPublished.map(row=><li key={row.id}><Link href={`/admin/plemena/${row.id}`}>{row.slug}</Link></li>)}</ul></>}
  </AdminShell>;
}
