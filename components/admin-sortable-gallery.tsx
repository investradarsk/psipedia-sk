"use client";
import {type ReactNode} from "react";
import {DndContext,KeyboardSensor,PointerSensor,closestCenter,useSensor,useSensors,type DragEndEvent} from "@dnd-kit/core";
import {SortableContext,useSortable,sortableKeyboardCoordinates,rectSortingStrategy} from "@dnd-kit/sortable";
import {CSS} from "@dnd-kit/utilities";
import {GripVertical} from "lucide-react";
import {gallerySortableIds} from "@/lib/admin-gallery-sortable-ids";

function SortRow({id,as:Tag,className,index,renderRow,disabled}:{
 id:string; as:"div"|"article"|"li"; className?:string; index:number; disabled:boolean;
 renderRow:(index:number,handle:ReactNode)=>ReactNode;
}){
 const {attributes,listeners,setNodeRef,setActivatorNodeRef,transform,transition,isDragging}=useSortable({id,disabled});
 const handle=<button type="button" ref={setActivatorNodeRef} disabled={disabled}
  aria-label={`Presunúť fotografiu ${index+1} potiahnutím alebo klávesnicou`}
  style={{minHeight:44,minWidth:44,touchAction:"none",cursor:"grab"}}
  {...attributes} {...listeners}><GripVertical size={17} aria-hidden="true"/></button>;
 return <Tag ref={setNodeRef} className={className} style={{
   transform:CSS.Transform.toString(transform),transition,
   ...(isDragging?{position:"relative" as const,zIndex:1,opacity:.65}:{})
 }}>{renderRow(index,handle)}</Tag>;
}

/** Only reorder gallery entries. Owners keep all alt/caption/credit/imageKey fields. */
export function AdminSortableGallery({urls,onReorder,renderRow,as="div",className,rowClassName,disabled=false}:{
 urls:string[];
 onReorder:(from:number,to:number)=>void;
 renderRow:(index:number,handle:ReactNode)=>ReactNode;
 as?:"div"|"article"|"li";
 className?:string;
 rowClassName?:string;
 disabled?:boolean;
}){
 // Stable across reorders: preserve focus and sortable sensor identity.
 const ids=gallerySortableIds(urls);
 const sensors=useSensors(
   useSensor(PointerSensor,{activationConstraint:{distance:6}}),
   useSensor(KeyboardSensor,{coordinateGetter:sortableKeyboardCoordinates})
 );
 function onDragEnd(event:DragEndEvent){
   if(disabled||!event.over||event.active.id===event.over.id)return;
   const from=ids.indexOf(String(event.active.id)),to=ids.indexOf(String(event.over.id));
   if(from<0||to<0)return;
   onReorder(from,to);
 }
 return <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
   <SortableContext items={ids} strategy={rectSortingStrategy}>
     <div className={className}>{ids.map((id,index)=>
       <SortRow key={id} id={id} index={index} as={as} className={rowClassName}
         renderRow={renderRow} disabled={disabled}/>
     )}</div>
   </SortableContext>
 </DndContext>;
}
