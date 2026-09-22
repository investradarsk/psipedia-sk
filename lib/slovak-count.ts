export type SlovakCountForms = {
  one: string;
  few: string;
  many: string;
};

export function slovakCountLabel(count: number, forms: SlovakCountForms) {
  if (count === 1) return forms.one;
  if (count >= 2 && count <= 4) return forms.few;
  return forms.many;
}

export function formatSlovakCount(count: number, forms: SlovakCountForms) {
  return `${count} ${slovakCountLabel(count, forms)}`;
}
