import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { reviewAuthors } from "./review-schema";

export const managedEshops = sqliteTable("managed_eshops", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  websiteUrl: text("website_url").notNull(),
  description: text("description").notNull().default(""),
  sourceUrl: text("source_url").notNull(),
  logoUrl: text("logo_url"),
  logoKey: text("logo_key"),
  focusTagsJson: text("focus_tags_json").notNull().default("[]"),
  status: text("status").notNull().default("draft"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  publishedAt: text("published_at"),
  createdBy: text("created_by").notNull(),
  updatedBy: text("updated_by").notNull(),
}, table => [
  uniqueIndex("managed_eshops_slug_unique").on(table.slug),
  check("managed_eshops_status_check", sql`${table.status} IN ('draft','published','archived')`),
  index("managed_eshops_public_idx").on(table.status, table.name),
]);

export const eshopRatings = sqliteTable("eshop_ratings", {
  id: text("id").primaryKey(),
  eshopId: integer("eshop_id").notNull().references(() => managedEshops.id, { onDelete: "restrict" }),
  authorId: text("author_id").notNull().references(() => reviewAuthors.id, { onDelete: "restrict" }),
  deliveryRating: integer("delivery_rating").notNull(),
  communicationRating: integer("communication_rating").notNull(),
  assortmentRating: integer("assortment_rating").notNull(),
  priceRating: integer("price_rating").notNull(),
  overallRating: integer("overall_rating").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, table => [
  check("eshop_ratings_delivery_check", sql`${table.deliveryRating} BETWEEN 1 AND 5`),
  check("eshop_ratings_communication_check", sql`${table.communicationRating} BETWEEN 1 AND 5`),
  check("eshop_ratings_assortment_check", sql`${table.assortmentRating} BETWEEN 1 AND 5`),
  check("eshop_ratings_price_check", sql`${table.priceRating} BETWEEN 1 AND 5`),
  check("eshop_ratings_overall_check", sql`${table.overallRating} BETWEEN 1 AND 5`),
  uniqueIndex("eshop_ratings_eshop_author_unique").on(table.eshopId, table.authorId),
  index("eshop_ratings_eshop_updated_idx").on(table.eshopId, table.updatedAt),
  index("eshop_ratings_author_updated_idx").on(table.authorId, table.updatedAt),
]);
