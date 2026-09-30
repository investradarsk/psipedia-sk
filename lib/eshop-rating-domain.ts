export const ESHOP_RATING_FIELDS = [
  { key: "delivery", label: "Doručenie" },
  { key: "communication", label: "Komunikácia" },
  { key: "assortment", label: "Sortiment" },
  { key: "price", label: "Ceny" },
  { key: "overall", label: "Celková skúsenosť" },
] as const;

export type EshopRatingField = (typeof ESHOP_RATING_FIELDS)[number]["key"];
export type EshopRatingInput = {
  delivery: number;
  communication: number;
  assortment: number;
  price: number;
  overall: number;
};
