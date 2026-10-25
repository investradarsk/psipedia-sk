"use client";
import {AdminGalleryDropzone} from "@/components/admin-gallery-dropzone";
export function AdminSingleImageUpload({label,onFile,disabled=false,busy=false,onRejected}:{
  label:string;onFile:(file:File)=>void|Promise<void>;disabled?:boolean;busy?:boolean;
  onRejected?:(message:string)=>void;
}){
  return <AdminGalleryDropzone label={label} multiple={false}
    disabled={disabled} busy={busy} onRejected={onRejected}
    onFiles={files=>{const file=files[0];if(file)void onFile(file);}}/>;
}
