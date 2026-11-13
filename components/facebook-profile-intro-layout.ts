export type ProfilePart="brand"|"intro"|"category"|"name"|"logo"|"footer";
export type ProfilePlacement={x:number;y:number;scale:number};
export type ProfileLayout=Record<ProfilePart,ProfilePlacement>;
export type ProfileLogoShape="circle"|"rounded"|"square"|"none";
export type ProfileLogoOptions={
  shape:ProfileLogoShape;
  zoom:number;
  offsetX:number;
  offsetY:number;
  cropLeft:number;
  cropRight:number;
  cropTop:number;
  cropBottom:number;
  removeWhite:boolean;
};
export const PROFILE_PARTS:{id:ProfilePart;label:string}[]=[
  {id:"brand",label:"Logo Psipedia"},
  {id:"intro",label:"Predstavujeme profil"},
  {id:"category",label:"Kategória"},
  {id:"name",label:"Názov profilu"},
  {id:"logo",label:"Logo prevádzky"},
  {id:"footer",label:"Spodný text"},
];
export const DEFAULT_PROFILE_LAYOUT:ProfileLayout={
  brand:{x:360,y:8,scale:1},
  intro:{x:118,y:270,scale:1},
  category:{x:298,y:391,scale:1},
  name:{x:62,y:495,scale:1},
  logo:{x:337,y:684,scale:1},
  footer:{x:124,y:1194,scale:1},
};
export const DEFAULT_PROFILE_LOGO_OPTIONS:ProfileLogoOptions={
  shape:"circle",zoom:100,offsetX:0,offsetY:0,cropLeft:0,cropRight:0,cropTop:0,cropBottom:0,removeWhite:false,
};
export const PROFILE_WIDTH=1080;
export const PROFILE_HEIGHT=1350;
export function constrainProfilePlacement(place:ProfilePlacement):ProfilePlacement{
  return {
    x:Math.round(Math.max(0,Math.min(PROFILE_WIDTH-32,place.x))),
    y:Math.round(Math.max(0,Math.min(PROFILE_HEIGHT-32,place.y))),
    scale:Math.round(Math.max(.3,Math.min(3,place.scale))*1000)/1000,
  };
}
export function cropBounds(sourceWidth:number,sourceHeight:number,options:ProfileLogoOptions){
  const left=Math.max(0,Math.min(45,options.cropLeft))/100;
  const right=Math.max(0,Math.min(45,options.cropRight))/100;
  const top=Math.max(0,Math.min(45,options.cropTop))/100;
  const bottom=Math.max(0,Math.min(45,options.cropBottom))/100;
  return {
    x:sourceWidth*left,y:sourceHeight*top,
    width:Math.max(1,sourceWidth*(1-left-right)),
    height:Math.max(1,sourceHeight*(1-top-bottom)),
  };
}
