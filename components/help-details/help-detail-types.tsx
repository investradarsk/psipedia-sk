import { formatHelpDate, type HelpCase, type HelpCategorySlug } from "@/lib/help";
import { getHelpPresentation, sameLooseText, usefulHelpValue } from "@/lib/help-detail-presentation";
import {
  HelpContactsCard,
  HelpDetailShell,
  HelpFactsCard,
  HelpOptions,
  HelpParagraphs,
  HelpProgressCard,
  HelpSection,
} from "./help-detail-shell";

type Props = { item: HelpCase };

function location(item: HelpCase) {
  return [usefulHelpValue(item.locationNote), usefulHelpValue(item.city), usefulHelpValue(item.region)].filter(Boolean).join(" · ");
}

function GenericContacts({ item }: Props) {
  const presentation = getHelpPresentation(item);
  return <HelpContactsCard contacts={presentation.contacts} note={presentation.contactNote} />;
}

export function OrganizationHelpDetail({ item }: Props) {
  const presentation = getHelpPresentation(item);
  const operator = !sameLooseText(item.organization, item.title) ? usefulHelpValue(item.organization) : null;
  return <HelpDetailShell item={item} sidebar={<>
    <HelpFactsCard facts={[
      presentation.organizationType && { label: "Typ organizácie", value: presentation.organizationType },
      operator && { label: "Prevádzkovateľ", value: operator },
      location(item) && { label: "Lokalita", value: location(item) },
      presentation.coverage && { label: "Oblasť pôsobenia", value: presentation.coverage },
    ]} />
    <HelpContactsCard contacts={presentation.contacts} note={presentation.contactNote} />
  </>}>
    {presentation.description && <HelpSection eyebrow="Profil organizácie" title="O organizácii"><HelpParagraphs value={presentation.description} /></HelpSection>}
    {presentation.helpOptions.length > 0 && <HelpSection title="Ako môžete pomôcť"><p>Zobrazujeme iba možnosti, ktoré sú v profile výslovne uvedené. Neoverené alebo nezistené položky sa nepovažujú za negatívnu vlastnosť organizácie.</p><HelpOptions options={presentation.helpOptions} /></HelpSection>}
  </HelpDetailShell>;
}

export function AdoptionHelpDetail({ item }: Props) {
  const presentation = getHelpPresentation(item);
  const dogTitle = usefulHelpValue(item.dogName) ?? item.title;
  return <HelpDetailShell item={item} title={dogTitle} contextTitle={dogTitle !== item.title ? item.title : null} sidebar={<>
    <HelpFactsCard facts={[
      usefulHelpValue(item.breed) && { label: "Plemeno / typ", value: item.breed },
      usefulHelpValue(item.ageNote) && { label: "Vek", value: item.ageNote },
      location(item) && { label: "Lokalita", value: location(item) },
      usefulHelpValue(item.organization) && { label: "Organizácia", value: item.organization },
      item.reportedDate && { label: "Zverejnené / hlásené", value: formatHelpDate(item.reportedDate) },
    ]} />
    <GenericContacts item={item} />
  </>}>
    {presentation.description && <HelpSection eyebrow="Adopcia" title="O psovi"><HelpParagraphs value={presentation.description} /></HelpSection>}
    {item.resolved && <HelpSection title="Stav adopcie"><p>Tento záznam je označený ako ukončený alebo vyriešený. Pred ďalším kontaktovaním si overte aktuálny stav u uvedenej organizácie.</p></HelpSection>}
  </HelpDetailShell>;
}

export function FosterHelpDetail({ item }: Props) {
  const presentation = getHelpPresentation(item);
  const dogTitle = usefulHelpValue(item.dogName) ?? item.title;
  return <HelpDetailShell item={item} title={dogTitle} contextTitle={dogTitle !== item.title ? item.title : null} sidebar={<>
    <HelpFactsCard facts={[
      usefulHelpValue(item.organization) && { label: "Organizácia", value: item.organization },
      usefulHelpValue(item.breed) && { label: "Plemeno / typ", value: item.breed },
      usefulHelpValue(item.ageNote) && { label: "Vek", value: item.ageNote },
      location(item) && { label: "Lokalita", value: location(item) },
      item.deadlineDate && { label: "Termín", value: formatHelpDate(item.deadlineDate) },
    ]} />
    <GenericContacts item={item} />
  </>}>
    {presentation.description && <HelpSection eyebrow="Dočasná opatera" title="O výzve"><HelpParagraphs value={presentation.description} /></HelpSection>}
    {presentation.contactNote && <HelpSection title="Podmienky a dôležité informácie"><HelpParagraphs value={presentation.contactNote} /></HelpSection>}
  </HelpDetailShell>;
}

export function FundraiserHelpDetail({ item }: Props) {
  const presentation = getHelpPresentation(item);
  return <HelpDetailShell item={item} sidebar={<>
    <HelpFactsCard facts={[
      usefulHelpValue(item.organization) && { label: "Organizátor", value: item.organization },
      location(item) && { label: "Lokalita", value: location(item) },
      item.deadlineDate && { label: "Termín", value: formatHelpDate(item.deadlineDate) },
      { label: "Overenie", value: item.verified ? "Overené Psipediou" : "Odkaz zatiaľ nie je redakčne overený" },
    ]} />
    <HelpProgressCard item={item} />
    <GenericContacts item={item} />
  </>}>
    {presentation.description && <HelpSection eyebrow="Finančná pomoc" title="Účel zbierky"><HelpParagraphs value={presentation.description} /></HelpSection>}
    {!item.verified && <HelpSection title="Prečo odkaz nemusí byť dostupný"><p>Psipedia verejný odkaz na zbierku sprístupní až po redakčnom overení. Neoverený stav neznamená, že organizátor je nedôveryhodný; znamená iba, že tento záznam ešte nemá potvrdené overenie.</p></HelpSection>}
  </HelpDetailShell>;
}

export function VolunteerHelpDetail({ item }: Props) {
  const presentation = getHelpPresentation(item);
  return <HelpDetailShell item={item} sidebar={<>
    <HelpFactsCard facts={[
      usefulHelpValue(item.organization) && { label: "Organizácia", value: item.organization },
      location(item) && { label: "Lokalita", value: location(item) },
      item.deadlineDate && { label: "Termín", value: formatHelpDate(item.deadlineDate) },
    ]} />
    <GenericContacts item={item} />
  </>}>
    {presentation.description && <HelpSection eyebrow="Dobrovoľnícka a materiálna pomoc" title="Ako môžete pomôcť"><HelpParagraphs value={presentation.description} /></HelpSection>}
    {presentation.helpOptions.length > 0 && <HelpSection title="Možnosti zapojenia"><HelpOptions options={presentation.helpOptions} /></HelpSection>}
  </HelpDetailShell>;
}

export function GenericCaseHelpDetail({ item }: Props) {
  const presentation = getHelpPresentation(item);
  const dogTitle = usefulHelpValue(item.dogName) ?? item.title;
  return <HelpDetailShell item={item} title={dogTitle} contextTitle={dogTitle !== item.title ? item.title : null} sidebar={<>
    <HelpFactsCard facts={[
      usefulHelpValue(item.organization) && { label: "Zodpovedá", value: item.organization },
      usefulHelpValue(item.breed) && { label: "Plemeno / typ", value: item.breed },
      usefulHelpValue(item.ageNote) && { label: "Vek", value: item.ageNote },
      location(item) && { label: "Lokalita", value: location(item) },
      item.reportedDate && { label: "Dátum prípadu", value: formatHelpDate(item.reportedDate) },
      item.deadlineDate && { label: "Termín", value: formatHelpDate(item.deadlineDate) },
    ]} />
    <GenericContacts item={item} />
  </>}>
    {presentation.description && <HelpSection eyebrow="Pomoc psom" title="O prípade"><HelpParagraphs value={presentation.description} /></HelpSection>}
  </HelpDetailShell>;
}

export const helpDetailViews: Record<HelpCategorySlug, (props: Props) => React.ReactNode> = {
  utulky: OrganizationHelpDetail,
  adopcia: AdoptionHelpDetail,
  "docasna-opatera": FosterHelpDetail,
  zbierky: FundraiserHelpDetail,
  dobrovolnictvo: VolunteerHelpDetail,
  "stratene-a-najdene": GenericCaseHelpDetail,
  "urgentne-pripady": GenericCaseHelpDetail,
};
