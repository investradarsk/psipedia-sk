-- Repair canonical targets that were confirmed to return 404.
-- Exact slug and old-value guards keep this migration idempotent and preserve later editorial corrections.
UPDATE `managed_articles`
SET `seo_json` = json_set(`seo_json`, '$.canonicalUrl', 'https://psipedia.sk/novinky/prosba-aby-dal-psa-na-vodzku-mala-skoncit-bitkou-incident-v'),
    `updated_at` = CURRENT_TIMESTAMP,
    `updated_by` = 'production-health-audit'
WHERE `slug` = 'prosba-aby-dal-psa-na-vodzku-mala-skoncit-bitkou-incident-v'
  AND json_valid(`seo_json`)
  AND json_extract(`seo_json`, '$.canonicalUrl') = 'https://psipedia.sk/novinky/spor-pes-vodzka-mala-fatra-pravidla';
--> statement-breakpoint
UPDATE `managed_articles`
SET `seo_json` = json_set(`seo_json`, '$.canonicalUrl', 'https://psipedia.sk/aktivity/zakladny-vycvik-psat'),
    `updated_at` = CURRENT_TIMESTAMP,
    `updated_by` = 'production-health-audit'
WHERE `slug` = 'zakladny-vycvik-psat'
  AND json_valid(`seo_json`)
  AND json_extract(`seo_json`, '$.canonicalUrl') = 'https://psipedia.sk/aktivity/zakladny-vycvik-psa';
--> statement-breakpoint
UPDATE `managed_articles`
SET `seo_json` = json_set(`seo_json`, '$.canonicalUrl', 'https://psipedia.sk/novinky/banska-bystrica-riesi-nove-pravidla-pre-psov-majitelia-sa-py'),
    `updated_at` = CURRENT_TIMESTAMP,
    `updated_by` = 'production-health-audit'
WHERE `slug` = 'banska-bystrica-riesi-nove-pravidla-pre-psov-majitelia-sa-py'
  AND json_valid(`seo_json`)
  AND json_extract(`seo_json`, '$.canonicalUrl') = 'https://psipedia.sk/novinky/banska-bystrica-nove-pravidla-psy-vencoviska';
--> statement-breakpoint
UPDATE `managed_events`
SET `seo_json` = json_set(`seo_json`, '$.canonicalUrl', 'https://psipedia.sk/podujatia/psi-talent-2026'),
    `updated_at` = CURRENT_TIMESTAMP,
    `updated_by` = 'production-health-audit'
WHERE `slug` = 'psi-talent-2026'
  AND json_valid(`seo_json`)
  AND json_extract(`seo_json`, '$.canonicalUrl') = 'https://psipedia.sk/podujatia/psi-talent-2026-galanta-hody';
--> statement-breakpoint
UPDATE `managed_events`
SET `seo_json` = json_set(`seo_json`, '$.canonicalUrl', 'https://psipedia.sk/podujatia/specialna-vystava-slovenskeho-novofundlandskeho-klubu-2026-cac'),
    `updated_at` = CURRENT_TIMESTAMP,
    `updated_by` = 'production-health-audit'
WHERE `slug` = 'specialna-vystava-slovenskeho-novofundlandskeho-klubu-2026-cac'
  AND json_valid(`seo_json`)
  AND json_extract(`seo_json`, '$.canonicalUrl') = 'https://psipedia.sk/podujatia/specialna-vystava-slovenskeho-novofundlandskeho-klubu-2026';
