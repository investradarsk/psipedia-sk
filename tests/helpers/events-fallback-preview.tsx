/* eslint-disable @next/next/no-img-element -- Visual harness tests the existing native image contract. */
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { EventCard } from '../../components/event-card';
import { EventDetail } from '../../components/event-detail';
import { EventImage } from '../../components/event-image';
import { eventTypes, type DogEvent } from '../../lib/events';
import { getEventFallbackImage, eventTypePresentation } from '../../lib/event-type-presentation';
import '../../app/globals.css';
import styles from '../../components/events-public.module.css';

const base: DogEvent = {id:1,slug:'preview',title:'Podujatie pre milovníkov psov',excerpt:'Spoločný deň so psami v prírode.',eventType:'Výstava',status:'published',startDate:'2026-10-15',endDate:null,startTime:'09:00',endTime:null,venue:'Park',city:'Žilina',region:'Žilinský kraj',address:'',organizer:'Kynologický klub',description:'Príjemné stretnutie so psami.',practicalInfo:'',websiteUrl:null,registrationUrl:null,imageUrl:null,imageKey:null,imageDisplay:'contain',cancelled:false,createdAt:'2026-10-01',updatedAt:'2026-10-01',publishedAt:'2026-10-01',createdBy:'preview',updatedBy:'preview'};
function Preview() {
  const [photo,setPhoto]=useState<string|null>(null);
  const [type,setType]=useState<DogEvent['eventType']>('Výstava');
  const mode=new URLSearchParams(location.search).get('view');
  if(mode==='detail') return <EventDetail event={{...base,eventType:type,imageUrl:new URLSearchParams(location.search).get('photo')==='1'?'/images/hero-labrador.webp':null}}/>;
  return <main id="obsah" style={{padding:'24px',maxWidth:1440,margin:'auto'}}>
    <h1>Ilustrácie podujatí</h1>
    <div data-art-series style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:16}}>{eventTypes.map(eventType=><figure key={eventType} style={{margin:0}}><img src={getEventFallbackImage(eventType)} alt={`Ilustrácia: ${eventType}`} style={{width:'100%',aspectRatio:'16/10'}}/><figcaption style={{borderLeft:`5px solid ${eventTypePresentation[eventType].color}`,padding:8}}>{eventTypePresentation[eventType].label}</figcaption></figure>)}</div>
    <h2>Karty s fotografiami a ilustráciami</h2>
    <div className={styles.cardGrid} data-mixed-grid>{eventTypes.map((eventType,i)=><EventCard key={eventType} event={{...base,id:i+1,eventType,title:eventType+' – spoločný deň',imageUrl:i===0||i===2?'/images/hero-labrador.webp':null,cancelled:i===1}} today="2026-10-11" variant="grid"/>)}</div>
    <h2>Aktuálne údaje obrázka</h2>
    <div style={{display:'flex',gap:12,flexWrap:'wrap'}}><button onClick={()=>setPhoto('/images/hero-labrador.webp')}>Nahrať fotografiu</button><button onClick={()=>setPhoto(null)}>Odstrániť fotografiu</button><button onClick={()=>setPhoto('/missing-event-photo.webp')}>Pokazená fotografia</button><button onClick={()=>setType('Tréning')}>Zmeniť na tréning</button></div>
    <div data-live-image style={{width:'min(100%,480px)',aspectRatio:'16/10',overflow:'hidden'}}><EventImage imageUrl={photo} eventType={type} mode="contain" alt="Aktuálna fotografia" style={{width:'100%',height:'100%'}}/></div>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
