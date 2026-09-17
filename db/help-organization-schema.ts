import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { directoryProfiles } from "./schema";

export const helpOrganizations = sqliteTable(
  "help_organizations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    legalName: text("legal_name").notNull().default(""),
    registrationNumber: text("registration_number"),
    type: text("type").notNull().default("OTHER"),
    status: text("status").notNull().default("DRAFT"),
    shortDescription: text("short_description").notNull().default(""),
    description: text("description").notNull().default(""),
    publicEmail: text("public_email"),
    publicPhone: text("public_phone"),
    websiteUrl: text("website_url"),
    facebookUrl: text("facebook_url"),
    instagramUrl: text("instagram_url"),
    address: text("address").notNull().default(""),
    city: text("city").notNull().default(""),
    district: text("district").notNull().default(""),
    region: text("region").notNull().default(""),
    countryCode: text("country_code").notNull().default("SK"),
    imageUrl: text("image_url"),
    imageKey: text("image_key"),
    directoryProfileId: integer("directory_profile_id").references(() => directoryProfiles.id, { onDelete: "set null" }),
    importKey: text("import_key"),
    sourceUrl: text("source_url"),
    sourceDataJson: text("source_data_json").notNull().default("{}"),
    seoJson: text("seo_json").notNull().default("{}"),
    publishedAt: text("published_at"),
    lastVerifiedAt: text("last_verified_at"),
    archivedAt: text("archived_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    createdBy: text("created_by").notNull(),
    updatedBy: text("updated_by").notNull(),
  },
  (table) => [
    uniqueIndex("help_organizations_slug_unique").on(table.slug),
    uniqueIndex("help_organizations_import_key_unique").on(table.importKey),
    uniqueIndex("help_organizations_directory_profile_unique").on(table.directoryProfileId),
    index("help_organizations_public_idx").on(table.status, table.region, table.city, table.name),
    index("help_organizations_type_status_idx").on(table.type, table.status),
    index("help_organizations_registration_idx").on(table.registrationNumber),
    index("help_organizations_updated_idx").on(table.updatedAt, table.id),
  ],
);

export const organizationLocationRoles = ["UNSPECIFIED", "SITE", "LEGAL_SEAT", "SERVICE_AREA"] as const;

export const organizationLocations = sqliteTable(
  "organization_locations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => helpOrganizations.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("UNSPECIFIED"),
    label: text("label").notNull().default(""),
    address: text("address").notNull().default(""),
    city: text("city").notNull().default(""),
    district: text("district").notNull().default(""),
    region: text("region").notNull().default(""),
    countryCode: text("country_code").notNull().default("SK"),
    isPrimary: integer("is_primary").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    check(
      "organization_locations_role_check",
      sql`${table.role} IN ('UNSPECIFIED', 'SITE', 'LEGAL_SEAT', 'SERVICE_AREA')`,
    ),
    check("organization_locations_is_primary_check", sql`${table.isPrimary} IN (0, 1)`),
    index("organization_locations_org_order_idx").on(table.organizationId, table.sortOrder, table.id),
    uniqueIndex("organization_locations_one_primary_idx")
      .on(table.organizationId)
      .where(sql`${table.isPrimary} = 1`),
  ],
);
