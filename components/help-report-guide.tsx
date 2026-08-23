import Link from "next/link";

const steps = [
  { number: "01", title: "Najprv bezpečnosť", text: "Nevstupuj do premávky, neopúšťaj bezpečné miesto a nepribližuj sa k psovi, ktorý prejavuje strach alebo agresiu. Pri bezprostrednom ohrození kontaktuj tiesňovú linku alebo políciu." },
  { number: "02", title: "Zapíš presné údaje", text: "Poznač si čas, ulicu alebo GPS polohu, smer pohybu, farbu, veľkosť, obojok a zvláštne znaky. Fotografia z bezpečnej vzdialenosti výrazne pomôže." },
  { number: "03", title: "Ak je to bezpečné, zaisti psa", text: "Použi uzavretý dvor, vôdzku alebo pokojný priestor. Daj mu vodu, ale nenúť ho k manipulácii a neprevážaj ho bez bezpečného zaistenia." },
  { number: "04", title: "Kontaktuj pomoc v okolí", text: "Oslov obec alebo mestskú políciu, najbližší útulok či veterinárnu ambulanciu. Veterinár alebo oprávnené pracovisko môže skontrolovať čip." },
  { number: "05", title: "Zdieľaj bez chaosu", text: "Použi jednu jasnú fotografiu, lokalitu, čas a kontakt. Keď sa prípad vyrieši, príspevok označ ako nájdený alebo vybavený, aby dobrovoľníci nehľadali ďalej." },
];

export function HelpReportGuide() {
  return <main id="obsah"><header className="help-guide-hero"><div className="shell"><nav className="article-breadcrumbs" aria-label="Navigácia"><Link href="/">Domov</Link><span>/</span><Link href="/pomoc-psom">Pomoc psom</Link><span>/</span><span>Nahlásiť psa v núdzi</span></nav><span className="eyebrow">Keď rozhodujú minúty</span><h1>Našiel si psa v núdzi?</h1><p>Zostaň pokojný a postupuj v tomto poradí. Bezpečnosť ľudí aj psa má vždy prednosť pred fotografiou či odchytom.</p></div></header><section className="section shell help-guide-layout"><div className="help-guide-steps">{steps.map((step) => <article key={step.number}><span>{step.number}</span><div><h2>{step.title}</h2><p>{step.text}</p></div></article>)}</div><aside><span aria-hidden="true">📌</span><h2>Priprav si</h2><ul><li>presnú lokalitu a čas,</li><li>fotografiu alebo opis psa,</li><li>smer, ktorým sa pohyboval,</li><li>informáciu o zranení či ohrození,</li><li>kontakt, na ktorom si dostupný.</li></ul><Link className="button button--primary" href="/adresar/utulky-a-zachrana">Nájsť útulok alebo organizáciu</Link><Link className="text-link" href="/pomoc-psom/stratene-a-najdene">Pozrieť stratené a nájdené psy →</Link></aside></section></main>;
}
