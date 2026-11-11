"use client";

/**
 * Shared Konva scene for the live preview and the exact exported PNG.
 * Stage pixels always match the requested Facebook image dimensions.
 * Brand mark is drawn from the original vector geometry of public/favicon.svg.
 */
import {forwardRef, useEffect, useImperativeHandle, useRef} from "react";
import Konva from "konva";

export type GraphicTemplate = "gradient" | "panel" | "editorial" | "clean" | "split";
export type GraphicFormat = "portrait" | "square";
export type GraphicLogo = "pill" | "wordmark" | "mark";
export type GraphicSettings = {
  template: GraphicTemplate;
  format: GraphicFormat;
  title: string;
  emphasis: string;
  fontSize: number;
  headlineX: number;
  headlineY: number;
  zoom: number;
  photoX: number;
  photoY: number;
  photoFit: "cover" | "contain";
  showBrand: boolean;
  logoStyle: GraphicLogo;
  logoX: number;
  logoY: number;
  logoScale: number;
  overlay: number;
};
export type GraphicPart = "logo" | "headline" | "photo";
export type GraphicCanvasHandle = {exportPng(): Promise<Blob>};
type Props = {
  settings: GraphicSettings;
  bitmap: ImageBitmap | null;
  onMove: (part: GraphicPart, x: number, y: number, scale?: number) => void;
  onWarning: (warning: string) => void;
};

const W = 1080;
const GREEN = "#073b2b";
const RED = "#c93624";
const CREAM = "#fff8ed";
const clamp = (x: number, min: number, max: number) => Math.max(min, Math.min(max, x));

function createVectorMark(size: number) {
  const group = new Konva.Group({scaleX:size/64, scaleY:size/64});
  group.add(new Konva.Rect({width:64,height:64,cornerRadius:20,fill:"#174b38"}));
  for (const [x,y,rx,ry,angle] of [[19,25,6,8,-26],[28,17,6,8,-8],[40,18,6,8,10],[48,27,6,8,28]]) {
    group.add(new Konva.Ellipse({x,y,radiusX:rx,radiusY:ry,rotation:angle,fill:"#fffdf8"}));
  }
  group.add(new Konva.Path({
    data:"M33.5 29c-9 0-16 8.6-16 16 0 5.4 4 8.5 9 8.5 2.7 0 4.6-1.7 7-1.7s4.3 1.7 7 1.7c5 0 9-3.1 9-8.5 0-7.4-7-16-16-16Z",
    fill:"#fffdf8",
  }));
  return group;
}

function logoGroup(settings: GraphicSettings, h: number) {
  const scale = settings.logoScale / 100;
  const iconSize = 64;
  const full = settings.logoStyle !== "mark";
  const baseWidth = full ? 365 : 72;
  const baseHeight = 82;
  const group = new Konva.Group({
    x:24 + (W-48-baseWidth*scale)*settings.logoX/100,
    y:24 + (h-48-baseHeight*scale)*settings.logoY/100,
    scaleX:scale,scaleY:scale,draggable:true,name:"logo",
  });
  if (settings.logoStyle === "pill") group.add(new Konva.Rect({
    width:baseWidth,height:baseHeight,cornerRadius:24,fill:"rgba(255,249,235,0.97)",
  }));
  const mark = createVectorMark(iconSize);
  mark.position({x:settings.logoStyle==="pill"?14:0,y:9});
  group.add(mark);
  if (full) {
    const textColor = settings.logoStyle==="wordmark" ? "#fffdf8" : GREEN;
    const title = new Konva.Text({
      x:settings.logoStyle==="pill"?94:80,y:21,text:"psipedia",fontFamily:"Arial",
      fontSize:39,fontStyle:"bold",fill:textColor,letterSpacing:-1.1,perfectDrawEnabled:true,
    });
    group.add(title);
    group.add(new Konva.Text({
      x:title.x()+title.width(),y:21,text:".sk",fontFamily:"Arial",
      fontSize:39,fontStyle:"bold",fill:settings.logoStyle==="wordmark"?"#f8a38f":RED,
      letterSpacing:-1.1,perfectDrawEnabled:true,
    }));
  }
  return {group,baseWidth,baseHeight};
}

function titleGroup(settings: GraphicSettings, h: number) {
  const fontSize = clamp(settings.fontSize,38,104);
  const maxWidth = W-148;
  let title = settings.title.trim();
  const needle = settings.emphasis.trim();
  const ix = needle ? title.toLocaleLowerCase("sk").indexOf(needle.toLocaleLowerCase("sk")) : -1;
  const accent = ix>=0 ? title.slice(ix, ix+needle.length).trim() : "";
  if (accent) title = (title.slice(0,ix)+" "+title.slice(ix+needle.length)).replace(/\s+/g," ").trim();
  const headline = new Konva.Text({
    x:0,y:0,width:maxWidth,text:title || (accent ? "" : "Nový príspevok"),
    fontFamily:"Arial",fontStyle:"bold",fontSize,letterSpacing:-0.9,lineHeight:1.12,
    wrap:"word",fill:settings.template==="editorial"||settings.template==="clean"?GREEN:CREAM,
  });
  // Accent has its own line, so the highlighted words are never cut midway.
  const accentText = accent ? new Konva.Text({
    text:accent,fontFamily:"Arial",fontStyle:"bold",fontSize:fontSize*.72,fill:"#ffffff",
    width:maxWidth-30,wrap:"word",lineHeight:1.1,
  }) : null;
  const accentHeight = accentText ? accentText.height()+22 : 0;
  headline.y(accentHeight);
  const totalH = headline.height() + accentHeight;
  const group = new Konva.Group({
    x:clamp(settings.headlineX,0,100)/100*(W-maxWidth),
    y:clamp(settings.headlineY,0,100)/100*Math.max(0,h-totalH-48)+24,
    draggable:true,name:"headline",
  });
  if (settings.template==="panel"||settings.template==="editorial"||settings.template==="clean") {
    group.add(new Konva.Rect({
      x:-35,y:-34,width:maxWidth+70,height:totalH+68,cornerRadius:25,
      fill:settings.template==="panel"?"rgba(3,54,38,.95)":"rgba(255,249,235,.97)",
    }));
    if (settings.template==="editorial") group.add(new Konva.Rect({
      x:-35,y:-34,width:11,height:totalH+68,cornerRadius:5,fill:RED,
    }));
  }
  if (accentText) {
    const chipW=Math.min(maxWidth+8, accentText.getTextWidth()+30);
    group.add(new Konva.Rect({x:-6,y:-7,width:chipW,height:accentHeight-1,
      fill:RED,cornerRadius:10}));
    accentText.x(10);
    group.add(accentText);
  }
  group.add(headline);
  if (settings.template==="gradient" && !accent) group.add(new Konva.Rect({
    y:totalH+17,x:0,width:170,height:8,cornerRadius:4,fill:RED,
  }));
  return {group, maxWidth, totalH};
}

export const FacebookKonvaCanvas = forwardRef<GraphicCanvasHandle, Props>(function FacebookKonvaCanvas(
  {settings, bitmap, onMove, onWarning}, ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const renderError = useRef<string>("");
  useEffect(()=>{
    const host=hostRef.current;
    const viewport=viewportRef.current;
    if (!host||!viewport) return;
    const h=settings.format==="portrait"?1350:1080;
    const updateScale=()=>{
      const ratio=Math.min(1,viewport.clientWidth/W);
      host.style.transform="scale("+ratio+")";
      viewport.style.height=Math.round(h*ratio)+"px";
    };
    updateScale();
    const observer=new ResizeObserver(updateScale);
    observer.observe(viewport);
    return ()=>observer.disconnect();
  },[settings.format]);

  useEffect(()=>{
    const host=hostRef.current;
    if (!host)return;
    const h=settings.format==="portrait"?1350:1080;
    host.replaceChildren();
    const stage=new Konva.Stage({container:host,width:W,height:h});
    stageRef.current=stage;
    const photoLayer=new Konva.Layer();
    const designLayer=new Konva.Layer();
    const selectionLayer=new Konva.Layer();
    stage.add(photoLayer,designLayer,selectionLayer);
    photoLayer.add(new Konva.Rect({width:W,height:h,fill:GREEN,listening:false}));
    if (bitmap) {
      const base=settings.photoFit==="contain"?
        Math.min(W/bitmap.width,h/bitmap.height):Math.max(W/bitmap.width,h/bitmap.height);
      const scale=base*settings.zoom/100;
      const dw=bitmap.width*scale,dh=bitmap.height*scale;
      const freeX=W-dw,freeY=h-dh;
      const x=freeX/2+freeX*settings.photoX/200;
      const y=freeY/2+freeY*settings.photoY/200;
      const crop=new Konva.Group({clipX:0,clipY:0,clipWidth:W,clipHeight:h});
      const pic=new Konva.Image({image:bitmap,x,y,width:dw,height:dh,draggable:true,name:"photo"});
      pic.on("dragend",()=>{
        const dx=freeX!==0?clamp(200*(pic.x()-freeX/2)/freeX,-100,100):0;
        const dy=freeY!==0?clamp(200*(pic.y()-freeY/2)/freeY,-100,100):0;
        onMove("photo",dx,dy);
      });
      crop.add(pic);photoLayer.add(crop);
      const sourcePixelsPerOutput=Math.min(bitmap.width/dw,bitmap.height/dh);
      onWarning(sourcePixelsPerOutput<.85?
        "Zdrojová fotografia je príliš malá na ostrý export pri tomto priblížení.": "");
    } else onWarning("");
    if (settings.template==="gradient") {
      const alpha=clamp(settings.overlay,0,100)/100;
      designLayer.add(new Konva.Rect({x:0,y:h*.27,width:W,height:h*.73,
        listening:false,fillLinearGradientStartPoint:{x:0,y:0},fillLinearGradientEndPoint:{x:0,y:h*.73},
        fillLinearGradientColorStops:[0,"rgba(2,35,26,0)",.5,"rgba(2,35,26,"+(alpha*.5)+")",1,"rgba(2,35,26,"+alpha+")"]}));
    } else if (settings.template==="split") {
      designLayer.add(new Konva.Rect({x:0,y:h*.67,width:W,height:h*.33,fill:GREEN,listening:false}));
    }
    const title=titleGroup(settings,h);
    renderError.current=title.totalH>h*.7?"Nadpis je príliš dlhý. Skráť ho alebo zmenši písmo.":"";
    designLayer.add(title.group);
    const transformer=new Konva.Transformer({
      rotateEnabled:false,flipEnabled:false,keepRatio:true,
      enabledAnchors:["top-left","top-right","bottom-left","bottom-right"],
      borderStroke:RED,anchorStroke:RED,anchorFill:"#fff",
      anchorSize:15,visible:false,
    });
    selectionLayer.add(transformer);
    const select=(group:Konva.Group)=>{
      transformer.nodes([group]);transformer.visible(true);selectionLayer.batchDraw();
    };
    title.group.on("click tap",()=>select(title.group));
    title.group.on("dragend",()=>{
      const x=clamp(title.group.x()/(W-title.maxWidth)*100,0,100);
      const y=clamp((title.group.y()-24)/Math.max(1,h-title.totalH-48)*100,0,100);
      onMove("headline",x,y);
    });
    title.group.on("transformend",()=>{
      const newFont=clamp(settings.fontSize*title.group.scaleX(),38,104);
      const x=clamp(title.group.x()/(W-title.maxWidth)*100,0,100);
      const y=clamp((title.group.y()-24)/Math.max(1,h-title.totalH-48)*100,0,100);
      onMove("headline",x,y,newFont);
    });
    if (settings.showBrand) {
      const {group,baseWidth,baseHeight}=logoGroup(settings,h);
      designLayer.add(group);
      group.on("click tap",()=>select(group));
      group.on("dragend",()=>{
        const spaceX=Math.max(1,W-48-baseWidth*settings.logoScale/100);
        const spaceY=Math.max(1,h-48-baseHeight*settings.logoScale/100);
        onMove("logo",clamp((group.x()-24)/spaceX*100,0,100),clamp((group.y()-24)/spaceY*100,0,100));
      });
      group.on("transformend",()=>{
        const scale=clamp(settings.logoScale*group.scaleX(),50,200);
        const spaceX=Math.max(1,W-48-baseWidth*scale/100);
        const spaceY=Math.max(1,h-48-baseHeight*scale/100);
        onMove("logo",clamp((group.x()-24)/spaceX*100,0,100),clamp((group.y()-24)/spaceY*100,0,100),scale);
      });
    }
    stage.on("click tap",(event)=>{
      if(event.target===stage||event.target.name()==="photo"){
        transformer.nodes([]);transformer.visible(false);selectionLayer.batchDraw();
      }
    });
    // Transformer is an editing affordance, never part of the exported design.
    // In exportPng we temporarily hide it before making the PNG.
    (stage as Konva.Stage & {graphicTransformer?:Konva.Transformer}).graphicTransformer=transformer;
    stage.draw();
    return ()=>{
      if(stageRef.current===stage)stageRef.current=null;
      stage.destroy();
      host.replaceChildren();
    };
  },[settings,bitmap,onMove,onWarning]);

  // Hide the selection handles from export without changing the preview state.
  useImperativeHandle(ref,()=>({
    async exportPng(){
      const stage=stageRef.current;
      if(!stage||!bitmap)throw new Error("Najprv nahraj fotografiu.");
      if(renderError.current)throw new Error(renderError.current);
      const tr=(stage as Konva.Stage & {graphicTransformer?:Konva.Transformer}).graphicTransformer;
      const wasVisible=tr?.visible()??false;
      tr?.visible(false);
      try{
        const canvas=stage.toCanvas({pixelRatio:1});
        return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(
          blob=>blob?resolve(blob):reject(new Error("Export PNG sa nepodaril.")),"image/png"));
      }finally{tr?.visible(wasVisible);}
    }
  }),[bitmap]);

  return <div ref={viewportRef} style={{width:"100%",position:"relative",overflow:"hidden"}} aria-label="Živý náhľad grafiky, potiahni fotografiu, nadpis alebo logo">
    <div ref={hostRef} style={{width:W,transformOrigin:"top left",touchAction:"none"}}/>
  </div>;
});