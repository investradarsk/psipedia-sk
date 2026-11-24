import { DIRECTORY_QUALITY_RECHECK_DAYS, directoryQualityResolutionStatuses, type DirectoryQualityField } from "./directory-profile-metadata.ts";

export function qualityResolutionCurrentSql(field: DirectoryQualityField) {
  // The five quality statuses live in one indexed SQL relation. Never read
  // retired _psipedia_quality_* aliases from historic source JSON.
  const statuses = directoryQualityResolutionStatuses.map(status=>`'${status}'`).join(",");
  return `EXISTS (
    SELECT 1 FROM directory_profile_quality_resolutions qr
    WHERE qr.profile_id=directory_profiles.id
      AND qr.quality_field='${field}'
      AND qr.resolution_status IN (${statuses})
      AND datetime(qr.checked_at) >= datetime('now', '-${DIRECTORY_QUALITY_RECHECK_DAYS} days')
  )`;
}

