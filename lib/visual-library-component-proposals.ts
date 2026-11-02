/** Safe, admin-only text proposals for a small allowlist of real reusable UI.
 * Proposals NEVER change the public site, even after saving to D1.
 * A separate audited public render contract is required before publishing.
 */
export const visualComponentProposalPresets = {
  actions: {
    label: "Spoločné CTA odkazy", kind: "actions",
    fields: ["title", "description", "actionLabel"],
    original: {
      eyebrow: "",
      title: "Primárna akcia",
      description: "Sekundárna akcia",
      actionLabel: "Textový odkaz",
    },
  },
  "section-header": {
    label: "Hlavička sekcie", kind: "section-header",
    fields: ["eyebrow", "title", "description"],
    original: {
      eyebrow: "Starostlivosť",
      title: "Ako sa starať o psa",
      description: "Odborné rady a užitočné informácie pre majiteľov psov.",
      actionLabel: "",
    },
  },
  "data-card": {
    label: "Dátová karta služby", kind: "data-card",
    fields: ["eyebrow", "title", "description", "actionLabel"],
    original: {
      eyebrow: "Služby",
      title: "Veterinárne služby",
      description: "Ukážkový profil odborníka.",
      actionLabel: "Pozrieť profil",
    },
  },
  "landing-hero-events": {
    label: "Úvodný blok podujatí", kind: "landing-hero-events",
    fields: ["eyebrow", "title", "description"],
    original: {
      eyebrow: "Podujatia",
      title: "Čo sa deje vo vašom okolí",
      description: "Výstavy, športové podujatia a ďalšie stretnutia.",
      actionLabel: "",
    },
  },
} as const;

export type VisualComponentProposalId = keyof typeof visualComponentProposalPresets;
export type VisualComponentProposal = {
  eyebrow: string; title: string; description: string; actionLabel: string;
};

export function isVisualComponentProposalId(value: unknown): value is VisualComponentProposalId {
  return typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(visualComponentProposalPresets, value);
}

export function validateVisualComponentProposal(
  id: unknown, value: unknown,
): { id: VisualComponentProposalId; draft: VisualComponentProposal } {
  if (!isVisualComponentProposalId(id)) throw new Error("Neznáma alebo neupraviteľná vizuálna ukážka.");
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Návrh musí obsahovať platné textové polia.");
  }
  const record = value as Record<string, unknown>;
  const fields = ["eyebrow", "title", "description", "actionLabel"] as const;
  for (const key of Object.keys(record)) {
    if (!fields.includes(key as typeof fields[number])) throw new Error("Nepovolené pole vizuálneho návrhu.");
  }
  const draft = {} as VisualComponentProposal;
  const limits: Record<typeof fields[number], number> = {
    eyebrow: 100, title: 140, description: 360, actionLabel: 80,
  };
  for (const field of fields) {
    if (typeof record[field] !== "string") throw new Error("Neplatné textové pole: " + field);
    const trimmed = record[field].trim();
    if (trimmed.length > limits[field] || /[\u0000-\u001f\u007f]/.test(trimmed)) {
      throw new Error("Prekročená dĺžka alebo nepovolené znaky v poli: " + field);
    }
    draft[field] = trimmed;
  }
  const preset = visualComponentProposalPresets[id];
  for (const field of preset.fields) {
    if (!draft[field]) throw new Error("Povinné pole je prázdne: " + field);
  }
  return { id, draft };
}
