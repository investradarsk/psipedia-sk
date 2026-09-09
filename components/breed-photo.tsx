"use client";
import { useState, type ImgHTMLAttributes } from "react";
import { PawMark } from "./icons";
/** A deleted image or transient network error must never leave a broken-image icon. */
export function BreedPhoto(props:ImgHTMLAttributes<HTMLImageElement>) {
  const [failed,setFailed]=useState<string|null>(null);
  const detailFrame=props.className?.split(/\s+/).includes("breed-detail-image");
  const className=[props.className,detailFrame&&"media-frame media-frame--portrait"].filter(Boolean).join(" ");
  if(!props.src||failed===props.src)return <span className={`${className} breed-card-placeholder`} role="img" aria-label="Fotografia nie je dostupná"><PawMark size={48}/><small>Fotografia nie je dostupná</small></span>;
  return <img {...props} className={className} onError={()=>setFailed(String(props.src))}/>;
}
