-- This legacy event-shaped page is stored in managed_articles, not managed_events.
UPDATE `managed_articles`
SET `canonical_url` = 'https://psipedia.sk/podujatia/psi-talent-2026-galanta',
    `updated_at` = CURRENT_TIMESTAMP,
    `updated_by` = 'production-health-audit'
WHERE `slug` = 'psi-talent-2026-galanta'
  AND `canonical_url` = 'https://psipedia.sk/novinky/psi-talent-2026-galanta';
