-- PUBLIC-INTEGRITY-1
-- Correct legacy article taxonomy that predated today's portal sections and
-- replace malformed/truncated public slugs without touching article content.

UPDATE managed_articles
SET category = 'Život so psom'
WHERE category = 'Výcvik'
  AND portal_section = 'steniatka'
  AND portal_subpage IN ('pred-kupou-psa', 'vyber-plemena', 'vyber-chovatela');

UPDATE managed_articles
SET category = 'Život so psom'
WHERE slug = 'psi-talent-2026-galanta'
  AND category = 'Výcvik';

UPDATE managed_articles
SET slug = 'co-pes-nesmie-jest-25-potravin-ktore-mu-mozu-vazne-ublizit',
    canonical_url = CASE
      WHEN canonical_url LIKE '%co-pes-nco-pes-nesmie-jestesmie-jest-25-potravin-ktore-mu-mozu-vazne-ublizit%'
      THEN REPLACE(canonical_url,
        'co-pes-nco-pes-nesmie-jestesmie-jest-25-potravin-ktore-mu-mozu-vazne-ublizit',
        'co-pes-nesmie-jest-25-potravin-ktore-mu-mozu-vazne-ublizit')
      ELSE canonical_url
    END
WHERE slug = 'co-pes-nco-pes-nesmie-jestesmie-jest-25-potravin-ktore-mu-mozu-vazne-ublizit'
  AND NOT EXISTS (
    SELECT 1 FROM managed_articles
    WHERE slug = 'co-pes-nesmie-jest-25-potravin-ktore-mu-mozu-vazne-ublizit'
  );

UPDATE managed_articles
SET slug = 'zakladny-vycvik-psa',
    canonical_url = CASE
      WHEN canonical_url LIKE '%zakladny-vycvik-psat%'
      THEN REPLACE(canonical_url, 'zakladny-vycvik-psat', 'zakladny-vycvik-psa')
      ELSE canonical_url
    END
WHERE slug = 'zakladny-vycvik-psat'
  AND NOT EXISTS (SELECT 1 FROM managed_articles WHERE slug = 'zakladny-vycvik-psa');

UPDATE managed_articles
SET slug = 'ako-vybrat-dobreho-chovatela',
    canonical_url = CASE
      WHEN canonical_url LIKE '%ako-vybrat-dobreho-chovatela-zdravie-podmienky-chovu-a-otazk%'
      THEN REPLACE(canonical_url,
        'ako-vybrat-dobreho-chovatela-zdravie-podmienky-chovu-a-otazk',
        'ako-vybrat-dobreho-chovatela')
      ELSE canonical_url
    END
WHERE slug = 'ako-vybrat-dobreho-chovatela-zdravie-podmienky-chovu-a-otazk'
  AND NOT EXISTS (SELECT 1 FROM managed_articles WHERE slug = 'ako-vybrat-dobreho-chovatela');

UPDATE managed_articles
SET slug = 'viac-chronickych-ochoreni-moze-skratit-zivot-psa',
    canonical_url = CASE
      WHEN canonical_url LIKE '%viac-chronickych-ochoreni-moze-vyrazne-skratit-zivot-psa-uka%'
      THEN REPLACE(canonical_url,
        'viac-chronickych-ochoreni-moze-vyrazne-skratit-zivot-psa-uka',
        'viac-chronickych-ochoreni-moze-skratit-zivot-psa')
      ELSE canonical_url
    END
WHERE slug = 'viac-chronickych-ochoreni-moze-vyrazne-skratit-zivot-psa-uka'
  AND NOT EXISTS (
    SELECT 1 FROM managed_articles
    WHERE slug = 'viac-chronickych-ochoreni-moze-skratit-zivot-psa'
  );

UPDATE managed_articles
SET slug = 'banska-bystrica-pravidla-pre-psov-bez-vodzky',
    canonical_url = CASE
      WHEN canonical_url LIKE '%banska-bystrica-riesi-nove-pravidla-pre-psov-majitelia-sa-py%'
      THEN REPLACE(canonical_url,
        'banska-bystrica-riesi-nove-pravidla-pre-psov-majitelia-sa-py',
        'banska-bystrica-pravidla-pre-psov-bez-vodzky')
      ELSE canonical_url
    END
WHERE slug = 'banska-bystrica-riesi-nove-pravidla-pre-psov-majitelia-sa-py'
  AND NOT EXISTS (
    SELECT 1 FROM managed_articles
    WHERE slug = 'banska-bystrica-pravidla-pre-psov-bez-vodzky'
  );
