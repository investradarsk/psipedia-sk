import type { AutomationEntityType } from "./data-automation.ts";

export type AutomationEnrichmentPriority = "IDENTITY" | "HIGH_VALUE" | "OPTIONAL";
export type AutomationEnrichmentGroup = "CONTACT" | "LOCATION" | "DETAIL";
export type AutomationEnrichmentNormalizer =
  | "TEXT" | "LONG_TEXT" | "PHONE" | "EMAIL" | "URL" | "FACEBOOK" | "INSTAGRAM"
  | "DATE" | "TIME" | "NUMBER" | "BOOLEAN" | "STRING_ARRAY";

export type EntityEnrichmentField = {
  canonicalField: string;
  aliases: string[];
  priority: AutomationEnrichmentPriority;
  requiredForDraft: boolean;
  enrichmentAllowed: boolean;
  group: AutomationEnrichmentGroup | null;
  normalization: AutomationEnrichmentNormalizer;
};

export type EntityEnrichmentTemplate = {
  entityType: AutomationEntityType;
  fields: Record<string, EntityEnrichmentField>;
};

const f = (
  canonicalField: string,
  priority: AutomationEnrichmentPriority,
  normalization: AutomationEnrichmentNormalizer,
  options: Partial<Pick<EntityEnrichmentField, "aliases" | "requiredForDraft" | "enrichmentAllowed" | "group">> = {},
): EntityEnrichmentField => ({
  canonicalField,
  priority,
  normalization,
  aliases: options.aliases ?? [],
  requiredForDraft: options.requiredForDraft ?? false,
  enrichmentAllowed: options.enrichmentAllowed ?? false,
  group: options.group ?? null,
});

const fields = (items: EntityEnrichmentField[]) =>
  Object.fromEntries(items.map((item) => [item.canonicalField, item]));

const DIRECTORY = fields([
  f("name","IDENTITY","TEXT",{requiredForDraft:true}),
  f("category","IDENTITY","TEXT",{requiredForDraft:true}),
  f("semanticKind","IDENTITY","TEXT",{aliases:["semantic_kind"]}),
  f("websiteUrl","IDENTITY","URL",{aliases:["website_url"]}),
  f("publicPhone","HIGH_VALUE","PHONE",{enrichmentAllowed:true,group:"CONTACT"}),
  f("publicEmail","HIGH_VALUE","EMAIL",{enrichmentAllowed:true,group:"CONTACT"}),
  f("description","HIGH_VALUE","LONG_TEXT",{enrichmentAllowed:true,group:"DETAIL"}),
  ...["city","district","region","address","street"].map((key) =>
    f(key,"HIGH_VALUE","TEXT",{enrichmentAllowed:true,group:"LOCATION"})),
  f("postalCode","HIGH_VALUE","TEXT",{aliases:["postal_code"],enrichmentAllowed:true,group:"LOCATION"}),
  f("houseNumber","HIGH_VALUE","TEXT",{aliases:["house_number"],enrichmentAllowed:true,group:"LOCATION"}),
  f("addressFormat","HIGH_VALUE","TEXT",{aliases:["address_format"]}),
  f("excerpt","OPTIONAL","LONG_TEXT"),
  f("services","OPTIONAL","STRING_ARRAY",{enrichmentAllowed:true,group:"DETAIL"}),
  f("qualifications","OPTIONAL","STRING_ARRAY",{enrichmentAllowed:true,group:"DETAIL"}),
  f("online","OPTIONAL","BOOLEAN"),
  f("priceNote","OPTIONAL","LONG_TEXT",{aliases:["price_note"]}),
  f("importKey","OPTIONAL","TEXT",{aliases:["import_key"]}),
  f("verified","OPTIONAL","BOOLEAN"),
  f("facebookUrl","OPTIONAL","FACEBOOK",{enrichmentAllowed:true,group:"CONTACT"}),
  f("instagramUrl","OPTIONAL","INSTAGRAM",{enrichmentAllowed:true,group:"CONTACT"}),
]);

const ORGANIZATION = fields([
  f("name","IDENTITY","TEXT",{requiredForDraft:true}),
  f("websiteUrl","IDENTITY","URL",{aliases:["website_url"],enrichmentAllowed:true,group:"CONTACT"}),
  f("legalName","HIGH_VALUE","TEXT",{aliases:["legal_name"],enrichmentAllowed:true,group:"DETAIL"}),
  f("registrationNumber","HIGH_VALUE","TEXT",{aliases:["registration_number"],enrichmentAllowed:true,group:"DETAIL"}),
  f("type","HIGH_VALUE","TEXT"),
  f("shortDescription","HIGH_VALUE","LONG_TEXT",{aliases:["short_description"],enrichmentAllowed:true,group:"DETAIL"}),
  f("description","HIGH_VALUE","LONG_TEXT",{enrichmentAllowed:true,group:"DETAIL"}),
  f("publicEmail","HIGH_VALUE","EMAIL",{aliases:["public_email"],enrichmentAllowed:true,group:"CONTACT"}),
  f("publicPhone","HIGH_VALUE","PHONE",{aliases:["public_phone"],enrichmentAllowed:true,group:"CONTACT"}),
  ...["address","city","district","region"].map((key) => f(key,"HIGH_VALUE","TEXT",{group:"LOCATION"})),
  f("facebookUrl","OPTIONAL","FACEBOOK",{aliases:["facebook_url"],enrichmentAllowed:true,group:"CONTACT"}),
  f("instagramUrl","OPTIONAL","INSTAGRAM",{aliases:["instagram_url"],enrichmentAllowed:true,group:"CONTACT"}),
  f("imageUrl","OPTIONAL","URL",{aliases:["image_url"]}),
  f("countryCode","OPTIONAL","TEXT",{aliases:["country_code"]}),
  f("importKey","OPTIONAL","TEXT",{aliases:["import_key"]}),
  f("sourceUrl","OPTIONAL","URL",{aliases:["source_url"]}),
  f("lastVerifiedAt","OPTIONAL","TEXT",{aliases:["last_verified_at"]}),
  f("operatorName","OPTIONAL","TEXT"),
  f("sourceApprovalNumber","OPTIONAL","TEXT"),
  f("sourceActivity","OPTIONAL","LONG_TEXT"),
]);

const EVENT = fields([
  f("title","IDENTITY","TEXT",{requiredForDraft:true}),
  f("startDate","IDENTITY","DATE",{aliases:["start_date"],requiredForDraft:true}),
  f("eventType","HIGH_VALUE","TEXT",{aliases:["event_type"],enrichmentAllowed:true,group:"DETAIL"}),
  f("endDate","HIGH_VALUE","DATE",{aliases:["end_date"],enrichmentAllowed:true,group:"DETAIL"}),
  f("startTime","HIGH_VALUE","TIME",{aliases:["start_time"],enrichmentAllowed:true,group:"DETAIL"}),
  f("endTime","HIGH_VALUE","TIME",{aliases:["end_time"],enrichmentAllowed:true,group:"DETAIL"}),
  ...["venue","city","region"].map((key) => f(key,"HIGH_VALUE","TEXT",{enrichmentAllowed:true,group:"LOCATION"})),
  ...["organizer","description","practicalInfo"].map((key) =>
    f(key,"HIGH_VALUE", key === "description" || key === "practicalInfo" ? "LONG_TEXT" : "TEXT",{enrichmentAllowed:true,group:"DETAIL"})),
  f("websiteUrl","HIGH_VALUE","URL",{aliases:["website_url"],enrichmentAllowed:true,group:"DETAIL"}),
  f("registrationUrl","HIGH_VALUE","URL",{aliases:["registration_url"],enrichmentAllowed:true,group:"DETAIL"}),
  f("excerpt","OPTIONAL","LONG_TEXT"),
  f("address","OPTIONAL","TEXT",{enrichmentAllowed:true,group:"LOCATION"}),
  f("imageUrl","OPTIONAL","URL",{aliases:["image_url"]}),
  f("cancelled","OPTIONAL","BOOLEAN"),
]);

const ADOPTION = fields([
  f("name","IDENTITY","TEXT",{requiredForDraft:true}),
  f("externalSourceUrl","IDENTITY","URL",{aliases:["external_source_url"]}),
  f("organizationName","HIGH_VALUE","TEXT",{aliases:["organization_name"]}),
  f("sex","HIGH_VALUE","TEXT",{enrichmentAllowed:true,group:"DETAIL"}),
  f("birthDate","HIGH_VALUE","DATE",{aliases:["birth_date"],enrichmentAllowed:true,group:"DETAIL"}),
  f("approximateAgeMonths","HIGH_VALUE","NUMBER",{aliases:["approximate_age_months"],enrichmentAllowed:true,group:"DETAIL"}),
  f("size","HIGH_VALUE","TEXT",{enrichmentAllowed:true,group:"DETAIL"}),
  f("weight","HIGH_VALUE","NUMBER",{enrichmentAllowed:true,group:"DETAIL"}),
  f("breedName","HIGH_VALUE","TEXT",{aliases:["breed_name"],enrichmentAllowed:true,group:"DETAIL"}),
  f("breedMix","HIGH_VALUE","BOOLEAN",{aliases:["breed_mix"],enrichmentAllowed:true,group:"DETAIL"}),
  f("color","HIGH_VALUE","TEXT",{enrichmentAllowed:true,group:"DETAIL"}),
  ...["region","district","city"].map((key) => f(key,"HIGH_VALUE","TEXT")),
  f("shortDescription","HIGH_VALUE","LONG_TEXT",{aliases:["short_description"],enrichmentAllowed:true,group:"DETAIL"}),
  f("description","HIGH_VALUE","LONG_TEXT",{enrichmentAllowed:true,group:"DETAIL"}),
  f("lastVerifiedAt","OPTIONAL","TEXT",{aliases:["last_verified_at"]}),
]);

const HELP_LIKE = (entityType: "FOSTER" | "HELP_ITEM") => fields([
  f("title","IDENTITY","TEXT",{requiredForDraft:true}),
  ...(entityType === "HELP_ITEM" ? [f("category","IDENTITY","TEXT",{requiredForDraft:true})] : []),
  f("dogName","IDENTITY","TEXT",{aliases:["dog_name"]}),
  f("actionUrl","IDENTITY","URL",{aliases:["action_url"]}),
  f("organization","HIGH_VALUE","TEXT"),
  f("breed","HIGH_VALUE","TEXT",{enrichmentAllowed:true,group:"DETAIL"}),
  f("ageNote","HIGH_VALUE","TEXT",{aliases:["age_note"],enrichmentAllowed:true,group:"DETAIL"}),
  f("description","HIGH_VALUE","LONG_TEXT",{enrichmentAllowed:true,group:"DETAIL"}),
  f("city","HIGH_VALUE","TEXT"),
  f("region","HIGH_VALUE","TEXT"),
  f("locationNote","HIGH_VALUE","TEXT",{aliases:["location_note"]}),
  f("excerpt","OPTIONAL","LONG_TEXT"),
  f("reportedDate","OPTIONAL","DATE",{aliases:["reported_date"]}),
  f("deadlineDate","OPTIONAL","DATE",{aliases:["deadline_date"]}),
  f("contactNote","OPTIONAL","LONG_TEXT",{aliases:["contact_note"]}),
  f("goalAmount","OPTIONAL","NUMBER",{aliases:["goal_amount"]}),
  f("raisedAmount","OPTIONAL","NUMBER",{aliases:["raised_amount"]}),
  f("verified","OPTIONAL","BOOLEAN"),
  f("urgent","OPTIONAL","BOOLEAN"),
  f("resolved","OPTIONAL","BOOLEAN"),
]);

const LOST_FOUND = fields([
  f("type","IDENTITY","TEXT",{requiredForDraft:true}),
  f("eventDate","IDENTITY","DATE",{aliases:["event_date"]}),
  f("sourceUrl","IDENTITY","URL",{aliases:["source_url"]}),
  f("dogName","HIGH_VALUE","TEXT",{aliases:["dog_name"]}),
  f("description","HIGH_VALUE","LONG_TEXT"),
  ...["city","district","region","source"].map((key) => f(key,"HIGH_VALUE","TEXT")),
  f("locationDescription","HIGH_VALUE","TEXT",{aliases:["location_description"]}),
  f("sex","OPTIONAL","TEXT"),f("breed","OPTIONAL","TEXT"),f("color","OPTIONAL","TEXT"),
  f("approximateAge","OPTIONAL","TEXT",{aliases:["approximate_age"]}),f("size","OPTIONAL","TEXT"),
]);

export const automationEntityEnrichmentTemplates: Readonly<Record<AutomationEntityType, EntityEnrichmentTemplate>> =
  Object.freeze({
    DIRECTORY:{entityType:"DIRECTORY",fields:DIRECTORY},
    ORGANIZATION:{entityType:"ORGANIZATION",fields:ORGANIZATION},
    EVENT:{entityType:"EVENT",fields:EVENT},
    ADOPTION:{entityType:"ADOPTION",fields:ADOPTION},
    FOSTER:{entityType:"FOSTER",fields:HELP_LIKE("FOSTER")},
    LOST_FOUND:{entityType:"LOST_FOUND",fields:LOST_FOUND},
    HELP_ITEM:{entityType:"HELP_ITEM",fields:HELP_LIKE("HELP_ITEM")},
  });

export function automationEntityEnrichmentTemplate(entityType: AutomationEntityType) {
  const template = automationEntityEnrichmentTemplates[entityType];
  if (!template) throw new Error("automation_entity_enrichment_template_missing");
  return template;
}
