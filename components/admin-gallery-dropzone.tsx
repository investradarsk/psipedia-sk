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
  const {getRootProps,getInputProps,isDragActive,open}=useDropzone({
    noClick:true,
    noKeyboard:true,
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
  // The visually hidden file input is a sibling, not a nested interactive
  // descendant of role=button; axe and screen readers need both labeled.
  const locked=disabled||busy;
  return <>
    <div {...getRootProps({
      className:"admin-upload-button "+styles.dropzone,
      role:"button",
      tabIndex:locked?-1:0,
      "aria-label":label,
      "aria-disabled":locked,
      onClick:()=>{if(!locked)open();},
      onKeyDown:event=>{
        if(locked)return;
        if(event.key==="Enter"||event.key===" "){
          event.preventDefault();
          open();
        }
      },
    })}>
      {busy?"Nahrávam fotografie…":isDragActive?"Pusti fotografie do galérie":label+" — vybrať alebo pretiahnuť fotografie"}
    </div>
    <input {...getInputProps({"aria-label":label+" – súborový vstup"})}/>
  </>;
}
