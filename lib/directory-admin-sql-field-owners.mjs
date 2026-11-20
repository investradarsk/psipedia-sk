/**
 * Directory 1/4: target ownership for every Admin profile-edit payload key.
 * A single relational owner per field; never create a second JSON authority.
 * This is a declarative contract for the later Notion backfill/runtime cutover.
 * Step 1 does NOT redirect existing readers or writers.
 */
export const DIRECTORY_ADMIN_SQL_OWNERS = Object.freeze({
  slug:"directory_profiles.slug",
  name:"directory_profiles.name",
  category:"directory_profiles.category",
  additionalCategories:"directory_profile_additional_categories",
  status:"directory_profiles.status",
  excerpt:"directory_profiles.excerpt",
  description:"directory_profiles.description",
  services:"directory_profile_service_texts",
  trainerServicesText:"directory_profile_extra_fields",
  qualifications:"directory_profile_qualifications",
  city:"directory_profiles.city",
  district:"directory_profiles.district",
  region:"directory_profiles.region",
  address:"directory_profiles.address",
  postalCode:"directory_profiles.postal_code",
  street:"directory_profiles.street",
  houseNumber:"directory_profiles.house_number",
  addressFormat:"directory_profiles.address_format",
  priceNote:"directory_profiles.price_note",
  websiteUrl:"directory_profiles.website_url",
  publicPhone:"directory_profiles.public_phone",
  publicEmail:"directory_profiles.public_email",
  facebookUrl:"directory_profiles.facebook_url",
  instagramUrl:"directory_profiles.instagram_url",
  internalEmail:"directory_profiles.internal_email",
  imageUrl:"directory_profiles.image_url",
  imageKey:"directory_profiles.image_key",
  galleryUrls:"directory_profile_media",
  thumbnailImageDisplay:"directory_profile_image_display_settings",
  detailImageDisplay:"directory_profile_image_display_settings",
  qualityResolutions:"directory_profile_quality_resolutions",
  qualityCheckedAt:"directory_profile_quality_resolutions",
  verified:"directory_profiles.verified",
  featured:"directory_profiles.featured",
  seo:"directory_profile_seo",
  // Transient UI intents modify canonical address columns; never persist
  // provider IDs or unverified checkbox actions as public content.
  confirmServiceAddress:"directory_profiles.service_address_confirmation",
  clearServiceAddressConfirmation:"directory_profiles.service_address_confirmation",
  addressProviderResultId:"action-only",
});

/** Additional Admin fields in the category-scoped detail editor. */
export const DIRECTORY_EDITORIAL_SQL_OWNERS = Object.freeze({
  "Ordinačné hodiny":"directory_profile_opening_hours",
  "Zdroj dát":"directory_profile_extra_fields",
  "Zdroj obrázka":"directory_profile_extra_fields",
  "Alt text obrázka":"directory_profile_extra_fields",
  "Organizácia":"directory_profile_extra_fields",
  "Zameranie":"directory_profile_extra_fields",
  // All other public fact labels are placed through the existing approved
  // registry in directory_profile_public_facts or classified as extras.
  "publicFact":"directory_profile_public_facts",
  "selectFilter":"directory_profile_filter_values",
  "breedRelation":"breed_directory_relations",
  "clubRelation":"existing canonical club relationship",
  "servicesV3":"service_profile_option_choices",
  "reviewed":"directory_profile_review_state",
});

/**
 * Legacy technical array keys to normalize as ordered scalar rows when a
 * dedicated canonical relation is not already present. No JSON blobs.
 */
export const DIRECTORY_EXTRA_LIST_KEYS = Object.freeze([
  "_psipedia_breeder_club_profile_ids",
  "_psipedia_trainer_breed_ids",
  "_psipedia_trainer_club_ids",
  "_psipedia_profile_gallery_urls",
  "_psipedia_breeder_gallery_urls",
]);

/** SQL-backed detail field placement for noncanonical/unknown source keys. */
export function directoryRemainingFieldOwner(fieldKey,{isList=false}={}){
  if(typeof fieldKey!=="string" || !fieldKey.trim() || fieldKey.length>200)
    throw new Error("DIRECTORY_0176_INVALID_FIELD_KEY");
  return isList?"directory_profile_extra_list_items":"directory_profile_extra_fields";
}
