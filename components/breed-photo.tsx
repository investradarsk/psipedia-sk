"use client";
import { useState, type ImgHTMLAttributes } from "react";
import { PublicMediaFallback } from "@/components/public-visual-system";
import { responsiveMediaSrcSet } from "@/lib/responsive-media";
/** A deleted image or transient network error must never leave a broken-image icon. */
export function BreedPhoto(props:ImgHTMLAttributes<HTMLImageElement>) {
  const [failed,setFailed]=useState<string|null>(null);
  const detailFrame=props.className?.split(/\s+/).includes("breed-detail-image");
  const className=[props.className,detailFrame&&"media-frame media-frame--portrait"].filter(Boolean).join(" ");
  if(!props.src||failed===props.src)return <span className={`${className} breed-card-placeholder`} ><PublicMediaFallback size={detailFrame ? "detail" : "thumbnail"} label="Fotografia nie je dostupná" /></span>;
  return <img {...props} srcSet={props.srcSet ?? responsiveMediaSrcSet(props.src, [160, 320, 480, 640, 960, 1280])} sizes={props.sizes ?? "(max-width: 620px) 100vw, 50vw"} className={className} onError={()=>setFailed(String(props.src))}/>;
}
