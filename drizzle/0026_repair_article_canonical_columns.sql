-- Idempotent follow-up for builds that fetched 0025 before its schema correction.
UPDATE `managed_articles` SET `canonical_url` = 'https://psipedia.sk/novinky/prosba-aby-dal-psa-na-vodzku-mala-skoncit-bitkou-incident-v', `updated_at` = CURRENT_TIMESTAMP, `updated_by` = 'production-health-audit' WHERE `slug` = 'prosba-aby-dal-psa-na-vodzku-mala-skoncit-bitkou-incident-v' AND `canonical_url` = 'https://psipedia.sk/novinky/spor-pes-vodzka-mala-fatra-pravidla';
--> statement-breakpoint
UPDATE `managed_articles` SET `canonical_url` = 'https://psipedia.sk/aktivity/zakladny-vycvik-psat', `updated_at` = CURRENT_TIMESTAMP, `updated_by` = 'production-health-audit' WHERE `slug` = 'zakladny-vycvik-psat' AND `canonical_url` = 'https://psipedia.sk/aktivity/zakladny-vycvik-psa';
--> statement-breakpoint
UPDATE `managed_articles` SET `canonical_url` = 'https://psipedia.sk/novinky/banska-bystrica-riesi-nove-pravidla-pre-psov-majitelia-sa-py', `updated_at` = CURRENT_TIMESTAMP, `updated_by` = 'production-health-audit' WHERE `slug` = 'banska-bystrica-riesi-nove-pravidla-pre-psov-majitelia-sa-py' AND `canonical_url` = 'https://psipedia.sk/novinky/banska-bystrica-nove-pravidla-psy-vencoviska';
