"use client";
import {forwardRef,useEffect,useImperativeHandle,useRef} from "react";
import Konva from "konva";
import type {GraphicCanvasHandle} from "./facebook-konva-canvas";

const W=1080,H=1350,GREEN="#073b2b",RED="#c93624",CREAM="#fff8ed";
type Props={name:string;category:string;logo:ImageBitmap|null};
const caption=(text:string,x:number,y:number,width:number,size:number,color:string,align:"left"|"center"="left")=>
  new Konva.Text({text,x,y,width,fontSize:size,fontFamily:"Arial",fontStyle:"bold",fill:color,align,wrap:"word",lineHeight:1.08,listening:false});
function paw(x:number,y:number,size:number,color:string){
  const group=new Konva.Group({x,y,scaleX:size/64,scaleY:size/64,listening:false});
  for(const [px,py,rx,ry,angle] of [[19,25,6,8,-26],[28,17,6,8,-8],[40,18,6,8,10],[48,27,6,8,28]])
    group.add(new Konva.Ellipse({x:px,y:py,radiusX:rx,radiusY:ry,rotation:angle,fill:color}));
  group.add(new Konva.Path({data:"M33.5 29c-9 0-16 8.6-16 16 0 5.4 4 8.5 9 8.5 2.7 0 4.6-1.7 7-1.7s4.3 1.7 7 1.7c5 0 9-3.1 9-8.5 0-7.4-7-16-16-16Z",fill:color}));
  return group;
}
export const FacebookProfileIntroCanvas=forwardRef<GraphicCanvasHandle,Props>(
  function FacebookProfileIntroCanvas({name,category,logo},ref){
    const host=useRef<HTMLDivElement>(null),viewport=useRef<HTMLDivElement>(null),stage=useRef<Konva.Stage|null>(null);
    useEffect(()=>{
      const v=viewport.current,h=host.current;if(!v||!h)return;
      const resize=()=>{const ratio=Math.min(1,v.clientWidth/W);h.style.transform="scale("+ratio+")";v.style.height=Math.round(H*ratio)+"px";};
      resize();const observer=new ResizeObserver(resize);observer.observe(v);return()=>observer.disconnect();
    },[]);
    useEffect(()=>{
      const root=host.current;if(!root)return;root.replaceChildren();
      const s=new Konva.Stage({container:root,width:W,height:H});stage.current=s;
      const layer=new Konva.Layer();s.add(layer);
      layer.add(new Konva.Rect({width:W,height:H,fill:CREAM,listening:false}));
      layer.add(new Konva.Circle({x:140,y:113,radius:64,fill:GREEN,listening:false}));
      layer.add(paw(99,73,84,"#ffffff"));
      layer.add(caption("psipedia",225,75,450,72,GREEN));
      layer.add(caption(".sk",562,94,150,52,RED));
      layer.add(new Konva.Rect({x:125,y:213,width:830,height:107,cornerRadius:55,fill:RED,listening:false}));
      layer.add(caption("PREDSTAVUJEME PROFIL",150,237,780,50,"#ffffff","center"));
      layer.add(new Konva.Rect({x:295,y:347,width:490,height:82,cornerRadius:45,fill:GREEN,listening:false}));
      const cat=caption((category.trim()||"KATEGÓRIA").toLocaleUpperCase("sk"),320,364,440,42,"#ffffff","center");
      while(cat.height()>65&&cat.fontSize()>23)cat.fontSize(cat.fontSize()-2);
      layer.add(cat);
      const title=caption(name.trim()||"Názov profilu",65,462,950,92,GREEN,"center");
      title.fontFamily("Georgia");
      while(title.height()>195&&title.fontSize()>40)title.fontSize(title.fontSize()-2);
      layer.add(title);
      const watermark=paw(820,760,245,"#e2d3b6");watermark.opacity(.5);layer.add(watermark);
      layer.add(new Konva.Circle({x:540,y:845,radius:228,fill:"#e6dccc",listening:false}));
      layer.add(new Konva.Circle({x:540,y:834,radius:217,fill:"#ffffff",listening:false}));
      if(logo){
        const factor=Math.min(350/logo.width,350/logo.height);
        const w=logo.width*factor,h=logo.height*factor;
        layer.add(new Konva.Image({image:logo,x:540-w/2,y:832-h/2,width:w,height:h,listening:false}));
      }else layer.add(caption("LOGO PROFILU",338,815,404,35,"#979b96","center"));
      layer.add(new Konva.Path({data:"M0 1113 C250 1043 555 1200 1080 1090 L1080 1350 L0 1350 Z",fill:RED,listening:false}));
      layer.add(new Konva.Path({data:"M0 1133 C250 1063 555 1220 1080 1112 L1080 1350 L0 1350 Z",fill:GREEN,listening:false}));
      layer.add(new Konva.Circle({x:167,y:1247,radius:62,fill:"#ffffff",listening:false}));
      layer.add(paw(127,1207,82,RED));
      layer.add(caption("Profil nájdeš na",289,1184,680,50,"#ffffff"));
      layer.add(caption("Psipedia.sk",289,1239,690,78,"#ffffff"));
      s.draw();
      return()=>{if(stage.current===s)stage.current=null;s.destroy();root.replaceChildren();};
    },[name,category,logo]);
    useImperativeHandle(ref,()=>({async exportPng(){
      if(!logo)throw Error("Najprv nahraj logo profilu.");
      if(!stage.current)throw Error("Náhľad ešte nie je pripravený.");
      return await new Promise<Blob>((resolve,reject)=>stage.current!.toCanvas({pixelRatio:1}).toBlob(
        blob=>blob?resolve(blob):reject(Error("Export PNG sa nepodaril.")),"image/png"));
    }}),[logo]);
    return <div ref={viewport} style={{width:"100%",position:"relative",overflow:"hidden"}} aria-label="Náhľad Predstavujeme profil">
      <div ref={host} style={{width:W,transformOrigin:"top left",touchAction:"none"}}/>
    </div>;
  }
);
