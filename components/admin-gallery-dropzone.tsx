"use client";
import {useDropzone} from "react-dropzone";
import styles from "./admin-gallery-dropzone.module.css";

/** Shared dropzone for canonical galleries, independent of their media metadata format. */
export function AdminGalleryDropzone({label,onFiles,disabled=false,busy=false,maxFiles,onRejected}:{
  label:string;
  onFiles:(files:File[])=>void|Promise<void>;
  disabled?:boolean;
  busy?:boolean;
  maxFiles?:number;
  onRejected?:(message:string)=>void;
}) {
  const {getRootProps,getInputProps,isDragActive}=useDropzone({
    accept:{"image/jpeg":[],"image/png":[],"image/webp":[],"image/avif":[]},
    multiple:true,
    disabled:disabled||busy,
    maxFiles,
    noDragEventsBubbling:true,
    onDrop:(files,rejections)=>{
      if(rejections.length){
        onRejected?.("Nepodporovaný súbor alebo príliš veľa fotografií. Použi JPG, PNG, WebP alebo AVIF.");
      }
      if(files.length)void onFiles(files);
    },
  });
  return <div {...getRootProps({
    className:"admin-upload-button "+styles.dropzone,
    role:"button",
    "aria-label":label,
    "aria-disabled":disabled||busy,
  })}>
    <input {...getInputProps()}/>
    {busy?"Nahrávam fotografie…":isDragActive?"Pusti fotografie do galérie":label+" — vybrať alebo pretiahnuť fotografie"}
  </div>;
}
