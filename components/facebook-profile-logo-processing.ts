/**
 * Local, reversible editing helpers. Never uploads or changes the profile's
 * original image. White-background removal affects only edge-connected white.
 */
import type {ProfileLogoOptions} from "./facebook-profile-intro-layout";

function scaledCanvas(bitmap:ImageBitmap,maxSide=1400){
  const scale=Math.min(1,maxSide/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));
  canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const ctx=canvas.getContext("2d",{willReadFrequently:true});
  if(!ctx)throw Error("Nie je dostupný grafický editor.");
  ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  return {canvas,ctx};
}
export async function removeEdgeWhite(bitmap:ImageBitmap):Promise<ImageBitmap>{
  const {canvas,ctx}=scaledCanvas(bitmap);
  const w=canvas.width,h=canvas.height;
  const image=ctx.getImageData(0,0,w,h),pixels=image.data;
  const visited=new Uint8Array(w*h);
  const queue=new Int32Array(w*h);
  let start=0,end=0;
  const white=(i:number)=>{
    const p=i*4;
    return pixels[p+3]>0&&pixels[p]>=246&&pixels[p+1]>=246&&pixels[p+2]>=246;
  };
  const push=(i:number)=>{
    if(visited[i]||!white(i))return;
    visited[i]=1;queue[end++]=i;
  };
  for(let x=0;x<w;x++){push(x);push((h-1)*w+x);}
  for(let y=0;y<h;y++){push(y*w);push(y*w+w-1);}
  while(start<end){
    const i=queue[start++],x=i%w,y=Math.floor(i/w);
    pixels[i*4+3]=0;
    if(x>0)push(i-1);
    if(x<w-1)push(i+1);
    if(y>0)push(i-w);
    if(y<h-1)push(i+w);
  }
  ctx.putImageData(image,0,0);
  return createImageBitmap(canvas);
}
export function suggestedLogoCrop(bitmap:ImageBitmap):Pick<ProfileLogoOptions,"cropLeft"|"cropRight"|"cropTop"|"cropBottom">{
  const {canvas,ctx}=scaledCanvas(bitmap,900);
  const {width:w,height:h}=canvas;
  const pixels=ctx.getImageData(0,0,w,h).data;
  let minX=w,minY=h,maxX=-1,maxY=-1;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    if(pixels[(y*w+x)*4+3]<22)continue;
    if(x<minX)minX=x;if(y<minY)minY=y;
    if(x>maxX)maxX=x;if(y>maxY)maxY=y;
  }
  if(maxX<0)return {cropLeft:0,cropRight:0,cropTop:0,cropBottom:0};
  const padX=w*.025,padY=h*.025;
  return {
    cropLeft:Math.min(45,Math.max(0,Math.floor((minX-padX)/w*100))),
    cropRight:Math.min(45,Math.max(0,Math.floor((w-1-maxX-padX)/w*100))),
    cropTop:Math.min(45,Math.max(0,Math.floor((minY-padY)/h*100))),
    cropBottom:Math.min(45,Math.max(0,Math.floor((h-1-maxY-padY)/h*100))),
  };
}
