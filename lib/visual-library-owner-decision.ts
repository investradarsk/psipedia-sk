/**
 * An owner decision is a review request, NEVER a database write or merge.
 * Keep this pure so the request can be validated independently of React UI.
 */
export type OwnerDecisionKind =
  | "keep-separate"
  | "already-shared"
  | "use-left"
  | "use-right"
  | "new-shared";

export const OWNER_DECISION_OPTIONS: readonly {
  value: OwnerDecisionKind;
  label: string;
  description: string;
}[] = [
  { value: "use-left", label: "Zjednotiť podľa A", description: "Zachovať vzhľad A a nahradiť odlišnú implementáciu B" },
  { value: "use-right", label: "Zjednotiť podľa B", description: "Zachovať vzhľad B a nahradiť odlišnú implementáciu A" },
  { value: "new-shared", label: "Nový spoločný vzhľad", description: "Vytvoriť jeden spoločný komponent podľa ďalších pokynov" },
  { value: "already-shared", label: "Už je to spoločný komponent", description: "Overiť, či ide iba o dva obsahové varianty bez duplicitnej implementácie" },
  { value: "keep-separate", label: "Ponechať rozdielne", description: "Oba prvky majú odlišný účel a netreba ich spájať" },
];

export type OwnerDecisionUse = {
  url: string;
  placement: string;
  anchorId?: string;
  evidence?: string;
};

export type OwnerDecisionGroup = {
  id: string;
  title: string;
  paths: readonly string[];
  routes: readonly string[];
  knownUses: readonly OwnerDecisionUse[];
};

function groupSummary(prefix: string, group: OwnerDecisionGroup, variantLabel: string): string[] {
  return [
    prefix + ": " + group.title + " (" + group.id + ")",
    prefix + " – zobrazený variant: " + variantLabel,
    ...group.knownUses.map((use) =>
      prefix + " – doložená URL: " + use.url + (use.anchorId ? "#" + use.anchorId : "") +
      " | " + use.placement + " | " + (use.evidence || "neznámy dôkaz")),
    ...group.routes.map((route) =>
      prefix + " – kandidátska šablóna (nie overená URL): " + route),
    ...group.paths.map((path) => prefix + " – zdroj na kontrolu: " + path),
  ];
}

export function buildOwnerDecisionRequest({
  left, right, leftVariant, rightVariant, decision, notes,
}: {
  left: OwnerDecisionGroup;
  right: OwnerDecisionGroup;
  leftVariant: string;
  rightVariant: string;
  decision: OwnerDecisionKind;
  notes?: string;
}): string {
  if (!left.id || !right.id || left.id === right.id) return "";
  const option = OWNER_DECISION_OPTIONS.find((item) => item.value === decision);
  if (!option) return "";

  return [
    "PSIPEDIA.SK – rozhodnutie vlastníka z vizuálnej knižnice (návrh na spracovanie)",
    "Rozhodnutie: " + option.label,
    "Význam: " + option.description,
    ...groupSummary("A", left, leftVariant),
    ...groupSummary("B", right, rightVariant),
    "Doplnkové pokyny: " + (notes?.trim() || "bez doplnkových pokynov"),
    "Pred akýmkoľvek zlučovaním over identitu skutočných komponentov, všetky používané URL a ich vzhľad na desktope.",
    "Statický import nie je dôkaz renderu; chýbajúce profily a neznáme URL nevymýšľaj.",
    decision === "keep-separate"
      ? "Nemeníme zdrojové komponenty. Iba rešpektujeme rozhodnutie ponechať rozdielne."
      : decision === "already-shared"
        ? "Najprv over, či už ide o jednu implementáciu. Ak áno, nemaž nič a nevytváraj nový komponent."
        : "Ak ide o skutočne duplicitné implementácie, priprav samostatný PR s jedným zdieľaným zdrojom a odstráň zbytočné kópie až po regresných testoch.",
    "Verejný mobilný dizajn bez nevyžiadaných zmien. Nezasahovať do Notion, D1 ani produkčných dát.",
    "Toto kopírované zadanie nie je automatické schválenie merge ani publikovania na produkcii.",
  ].join("\n");
}
