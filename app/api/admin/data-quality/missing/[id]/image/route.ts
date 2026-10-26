import { env } from "cloudflare:workers";
import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { qualityMissingCandidateKey } from "@/lib/data-quality-missing-hourly";

export const dynamic = "force-dynamic";

// Private preview. Unapproved R2 objects must never be accessible through public /media.
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
  const user=await getAdminApiUser();
  if(!user)return unauthorizedAdminResponse();
  const id=(await params).id;
  if(!/^[1-9][0-9]*$/.test(id)||!Number.isSafeInteger(Number(id)))
    return Response.json({error:"Neplatné ID návrhu."},{status:400});
  const bindings=env as unknown as {DB?:D1Database;BUCKET?:R2Bucket};
  if(!bindings.DB||!bindings.BUCKET)
    return Response.json({error:"Úložisko nie je dostupné."},{status:503});
  const row=await bindings.DB.prepare(
    "SELECT value FROM quality_missing_proposals WHERE id=? AND status='OPEN' AND field_group='image'"
  ).bind(Number(id)).first<{value:string}>();
  const key=row?qualityMissingCandidateKey(row.value):null;
  if(!key)return Response.json({error:"Obrázok sa nenašiel."},{status:404});
  const image=await bindings.BUCKET.get(key);
  if(!image)return Response.json({error:"Obrázok už nie je dostupný."},{status:404});
  const contentType=image.httpMetadata?.contentType??"application/octet-stream";
  if(!["image/jpeg","image/png","image/webp","image/avif"].includes(contentType))
    return Response.json({error:"Nepodporovaný formát obrázka."},{status:415});
  return new Response(image.body,{
    headers:{"Content-Type":contentType,"Cache-Control":"private, no-store",
      "X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'"},
  });
}
