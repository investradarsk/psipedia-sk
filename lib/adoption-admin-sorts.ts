/** Runtime-safe sort options shared by the client and Cloudflare D1 listing. */
export const adoptionAdminSorts = ["updated-desc", "updated-asc", "verified-desc", "verified-asc", "name-asc", "name-desc"] as const;
export type AdoptionAdminSort = (typeof adoptionAdminSorts)[number];
