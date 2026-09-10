import type { Metadata } from "next";
import BreedProfilePreview from "../../[concept]/[slug]/page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Breed Profile V2 – Psipedia Native preview",
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

type Props = { params: Promise<{ slug: string }> };

const css = String.raw`
.breed-v2d-wrapper .v2.v2-a{--green:var(--forest);--deep:var(--forest-dark);--cream:var(--cream);--paper:var(--paper);--ink:var(--ink);--muted:var(--muted);--coral:var(--coral-dark);--coralSoft:#fff7f3;--gold:var(--gold);--goldSoft:#f6e8bd;--line:var(--line);--serif:Georgia,"Times New Roman",serif;--max:1180px;color:var(--ink);background:var(--cream);font:1rem/1.55 "Avenir Next",Avenir,"Segoe UI",Helvetica,Arial,sans-serif}
.breed-v2d-wrapper .v2.v2-a .v2-shell{width:min(1180px,calc(100% - 48px))}
.breed-v2d-wrapper .v2.v2-a .v2-breadcrumb{min-height:0;padding:34px 0 0;gap:7px;color:var(--muted);font-size:.78rem}
.breed-v2d-wrapper .v2.v2-a .v2-breadcrumb strong{color:var(--ink)}
.breed-v2d-wrapper .v2.v2-a .v2-hero{grid-template-columns:minmax(0,1fr) minmax(390px,.92fr);gap:56px;padding:42px 0 58px}
.breed-v2d-wrapper .v2.v2-a .v2-hero h1{max-width:12ch;margin:7px 0 14px;font-size:clamp(3.25rem,5.8vw,5.6rem);font-weight:500;line-height:.98;letter-spacing:-.035em;overflow-wrap:anywhere}
.breed-v2d-wrapper .v2.v2-a .v2-eyebrow,.breed-v2d-wrapper .v2.v2-a .v2-heading p{margin:0 0 9px;color:var(--coral-dark);font-size:.72rem;font-weight:850;letter-spacing:.115em;text-transform:uppercase}
.breed-v2d-wrapper .v2.v2-a .v2-official{margin:0 0 22px;color:var(--muted);font-size:.76rem;font-weight:800;letter-spacing:.075em;text-transform:uppercase}
.breed-v2d-wrapper .v2.v2-a .v2-intro{max-width:650px;margin:0;color:var(--muted);font:400 1.08rem/1.72 "Avenir Next",Avenir,"Segoe UI",Helvetica,Arial,sans-serif}
.breed-v2d-wrapper .v2.v2-a .v2-traits{gap:7px;margin-top:24px}
.breed-v2d-wrapper .v2.v2-a .v2-traits span{padding:7px 10px;border:1px solid var(--ps-border-soft);border-radius:999px;color:var(--forest-dark);background:var(--sage-light);font-size:.73rem;font-weight:750}
.breed-v2d-wrapper .v2.v2-a .v2-traits span:before{display:none}
.breed-v2d-wrapper .v2.v2-a .v2-photo{height:455px;min-height:455px;max-height:520px;border:1px solid var(--ps-border-soft);border-radius:var(--ps-radius-media);background:linear-gradient(145deg,var(--sage-light),var(--cream));box-shadow:var(--shadow-sm)}
.breed-v2d-wrapper .v2.v2-a .v2-photo img{object-fit:contain;object-position:center}
.breed-v2d-wrapper .v2.v2-a .v2-facts{grid-template-columns:repeat(auto-fit,minmax(170px,1fr));margin-bottom:0;overflow:hidden;border:1px solid var(--ps-border-soft);border-radius:var(--ps-radius-card);background:var(--paper)}
.breed-v2d-wrapper .v2.v2-a .v2-fact{padding:17px 19px}
.breed-v2d-wrapper .v2.v2-a .v2-fact+.v2-fact{border-left:1px solid var(--line)}
.breed-v2d-wrapper .v2.v2-a .v2-fact small{margin-bottom:6px;color:var(--muted);font-size:.68rem;font-weight:850;letter-spacing:.07em}
.breed-v2d-wrapper .v2.v2-a .v2-fact strong{font-size:.86rem;font-weight:750;line-height:1.45}
.breed-v2d-wrapper .v2.v2-a .v2-section{padding:76px 0;border-top:1px solid var(--line)}
.breed-v2d-wrapper .v2.v2-a .v2-heading{display:block;margin-bottom:32px}
.breed-v2d-wrapper .v2.v2-a .v2-heading h2{max-width:16ch;margin:5px 0 0;font-size:clamp(2.2rem,4vw,3.75rem);font-weight:500;line-height:1.04;letter-spacing:-.035em}
.breed-v2d-wrapper .v2.v2-a .v2-decision{width:100vw;margin:0 0 0 calc(50% - 50vw);padding:76px max(24px,calc((100vw - min(1180px,calc(100vw - 48px)))/2));border-top:0;border-bottom:1px solid rgba(23,53,43,.06);background:var(--sage-light)}
.breed-v2d-wrapper .v2.v2-a .v2-decision-grid{gap:14px}
.breed-v2d-wrapper .v2.v2-a .v2-decision-grid>div{min-height:0;padding:29px 31px;border:1px solid var(--ps-border-soft);border-radius:var(--ps-radius-card);background:#f6faf4}
.breed-v2d-wrapper .v2.v2-a .v2-decision-grid>.v2-consider{border-color:rgba(185,71,50,.14);background:#fff7f3}
.breed-v2d-wrapper .v2.v2-a .v2-decision h3,.breed-v2d-wrapper .v2.v2-a .v2-prose h3,.breed-v2d-wrapper .v2.v2-a .v2-daily h3,.breed-v2d-wrapper .v2.v2-a .v2-risk h3{margin:0 0 14px;font-size:1.55rem;font-weight:500;line-height:1.2;letter-spacing:0}
.breed-v2d-wrapper .v2.v2-a .v2-decision li,.breed-v2d-wrapper .v2.v2-a .v2-risk li{color:var(--ink-2);font-size:.9rem;line-height:1.55}
.breed-v2d-wrapper .v2.v2-a .v2-reading{width:min(880px,100%)}
.breed-v2d-wrapper .v2.v2-a .v2-overview{grid-template-columns:1.18fr .82fr;gap:52px}
.breed-v2d-wrapper .v2.v2-a .v2-prose{color:#334f45;font:400 1.06rem/1.78 Georgia,"Times New Roman",serif}
.breed-v2d-wrapper .v2.v2-a .v2-lead p{font:400 1.15rem/1.72 Georgia,"Times New Roman",serif;letter-spacing:0}
.breed-v2d-wrapper .v2.v2-a .v2-daily-grid{display:block}
.breed-v2d-wrapper .v2.v2-a .v2-daily{display:grid;grid-template-columns:220px minmax(0,1fr);gap:32px;padding:28px 0;border-top:1px solid var(--line)}
.breed-v2d-wrapper .v2.v2-a .v2-daily:last-child{border-bottom:1px solid var(--line)}
.breed-v2d-wrapper .v2.v2-a .v2-daily h3{font-size:1.28rem}
.breed-v2d-wrapper .v2.v2-a .v2-daily>p{margin:0;color:#334f45;font-family:Georgia,"Times New Roman",serif;line-height:1.72}
.breed-v2d-wrapper .v2.v2-a .v2-tip{grid-column:2;margin:14px 0 0!important;padding:13px 15px;border:0;border-radius:14px;color:var(--muted);background:var(--sage-light);font:400 .8rem/1.55 "Avenir Next",Avenir,"Segoe UI",Helvetica,Arial,sans-serif}
.breed-v2d-wrapper .v2.v2-a .v2-tip b{display:inline;margin-right:7px;color:var(--forest);letter-spacing:0;text-transform:none;font-size:inherit}
.breed-v2d-wrapper .v2.v2-a .v2-health{grid-template-columns:minmax(0,1.2fr) minmax(280px,.8fr);gap:42px;padding:32px;border:1px solid rgba(23,53,43,.06);border-radius:var(--ps-radius-card);background:#f4f7f0}
.breed-v2d-wrapper .v2.v2-a .v2-health-copy>p:first-child{margin:0;color:#334f45;font:400 1.1rem/1.78 Georgia,"Times New Roman",serif}
.breed-v2d-wrapper .v2.v2-a .v2-risk{padding:26px 27px;border:1px solid var(--ps-border-soft);border-radius:var(--ps-radius-card);background:var(--paper)}
.breed-v2d-wrapper .v2.v2-a .v2-sports{display:grid;grid-template-columns:1fr 1fr;gap:0 26px;border-top:1px solid var(--line)}
.breed-v2d-wrapper .v2.v2-a .v2-sport{grid-template-columns:auto 1fr;gap:12px;min-height:62px}
.breed-v2d-wrapper .v2.v2-a .v2-sport span{width:9px;height:9px;overflow:hidden;border-radius:50%;color:transparent;background:var(--gold);font-size:0}
.breed-v2d-wrapper .v2.v2-a .v2-sport strong{font-size:1.05rem;font-weight:500}
.breed-v2d-wrapper .v2.v2-a .v2-history{grid-template-columns:1.25fr .75fr;gap:48px}
.breed-v2d-wrapper .v2.v2-a .v2-history .v2-prose:first-child p{font:400 1.06rem/1.78 Georgia,"Times New Roman",serif}
.breed-v2d-wrapper .v2.v2-a .v2-gallery{grid-template-columns:2fr 1fr;gap:14px}
.breed-v2d-wrapper .v2.v2-a .v2-gallery figure{min-height:250px;border:1px solid var(--ps-border-soft);border-radius:var(--ps-radius-media);background:linear-gradient(145deg,var(--sage-light),var(--cream));box-shadow:var(--shadow-sm)}
.breed-v2d-wrapper .v2.v2-a .v2-fci{width:100vw;margin-left:calc(50% - 50vw);padding:78px max(24px,calc((100vw - min(1180px,calc(100vw - 48px)))/2));border-block:1px solid rgba(23,53,43,.09);color:var(--ink);background:#f2eee3}
.breed-v2d-wrapper .v2.v2-a .v2-fci .v2-heading p{color:var(--coral-dark)}
.breed-v2d-wrapper .v2.v2-a .v2-fci-summary{grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-bottom:18px;overflow:hidden;border:1px solid var(--ps-border-soft);border-radius:var(--ps-radius-card);background:var(--paper)}
.breed-v2d-wrapper .v2.v2-a .v2-fci-summary div{padding:18px 20px}
.breed-v2d-wrapper .v2.v2-a .v2-fci-summary div+div{border-left:1px solid var(--line)}
.breed-v2d-wrapper .v2.v2-a .v2-fci-summary small{margin-bottom:6px;color:var(--muted);opacity:1;font-size:.67rem;font-weight:850;letter-spacing:.07em}
.breed-v2d-wrapper .v2.v2-a .v2-fci-summary strong{font-size:.82rem;line-height:1.45}
.breed-v2d-wrapper .v2.v2-a .v2-fci details{max-width:none;overflow:hidden;border:1px solid var(--ps-border-soft);border-radius:var(--ps-radius-card);background:var(--paper)}
.breed-v2d-wrapper .v2.v2-a .v2-fci summary{min-height:60px;padding:16px 20px;border:0;color:white;background:var(--forest);font:800 .86rem/1.4 "Avenir Next",Avenir,"Segoe UI",Helvetica,Arial,sans-serif}
.breed-v2d-wrapper .v2.v2-a .v2-fci summary:after{color:white}
.breed-v2d-wrapper .v2.v2-a .v2-fci-body{padding:10px 28px 30px}
.breed-v2d-wrapper .v2.v2-a .v2-fci-group{grid-template-columns:150px 1fr;gap:28px;padding:28px 0;border-bottom:1px solid var(--line)}
.breed-v2d-wrapper .v2.v2-a .v2-fci-group>span{display:none}
.breed-v2d-wrapper .v2.v2-a .v2-fci-group h3{margin:0;font-size:1.15rem;font-weight:500;line-height:1.3}
.breed-v2d-wrapper .v2.v2-a .v2-fci-entry h4{margin:0 0 5px;color:var(--coral-dark);opacity:1;font-size:.69rem;letter-spacing:.075em}
.breed-v2d-wrapper .v2.v2-a .v2-fci-entry p{color:#3e584f;font:400 .94rem/1.7 Georgia,"Times New Roman",serif}
.breed-v2d-wrapper .v2.v2-a .v2-related-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.breed-v2d-wrapper .v2.v2-a .v2-card{min-height:130px;padding:21px;border:1px solid var(--ps-border-soft);border-radius:var(--ps-radius-card);background:var(--paper);box-shadow:none}
.breed-v2d-wrapper .v2.v2-a .v2-card h3{font-size:1.2rem;font-weight:500}
.breed-v2d-wrapper .v2.v2-a .v2-sources{padding:64px 0 82px}
.breed-v2d-wrapper .v2.v2-a .v2-sources h2{font-size:clamp(2.2rem,4vw,3.75rem);font-weight:500}
.breed-v2d-wrapper .v2.v2-a .v2-links{gap:10px}
.breed-v2d-wrapper .v2.v2-a .v2-links a{padding:9px 13px;border:1px solid var(--ps-border-soft);border-radius:999px;color:var(--forest);background:var(--paper);font-size:.76rem;font-weight:750;text-decoration:none}
.breed-v2d-wrapper .v2.v2-a .v2-switch{display:none!important}
@media(max-width:900px){.breed-v2d-wrapper .v2.v2-a .v2-hero,.breed-v2d-wrapper .v2.v2-a .v2-overview,.breed-v2d-wrapper .v2.v2-a .v2-health,.breed-v2d-wrapper .v2.v2-a .v2-history{grid-template-columns:1fr}.breed-v2d-wrapper .v2.v2-a .v2-related-grid{grid-template-columns:1fr 1fr}}
@media(max-width:620px){
 .breed-v2d-wrapper .v2.v2-a .v2-shell{width:min(1180px,calc(100% - 32px))}
 .breed-v2d-wrapper .v2.v2-a .v2-breadcrumb{padding-top:24px;font-size:.72rem}
 .breed-v2d-wrapper .v2.v2-a .v2-hero{display:flex;flex-direction:column;gap:0;padding:24px 0 38px}
 .breed-v2d-wrapper .v2.v2-a .v2-hero-copy{display:contents}
 .breed-v2d-wrapper .v2.v2-a .v2-hero-copy>.v2-eyebrow{order:1}
 .breed-v2d-wrapper .v2.v2-a .v2-hero h1{order:2;max-width:none;margin:5px 0 11px;font-size:clamp(2.85rem,13vw,4rem)}
 .breed-v2d-wrapper .v2.v2-a .v2-official{order:3;margin-bottom:0;font-size:.67rem}
 .breed-v2d-wrapper .v2.v2-a .v2-photo{order:4;width:100%;height:300px;min-height:0;margin-top:24px;border-radius:var(--ps-radius-media)!important}
 .breed-v2d-wrapper .v2.v2-a .v2-intro{order:5;margin-top:23px;font-size:1rem;line-height:1.68}
 .breed-v2d-wrapper .v2.v2-a .v2-traits{order:6;margin-top:18px}
 .breed-v2d-wrapper .v2.v2-a .v2-facts{grid-template-columns:1fr 1fr}
 .breed-v2d-wrapper .v2.v2-a .v2-fact{padding:15px}
 .breed-v2d-wrapper .v2.v2-a .v2-fact+.v2-fact{border-left:0}
 .breed-v2d-wrapper .v2.v2-a .v2-fact:nth-child(even){border-left:1px solid var(--line)}
 .breed-v2d-wrapper .v2.v2-a .v2-fact:nth-child(n+3){border-top:1px solid var(--line)}
 .breed-v2d-wrapper .v2.v2-a .v2-decision{padding:58px 16px}
 .breed-v2d-wrapper .v2.v2-a .v2-decision-grid{grid-template-columns:1fr;gap:10px}
 .breed-v2d-wrapper .v2.v2-a .v2-decision-grid>div{padding:23px 22px}
 .breed-v2d-wrapper .v2.v2-a .v2-section{padding:58px 0}
 .breed-v2d-wrapper .v2.v2-a .v2-overview{gap:30px}
 .breed-v2d-wrapper .v2.v2-a .v2-prose,.breed-v2d-wrapper .v2.v2-a .v2-lead p{font-size:1rem;line-height:1.75}
 .breed-v2d-wrapper .v2.v2-a .v2-daily{grid-template-columns:1fr;gap:10px;padding:24px 0}
 .breed-v2d-wrapper .v2.v2-a .v2-tip{grid-column:auto}
 .breed-v2d-wrapper .v2.v2-a .v2-health{grid-template-columns:1fr;gap:26px;padding:22px}
 .breed-v2d-wrapper .v2.v2-a .v2-sports{grid-template-columns:1fr}
 .breed-v2d-wrapper .v2.v2-a .v2-history{gap:28px}
 .breed-v2d-wrapper .v2.v2-a .v2-gallery{grid-template-columns:1fr}
 .breed-v2d-wrapper .v2.v2-a .v2-fci{padding:58px 16px}
 .breed-v2d-wrapper .v2.v2-a .v2-fci-summary{grid-template-columns:1fr 1fr}
 .breed-v2d-wrapper .v2.v2-a .v2-fci-summary div+div{border-left:0}
 .breed-v2d-wrapper .v2.v2-a .v2-fci-summary div:nth-child(even){border-left:1px solid var(--line)}
 .breed-v2d-wrapper .v2.v2-a .v2-fci-summary div:nth-child(n+3){border-top:1px solid var(--line)}
 .breed-v2d-wrapper .v2.v2-a .v2-fci-body{padding:4px 20px 22px}
 .breed-v2d-wrapper .v2.v2-a .v2-fci-group{grid-template-columns:1fr;gap:12px;padding:24px 0}
 .breed-v2d-wrapper .v2.v2-a .v2-related-grid{grid-template-columns:1fr}
 .breed-v2d-wrapper .v2.v2-a .v2-sources{flex-direction:column;align-items:flex-start;padding:52px 0 70px}
 .breed-v2d-wrapper .v2.v2-a .v2-links{justify-content:flex-start}
}
`;

export default async function BreedProfileNativePreview({ params }: Props) {
  const { slug } = await params;
  const preview = await BreedProfilePreview({ params: Promise.resolve({ concept: "a", slug }) });
  return <div className="breed-v2d-wrapper" data-prototype="breed-profile-v2" data-concept="d">{preview}<style dangerouslySetInnerHTML={{ __html: css }} /></div>;
}
