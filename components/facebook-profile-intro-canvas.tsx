"use client";

import {forwardRef,useEffect,useImperativeHandle,useRef,useState} from "react";
import Konva from "konva";
import type {GraphicCanvasHandle} from "./facebook-konva-canvas";
import {
  PROFILE_HEIGHT,PROFILE_WIDTH,constrainProfilePlacement,cropBounds,
  type ProfilePart,type ProfileLayout,type ProfilePlacement,type ProfileLogoOptions,
} from "./facebook-profile-intro-layout";

const W=1080,H=1350,GREEN="#073b2b",RED="#c93624",CREAM="#fff8ed",WHITE="#fffdf8";
type Props={
  name:string;category:string;logo:ImageBitmap|null;
  layout:ProfileLayout;logoOptions:ProfileLogoOptions;
  selected:ProfilePart|null;
  onSelect:(part:ProfilePart|null)=>void;
  onChange:(part:ProfilePart,placement:ProfilePlacement)=>void;
};
const caption=(value:string,x:number,y:number,width:number,size:number,color:string,align:"left"|"center"="left")=>
  new Konva.Text({text:value,x,y,width,fontSize:size,fontFamily:"Arial",fontStyle:"bold",fill:color,align,wrap:"word",lineHeight:1.1});
function paw(x:number,y:number,size:number,color:string){
  // Decorative footer mark follows the original public PawMark geometry.
  const g=new Konva.Group({x,y,scaleX:size/48,scaleY:size/48,listening:false});
  g.add(new Konva.Path({data:"M24 20.8c-6.9 0-13.1 7.1-13.1 13.3 0 4.4 3.3 7 7.3 7 2.3 0 3.7-1.3 5.8-1.3s3.5 1.3 5.8 1.3c4 0 7.3-2.6 7.3-7C37.1 27.9 30.9 20.8 24 20.8Z",fill:color}));
  for(const [cx,cy,rx,ry,rotation] of [[9.7,22.6,5.1,6.6,-27],[18.2,11.2,5.3,7.1,-8],[29.8,11.2,5.3,7.1,8],[38.3,22.6,5.1,6.6,27]])
    g.add(new Konva.Ellipse({x:cx,y:cy,radiusX:rx,radiusY:ry,rotation,fill:color}));
  return g;
}
function roundClip(ctx:Konva.Context,w:number,h:number,r:number){
  ctx.beginPath();ctx.moveTo(r,0);ctx.lineTo(w-r,0);ctx.quadraticCurveTo(w,0,w,r);
  ctx.lineTo(w,h-r);ctx.quadraticCurveTo(w,h,w-r,h);
  ctx.lineTo(r,h);ctx.quadraticCurveTo(0,h,0,h-r);
  ctx.lineTo(0,r);ctx.quadraticCurveTo(0,0,r,0);ctx.closePath();
}
function addLogo(group:Konva.Group,bitmap:ImageBitmap|null,options:ProfileLogoOptions){
  const size=408,width=options.shape==="rounded"?520:size,height=options.shape==="rounded"?320:size,r=size/2;
  if(options.shape==="circle"){
    group.add(new Konva.Circle({x:r,y:r,radius:r,fill:WHITE,stroke:"#e5dbca",strokeWidth:5}));
  }else if(options.shape!=="none"){
    group.add(new Konva.Rect({width,height,cornerRadius:options.shape==="rounded"?54:0,fill:WHITE,stroke:"#e5dbca",strokeWidth:5}));
  }
  const clipped=new Konva.Group({
    clipFunc:options.shape==="none"?undefined:(ctx)=>{
      if(options.shape==="circle"){ctx.beginPath();ctx.arc(r,r,r-9,0,Math.PI*2);ctx.closePath();}
      else roundClip(ctx,width,height,options.shape==="rounded"?48:0);
    },
  });
  if(bitmap){
    const crop=cropBounds(bitmap.width,bitmap.height,options);
    const factor=Math.min((width-35)/crop.width,(height-35)/crop.height)*options.zoom/100;
    const dw=crop.width*factor,dh=crop.height*factor;
    const x=(width-dw)/2+options.offsetX*1.4;
    const y=(height-dh)/2+options.offsetY*1.4;
    clipped.add(new Konva.Image({
      image:bitmap,x,y,width:dw,height:dh,
      cropX:crop.x,cropY:crop.y,cropWidth:crop.width,cropHeight:crop.height,
    }));
  }else{
    clipped.add(caption("LOGO PROFILU",44,height/2-20,width-88,36,"#89958d","center"));
  }
  group.add(clipped);
  // Transparent logos still need a generous selectable touch target.
  group.add(new Konva.Rect({width,height,opacity:0.001}));
}

function addBrand(group:Konva.Group,originalIcon:HTMLImageElement|null){
  if(originalIcon){
    // This is the exact public/favicon.svg asset, not a reconstructed paw.
    const naturalWidth=originalIcon.naturalWidth||originalIcon.width;
    const naturalHeight=originalIcon.naturalHeight||originalIcon.height;
    const side=Math.min(naturalWidth,naturalHeight);
    // A viewBox-only SVG may load into a 300x150 browser image; crop its
    // centered square so the official mark keeps its native proportions.
    group.add(new Konva.Image({
      image:originalIcon,x:0,y:0,width:100,height:100,
      cropX:(naturalWidth-side)/2,cropY:(naturalHeight-side)/2,cropWidth:side,cropHeight:side,
    }));
  }else{
    group.add(new Konva.Rect({width:100,height:100,cornerRadius:28,fill:"#174b38"}));
    group.add(paw(21,16,64,WHITE));
  }
  // Same wordmark segmentation and brand colors as the public header:
  // <span>psi<span>pedia</span><small>.sk</small></span>.
  const psi=caption("psi",119,22,155,67,GREEN);psi.letterSpacing(-3);
  group.add(psi);
  const pedia=caption("pedia",226,22,274,67,"#b94732");pedia.letterSpacing(-3);
  group.add(pedia);
  group.add(caption(".sk",425,37,120,45,"#52665d"));
  group.add(new Konva.Rect({width:560,height:110,opacity:0.001}));
}

export const FacebookProfileIntroCanvas=forwardRef<GraphicCanvasHandle,Props>(
  function FacebookProfileIntroCanvas({name,category,logo,layout,logoOptions,selected,onSelect,onChange},ref){
    const host=useRef<HTMLDivElement>(null),viewport=useRef<HTMLDivElement>(null),stage=useRef<Konva.Stage|null>(null);
    const [brandIcon,setBrandIcon]=useState<HTMLImageElement|null>(null);
    const selectionRef=useRef<ProfilePart|null>(selected);
    selectionRef.current=selected;
    useEffect(()=>{
      const image=new Image();
      image.onload=()=>setBrandIcon(image);
      image.src="/favicon.svg";
      return()=>{image.onload=null;};
    },[]);
    useEffect(()=>{
      const v=viewport.current,h=host.current;if(!v||!h)return;
      const resize=()=>{const ratio=Math.min(1,v.clientWidth/PROFILE_WIDTH);h.style.transform="scale("+ratio+")";v.style.height=Math.round(PROFILE_HEIGHT*ratio)+"px";};
      resize();const observer=new ResizeObserver(resize);observer.observe(v);return()=>observer.disconnect();
    },[]);
    useEffect(()=>{
      const root=host.current;if(!root)return;root.replaceChildren();
      const s=new Konva.Stage({container:root,width:W,height:H});stage.current=s;
      const background=new Konva.Layer(),design=new Konva.Layer(),selectionLayer=new Konva.Layer();
      s.add(background,design,selectionLayer);
      background.add(new Konva.Rect({width:W,height:H,fill:CREAM,listening:false}));
      const watermark=paw(828,764,225,"#e2d3b6");watermark.opacity(.35);background.add(watermark);
      background.add(new Konva.Path({data:"M0 1113 C250 1043 555 1200 1080 1090 L1080 1350 L0 1350 Z",fill:RED,listening:false}));
      background.add(new Konva.Path({data:"M0 1133 C250 1063 555 1220 1080 1112 L1080 1350 L0 1350 Z",fill:GREEN,listening:false}));

      const nodes={} as Record<ProfilePart,Konva.Group>;
      const add=(id:ProfilePart,width:number,height:number,paint:(group:Konva.Group)=>void)=>{
        const pos=layout[id];
        const group=new Konva.Group({
          x:pos.x,y:pos.y,scaleX:pos.scale,scaleY:pos.scale,
          draggable:true,name:"profile-"+id,
          dragBoundFunc:(next)=>{
            // Keep at least a sliver of every element within the artwork.
            return {
              x:Math.min(W-24,Math.max(-width*group.scaleX()+24,next.x)),
              y:Math.min(H-24,Math.max(-height*group.scaleY()+24,next.y)),
            };
          },
        });
        paint(group);nodes[id]=group;design.add(group);
        group.on("click tap",()=>onSelect(id));
        group.on("dragend",()=>onChange(id,constrainProfilePlacement({
          x:group.x(),y:group.y(),scale:group.scaleX(),
        })));
        group.on("transformend",()=>onChange(id,constrainProfilePlacement({
          x:group.x(),y:group.y(),scale:group.scaleX(),
        })));
      };
      add("brand",560,110,group=>addBrand(group,brandIcon));
      add("intro",844,110,group=>{
        group.add(new Konva.Rect({width:844,height:110,cornerRadius:55,fill:RED}));
        group.add(caption("PREDSTAVUJEME PROFIL",25,29,794,48,WHITE,"center"));
      });
      add("category",484,90,group=>{
        group.add(new Konva.Rect({width:484,height:90,cornerRadius:45,fill:GREEN}));
        const label=caption((category.trim()||"KATEGÓRIA").toLocaleUpperCase("sk"),24,18,436,43,WHITE,"center");
        while(label.height()>67&&label.fontSize()>23)label.fontSize(label.fontSize()-2);
        label.height(67);label.ellipsis(true);
        group.add(label);
      });
      add("name",956,179,group=>{
        const title=caption(name.trim()||"Názov profilu",0,0,956,89,GREEN,"center");
        title.fontFamily("Georgia");
        while(title.height()>176&&title.fontSize()>28)title.fontSize(title.fontSize()-2);
        // Fixed cap stops unedited long names from colliding with the logo.
        title.height(179);title.ellipsis(true);
        group.add(title);
        group.add(new Konva.Rect({width:956,height:179,opacity:.001}));
      });
      add("logo",logoOptions.shape==="rounded"?520:408,logoOptions.shape==="rounded"?320:408,
        group=>addLogo(group,logo,logoOptions));
      add("footer",800,126,group=>{
        group.add(new Konva.Circle({x:56,y:59,radius:56,fill:WHITE}));
        group.add(paw(23,24,67,RED));
        group.add(caption("Profil nájdeš na",160,3,625,47,WHITE));
        group.add(caption("Psipedia.sk",160,56,630,72,WHITE));
        group.add(new Konva.Rect({width:800,height:126,opacity:.001}));
      });
      const transformer=new Konva.Transformer({
        rotateEnabled:false,keepRatio:true,flipEnabled:false,
        enabledAnchors:["top-left","top-right","bottom-left","bottom-right"],
        borderStroke:RED,anchorStroke:RED,anchorFill:WHITE,
        anchorSize:30,visible:false,
        boundBoxFunc:(oldBox,nextBox)=>nextBox.width<40||nextBox.height<30?oldBox:nextBox,
      });
      selectionLayer.add(transformer);
      if(selected&&nodes[selected]){
        transformer.nodes([nodes[selected]]);
        transformer.visible(true);
      }
      s.on("click tap",event=>{
        if(event.target===s||event.target===background.findOne("Rect"))onSelect(null);
      });
      let pinchDistance=0,pinchCenter:{x:number;y:number}|null=null;
      s.on("touchmove",event=>{
        if(event.evt.touches.length!==2||!selectionRef.current)return;
        const g=nodes[selectionRef.current];if(!g)return;
        const [a,b]=[event.evt.touches[0],event.evt.touches[1]];
        if(!a||!b)return;
        const distance=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);
        const center={x:(a.clientX+b.clientX)/2,y:(a.clientY+b.clientY)/2};
        if(pinchDistance&&pinchCenter){
          event.evt.preventDefault();
          g.stopDrag();
          const factor=Math.max(.7,Math.min(1.3,distance/pinchDistance));
          const scale=Math.max(.3,Math.min(3,g.scaleX()*factor));
          const ratio=Math.max(.01,root.getBoundingClientRect().width/W);
          g.position({x:g.x()+(center.x-pinchCenter.x)/ratio,
            y:g.y()+(center.y-pinchCenter.y)/ratio});
          g.scale({x:scale,y:scale});
          transformer.forceUpdate();selectionLayer.batchDraw();
        }
        pinchDistance=distance;pinchCenter=center;
      });
      s.on("touchend",event=>{
        if(pinchDistance&&event.evt.touches.length<2&&selectionRef.current){
          const id=selectionRef.current,g=nodes[id];
          if(g)onChange(id,constrainProfilePlacement({x:g.x(),y:g.y(),scale:g.scaleX()}));
        }
        pinchDistance=0;pinchCenter=null;
      });
      (s as Konva.Stage & {profileTransformer?:Konva.Transformer}).profileTransformer=transformer;
      s.draw();
      return()=>{if(stage.current===s)stage.current=null;s.destroy();root.replaceChildren();};
    },[name,category,logo,layout,logoOptions,selected,brandIcon,onSelect,onChange]);
    useImperativeHandle(ref,()=>({async exportPng(){
      if(!logo)throw Error("Najprv nahraj logo profilu.");
      if(!stage.current)throw Error("Náhľad ešte nie je pripravený.");
      const s=stage.current;
      const transformer=(s as Konva.Stage & {profileTransformer?:Konva.Transformer}).profileTransformer;
      const visible=transformer?.visible()??false;
      transformer?.visible(false);
      try{
        return await new Promise<Blob>((resolve,reject)=>s.toCanvas({pixelRatio:1}).toBlob(
          blob=>blob?resolve(blob):reject(Error("Export PNG sa nepodaril.")),"image/png"));
      }finally{transformer?.visible(visible);}
    }}),[logo]);
    return <div ref={viewport} style={{width:"100%",position:"relative",overflow:"hidden"}}
      aria-label="Náhľad Predstavujeme profil: prvok presunieš prstom alebo myšou a zmeníš veľkosť rohov či dvoma prstami">
      <div ref={host} style={{width:W,transformOrigin:"top left",touchAction:"none"}}/>
    </div>;
  }
);
