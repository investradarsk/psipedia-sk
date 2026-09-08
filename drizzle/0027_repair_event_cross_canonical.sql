-- Repair the final event cross-canonical reported by the production crawler.
UPDATE `managed_events`
SET `seo_json` = json_set(`seo_json`, '$.canonicalUrl', 'https://psipedia.sk/podujatia/psi-talent-2026-galanta'),
    `updated_at` = CURRENT_TIMESTAMP,
    `updated_by` = 'production-health-audit'
WHERE `slug` = 'psi-talent-2026-galanta'
  AND json_valid(`seo_json`)
  AND json_extract(`seo_json`, '$.canonicalUrl') = 'https://psipedia.sk/novinky/psi-talent-2026-galanta';
