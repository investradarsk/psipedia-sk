import {env} from "cloudflare:workers";
import {getAdminApiUser,requireAdminMutation,unauthorizedAdminResponse} from "@/lib/admin-auth";
import {facebookImageDb,requireFacebookImageSchema,FacebookImageSchemaUnavailable} from "@/lib/facebook-image-store";
import {MAX_FACEBOOK_VIDEO_BYTES} from "@/lib/facebook-video";

export const dynamic="force-dynamic";
type Bindings={BUCKET?:R2Bucket};
const decoder=new TextDecoder();

export async function POST(request:Request){
  const user=await getAdminApiUser();
  if(!user)return unauthorizedAdminResponse();
  const auth=await requireAdminMutation(request);
  if(auth.response)return auth.response;
  const bucket=(env as unknown as Bindings).BUCKET;
  if(!bucket)return Response.json({error:"Úložisko videí nie je dostupné."},{status:503});
  try{
    await requireFacebookImageSchema(facebookImageDb());
    const mime=request.headers.get("content-type")?.split(";",1)[0]?.trim().toLowerCase();
    if(mime!=="video/mp4"&&mime!=="video/quicktime")
      return Response.json({error:"Použi MP4 alebo MOV."},{status:415});
    const sizeHeader=request.headers.get("content-length");
    if(sizeHeader&&Number(sizeHeader)>MAX_FACEBOOK_VIDEO_BYTES)
      return Response.json({error:"Video môže mať najviac 50 MB."},{status:413});
    const data=await request.arrayBuffer();
    if(data.byteLength===0)return Response.json({error:"Vyber video."},{status:400});
    if(data.byteLength>MAX_FACEBOOK_VIDEO_BYTES)
      return Response.json({error:"Video môže mať najviac 50 MB."},{status:413});
    const bytes=new Uint8Array(data);
    // MP4/MOV container's first box must be ftyp (not just a renamed file).
    const brand=bytes.length>=12?decoder.decode(bytes.subarray(8,12)):"";
    const ftyp=bytes.length>=12&&decoder.decode(bytes.subarray(4,8))==="ftyp";
    const isQuickTime=brand==="qt  ";
    if(!ftyp||(mime==="video/quicktime"&&!isQuickTime)||
      (mime==="video/mp4"&&isQuickTime))
      return Response.json({error:"Obsah súboru nie je platné video MP4/MOV."},{status:415});
    const ext=isQuickTime?"mov":"mp4";
    const originalName=(()=>{try{return decodeURIComponent(request.headers.get("x-file-name")||"video."+ext).replace(/[\r\n]/g,"").slice(0,160);}
      catch{return "video."+ext;}})();
    const key=`facebook-images/${new Date().getUTCFullYear()}/${crypto.randomUUID()}.${ext}`;
    await bucket.put(key,data,{httpMetadata:{contentType:mime,
      cacheControl:"public, max-age=31536000, immutable"},
      customMetadata:{uploadedBy:user.email,originalName}});
    return Response.json({imageUrl:"/media/"+key,imageKey:key,filename:originalName,
      storedBytes:data.byteLength},{status:201});
  }catch(error){
    if(error instanceof FacebookImageSchemaUnavailable)
      return Response.json({error:error.message},{status:503});
    return Response.json({error:"Nahratie videa zlyhalo."},{status:500});
  }
}
