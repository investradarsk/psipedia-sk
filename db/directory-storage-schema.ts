/**
 * Additive-only Directory D1 SQL owners introduced by migration 0173.
 * SQL CHECK constraints are enforced by the migration itself.
 *
 * These tables are NOT yet wired into existing Admin, Notion or public
 * readers/writers. Until explicit cutover, current JSON-backed features
 * and reviewed-profile guards remain functional.
 */
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { directoryProfiles } from "./schema";

export const directoryProfileQualifications = sqliteTable(
  "directory_profile_qualifications",
  {
    profileId: integer("profile_id").notNull().references(() => directoryProfiles.id, { onDelete: "cascade" }),
    itemOrder: integer("item_order").notNull(),
    qualificationText: text("qualification_text").notNull(),
    updatedAt: text("updated_at").notNull(),
    updatedBy: text("updated_by").notNull(),
  },
  table => [
    primaryKey({ columns: [table.profileId, table.itemOrder] }),
    index("directory_profile_qualifications_profile_idx").on(table.profileId, table.itemOrder),
  ],
);

/**
 * dayOfWeek: 1=Monday ... 7=Sunday, 0=special/general-hours note.
 * hoursText retains text such as split shifts or appointment-only.
 */
export const directoryProfileOpeningHours = sqliteTable(
  "directory_profile_opening_hours",
  {
    profileId: integer("profile_id").notNull().references(() => directoryProfiles.id, { onDelete: "cascade" }),
    dayOfWeek: integer("day_of_week").notNull(),
    hoursText: text("hours_text").notNull(),
    updatedAt: text("updated_at").notNull(),
    updatedBy: text("updated_by").notNull(),
  },
  table => [
    primaryKey({ columns: [table.profileId, table.dayOfWeek] }),
    index("directory_profile_opening_hours_profile_idx").on(table.profileId, table.dayOfWeek),
  ],
);

export const directoryProfileMedia = sqliteTable(
  "directory_profile_media",
  {
    profileId: integer("profile_id").notNull().references(() => directoryProfiles.id, { onDelete: "cascade" }),
    itemOrder: integer("item_order").notNull(),
    imageUrl: text("image_url"),
    imageKey: text("image_key"),
    altText: text("alt_text").notNull().default(""),
    attributionText: text("attribution_text").notNull().default(""),
    updatedAt: text("updated_at").notNull(),
    updatedBy: text("updated_by").notNull(),
  },
  table => [
    primaryKey({ columns: [table.profileId, table.itemOrder] }),
    index("directory_profile_media_profile_idx").on(table.profileId, table.itemOrder),
  ],
);

export const directoryProfileSeo = sqliteTable(
  "directory_profile_seo",
  {
    profileId: integer("profile_id").primaryKey().references(() => directoryProfiles.id, { onDelete: "cascade" }),
    title: text("title").notNull().default(""),
    description: text("description").notNull().default(""),
    focusKeyword: text("focus_keyword").notNull().default(""),
    canonicalUrl: text("canonical_url").notNull().default(""),
    ogTitle: text("og_title").notNull().default(""),
    ogDescription: text("og_description").notNull().default(""),
    ogImageUrl: text("og_image_url").notNull().default(""),
    noindex: integer("noindex").notNull().default(0),
    updatedAt: text("updated_at").notNull(),
    updatedBy: text("updated_by").notNull(),
  },
);

export const directoryProfileReviewState = sqliteTable(
  "directory_profile_review_state",
  {
    profileId: integer("profile_id").primaryKey().references(() => directoryProfiles.id, { onDelete: "cascade" }),
    reviewedAt: text("reviewed_at"),
    reviewedBy: text("reviewed_by"),
    unlockPending: integer("unlock_pending").notNull().default(0),
    unlockRequestedAt: text("unlock_requested_at"),
    unlockRequestedBy: text("unlock_requested_by"),
    updatedAt: text("updated_at").notNull(),
    updatedBy: text("updated_by").notNull(),
  },
  table => [
    index("directory_profile_review_state_locked_idx").on(table.unlockPending, table.reviewedAt),
  ],
);

export const directoryProfileQualityResolutions = sqliteTable(
  "directory_profile_quality_resolutions",
  {
    profileId: integer("profile_id").notNull().references(() => directoryProfiles.id, { onDelete: "cascade" }),
    qualityField: text("quality_field").notNull(),
    resolutionStatus: text("resolution_status").notNull(),
    checkedAt: text("checked_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    updatedBy: text("updated_by").notNull(),
  },
  table => [
    primaryKey({ columns: [table.profileId, table.qualityField] }),
    index("directory_profile_quality_resolutions_checked_idx").on(table.qualityField, table.checkedAt),
  ],
);
