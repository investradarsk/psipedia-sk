import { env } from "cloudflare:workers";
import { requirePartnerAccount } from "@/lib/partner-auth";
import { getPartnerDatabase } from "@/lib/partner-auth-store";
import { createPartnerPendingMedia, isPartnerMediaIntent, PartnerMediaError } from "@/lib/partner-media";
import { assertPartnerMutationOrigin, enforcePartnerMediaUploadRateLimit, PartnerSecurityError } from "@/lib/partner-security";
import { MAX_PRIVATE_IMAGE_BYTES } from "@/lib/private-media";

export const dynamic="force-dynamic";
type Bindings={DB?:D1Database;PII_HASH_KEY?:string};

export async function POST(request:Request){
  try{
    assertPartnerMutationOrigin(request);
    const identity=await requirePartnerAccount({cookieHeader:request.headers.get("cookie")});
    const contentType=request.headers.get("content-type")?.split(";",1)[0].trim().toLowerCase()??"";
    if(!["image/jpeg","image/png","image/webp"].includes(contentType))throw new PartnerMediaError("Použite obrázok JPG, PNG alebo WebP.",415);
    const intent=request.headers.get("x-media-intent");
    if(!isPartnerMediaIntent(intent))throw new PartnerMediaError("Neplatný účel obrázka.");
    const declared=Number(request.headers.get("content-length")||"0");
    if(declared>MAX_PRIVATE_IMAGE_BYTES)throw new PartnerMediaError("Obrázok môže mať najviac 8 MB.",413);
    const db=getPartnerDatabase((env as unknown as Bindings).DB);
    const hashKey=(env as unknown as Bindings).PII_HASH_KEY?.trim();
    if(!hashKey)throw new PartnerMediaError("Bezpečnostná konfigurácia nie je dostupná.",503);
    await enforcePartnerMediaUploadRateLimit({database:db,accountId:identity.accountId,hashKey});
    const buffer=await request.arrayBuffer();
    if(!buffer.byteLength)throw new PartnerMediaError("Vyberte obrázok na nahratie.");
    if(buffer.byteLength>MAX_PRIVATE_IMAGE_BYTES)throw new PartnerMediaError("Obrázok môže mať najviac 8 MB.",413);
    const media=await createPartnerPendingMedia({accountId:identity.accountId,intent,bytes:new Uint8Array(buffer),declaredMime:contentType,database:db});
    return Response.json({media},{status:201,headers:{"Cache-Control":"private, no-store"}});
  }catch(error){
    const status=error instanceof PartnerMediaError||error instanceof PartnerSecurityError?error.status:typeof (error as {status?:unknown})?.status==="number"?(error as {status:number}).status:503;
    return Response.json({error:status>=500?"Obrázok momentálne nie je možné nahrať.":error instanceof Error?error.message:"Nahratie zlyhalo."},{status,headers:{"Cache-Control":"private, no-store"}});
  }
}
