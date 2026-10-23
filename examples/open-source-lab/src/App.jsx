import React, { useMemo, useRef, useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import * as Dialog from "@radix-ui/react-dialog";
import { useReactTable, getCoreRowModel, flexRender, createColumnHelper } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useDropzone } from "react-dropzone";
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useForm } from "react-hook-form";
import { z } from "zod";
import Fuse from "fuse.js";
import { GripVertical, Search, Upload, Info, Check } from "lucide-react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import "./style.css";

// Developer-only laboratory; never reads or writes Psipedia's production data.
const rows = Array.from({length: 3000}, (_, i) => ({
  id: String(i + 1), name: ["Veterinár","Tréner","Salón","Podujatie"][i % 4] + " " + (i+1),
  category: ["Adresár","Výcvik","Služby","Kalendár"][i % 4]
}));
const column = createColumnHelper();
const columns = [
  column.accessor("id", {header: "ID", cell: c => c.getValue()}),
  column.accessor("name", {header: "Profil", cell: c => c.getValue()}),
  column.accessor("category", {header: "Kategória", cell: c => c.getValue()})
];
const schema = z.object({label:z.string().trim().min(2,"Zadaj aspoň 2 znaky").max(60)});
function SortablePhoto({file, onDelete}) {
  const {attributes,listeners,setNodeRef,transform,transition,isDragging}=useSortable({id:file.id});
  return <div ref={setNodeRef} className="photo" style={{transform:CSS.Transform.toString(transform),transition,opacity:isDragging ? 0.5 : 1}}>
    <button aria-label={"Presunúť " + file.name} type="button" {...attributes} {...listeners}><GripVertical size={20}/></button>
    <img src={file.url} alt={file.name}/><span>{file.name}</span>
    <button type="button" onClick={()=>onDelete(file.id)}>Odstrániť</button>
  </div>;
}
function LexicalPilot(){
  const config={namespace:"PsipediaOpenSourceLab",theme:{},onError:e=>{throw e}};
  return <LexicalComposer initialConfig={config}>
    <RichTextPlugin contentEditable={<ContentEditable aria-label="Experimentálny editor" className="lexical"/>}
      placeholder={<p className="placeholder">Skús napísať text. Nič sa neukladá.</p>}
      ErrorBoundary={LexicalErrorBoundary}/>
    <HistoryPlugin/>
  </LexicalComposer>;
}
function App(){
  const [query,setQuery]=useState("");
  const [photos,setPhotos]=useState([]);
  const [message,setMessage]=useState("");
  const scrollRef=useRef(null);
  const urls=useRef(new Set());
  useEffect(()=>()=>{for(const url of urls.current) URL.revokeObjectURL(url)},[]);
  const fuse=useMemo(()=>new Fuse(rows,{keys:["name","category"],threshold:0.3,ignoreLocation:true}),[]);
  const results=useMemo(()=>query.trim()?fuse.search(query.trim(),{limit:3000}).map(x=>x.item):rows,[fuse,query]);
  const table=useReactTable({data:results,columns,getCoreRowModel:getCoreRowModel(),getRowId:r=>r.id});
  const items=table.getRowModel().rows;
  const virtual=useVirtualizer({count:items.length,getScrollElement:()=>scrollRef.current,estimateSize:()=>40,overscan:8});
  const {register,handleSubmit,formState:{errors},reset}=useForm({defaultValues:{label:""}});
  function submit(input){const valid=schema.safeParse(input);if(!valid.success){setMessage(valid.error.issues[0].message);return}setMessage("Zod + React Hook Form: platné („"+valid.data.label+"“). Neukladá sa.");reset()}
  const onDrop=React.useCallback(files=>{
    setPhotos(prev=>[...prev,...files.slice(0,Math.max(0,8-prev.length)).map(file=>{
      const url=URL.createObjectURL(file);urls.current.add(url);
      return {id:crypto.randomUUID(),url,name:file.name};
    })]);
  },[]);
  const {getRootProps,getInputProps,isDragActive}=useDropzone({onDrop,accept:{"image/jpeg":[],"image/png":[],"image/webp":[]},maxSize:8*1024*1024});
  const sensors=useSensors(useSensor(PointerSensor),useSensor(KeyboardSensor,{coordinateGetter:sortableKeyboardCoordinates}));
  const removePhoto=id=>setPhotos(prev=>prev.filter(p=>{if(p.id===id){URL.revokeObjectURL(p.url);urls.current.delete(p.url);return false}return true}));
  return <main className="lab">
    <header><h1>Psipedia — laboratórium open source</h1><p>Len lokálne demo. Žiadne API, účet, synchronizácia ani uloženie do D1.</p></header>
    <section><h2>Tabuľky a vyhľadávanie</h2><p>TanStack Table + Virtual + Fuse.js + Lucide</p>
      <label className="search"><Search size={18}/><input aria-label="Hľadať" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Hľadaj aj s preklepom"/></label>
      <Dialog.Root><Dialog.Trigger>Informácie o teste <Info size={14}/></Dialog.Trigger>
        <Dialog.Portal><Dialog.Overlay className="overlay"/><Dialog.Content className="modal"><Dialog.Title>Radix UI dialóg</Dialog.Title>
          <Dialog.Description>Bezpečne ovládateľný klávesnicou, bez napojenia na admin.</Dialog.Description>
          <Dialog.Close>Zavrieť</Dialog.Close></Dialog.Content></Dialog.Portal>
      </Dialog.Root>
      <div className="table-head">{table.getHeaderGroups().map(h=><div key={h.id} className="data-row">
        {h.headers.map(c=><strong key={c.id}>{flexRender(c.column.columnDef.header,c.getContext())}</strong>)}</div>)}</div>
      <div className="virtual" ref={scrollRef} role="region" aria-label="Virtuálna tabuľka" tabIndex={0}>
        <div style={{height:virtual.getTotalSize(),position:"relative"}}>{virtual.getVirtualItems().map(v=>{
          const item=items[v.index];return <div className="data-row" key={item.id}
            style={{position:"absolute",top:0,transform:"translateY("+v.start+"px)",height:v.size,width:"100%"}}>
            {item.getVisibleCells().map(c=><span key={c.id}>{flexRender(c.column.columnDef.cell,c.getContext())}</span>)}
          </div>;
        })}</div></div><small>{items.length} riadkov; do DOM sa kreslí len viditeľná časť</small></section>
    <section><h2>Formulár</h2><p>React Hook Form + Zod</p>
      <form onSubmit={handleSubmit(submit)}><input aria-label="Názov profilu" placeholder="Názov profilu" {...register("label")}/>
      <button type="submit"><Check size={16}/> Overiť</button></form>
      {errors.label?.message&&<p role="alert">{errors.label.message}</p>}{message&&<p role="status">{message}</p>}</section>
    <section><h2>Obrázky a poradie</h2><p>React Dropzone + dnd-kit</p>
      <div {...getRootProps({className:"dropzone"})}><input {...getInputProps()}/><Upload size={20}/>
        {isDragActive?"Pusti fotografie":"Presuň fotografie alebo klikni (max. 8, 8 MB/fotografia)"}</div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={({active,over})=>{
        if(over&&active.id!==over.id)setPhotos(prev=>arrayMove(prev,prev.findIndex(p=>p.id===active.id),prev.findIndex(p=>p.id===over.id)));
      }}><SortableContext items={photos.map(p=>p.id)} strategy={verticalListSortingStrategy}>
        {photos.map(p=><SortablePhoto key={p.id} file={p} onDelete={removePhoto}/>)}
      </SortableContext></DndContext></section>
    <section><h2>Rich-text pilot</h2><p>Lexical. Žiadna konverzia existujúcich článkov, žiadny zápis.</p>
      <LexicalPilot/></section>
  </main>;
}
createRoot(document.getElementById("root")).render(<App/>);
