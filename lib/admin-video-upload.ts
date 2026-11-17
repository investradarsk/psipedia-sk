"use client";
import {MAX_FACEBOOK_VIDEO_BYTES} from "@/lib/facebook-video";

export type FacebookVideoUpload={imageUrl:string;imageKey:string;filename:string;storedBytes:number};
export async function uploadFacebookVideo(file:File):Promise<FacebookVideoUpload>{
  const extension=file.name.split(".").pop()?.toLowerCase();
  const declared=file.type|| (extension==="mov"?"video/quicktime":extension==="mp4"?"video/mp4":"");
  if(!((extension==="mp4"&&declared==="video/mp4")||
    (extension==="mov"&&declared==="video/quicktime")))
    throw new Error("Použi video MP4 alebo MOV.");
  if(!file.size||file.size>MAX_FACEBOOK_VIDEO_BYTES)
    throw new Error("Video musí mať najviac 50 MB. Väčší súbor najprv skomprimuj.");
  const response=await fetch("/api/admin/facebook-images/video-upload",{
    method:"POST",
    headers:{"content-type":declared,"x-file-name":encodeURIComponent(file.name.slice(0,160))},
    body:file,
  });
  const result=await response.json().catch(()=>({})) as Partial<FacebookVideoUpload>&{error?:string};
  if(!response.ok||!result.imageKey||!result.imageUrl)
    throw new Error(result.error||"Video sa nepodarilo nahrať.");
  return {imageKey:result.imageKey,imageUrl:result.imageUrl,
    filename:result.filename||file.name,storedBytes:result.storedBytes||file.size};
}
