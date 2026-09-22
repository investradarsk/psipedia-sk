-- MAP-1B Gate A — read-only production location inventory.
-- SELECT statements only. Never add mutations to this file.

SELECT
  COUNT(*) AS published_total,
  SUM(CASE WHEN TRIM(COALESCE(address, '')) <> '' THEN 1 ELSE 0 END) AS has_address,
  SUM(CASE WHEN TRIM(COALESCE(address, '')) = '' THEN 1 ELSE 0 END) AS no_address,
  SUM(CASE WHEN TRIM(COALESCE(city, '')) <> '' THEN 1 ELSE 0 END) AS has_city,
  SUM(CASE WHEN TRIM(COALESCE(city, '')) = '' THEN 1 ELSE 0 END) AS no_city,
  SUM(CASE WHEN TRIM(COALESCE(address, '')) <> '' AND TRIM(COALESCE(city, '')) <> '' THEN 1 ELSE 0 END) AS city_and_address,
  SUM(CASE WHEN TRIM(COALESCE(address, '')) = '' AND TRIM(COALESCE(city, '')) <> '' THEN 1 ELSE 0 END) AS city_only,
  SUM(CASE WHEN TRIM(COALESCE(address, '')) <> '' AND TRIM(COALESCE(city, '')) = '' THEN 1 ELSE 0 END) AS address_without_city,
  SUM(CASE
    WHEN UPPER(COALESCE(address, '')) LIKE '%GPS%'
      OR COALESCE(address, '') LIKE '%°%'
      OR LOWER(COALESCE(address, '')) LIKE '%latitude%'
      OR LOWER(COALESCE(address, '')) LIKE '%longitude%'
    THEN 1 ELSE 0 END) AS potential_coordinate_text
FROM directory_profiles
WHERE status = 'published';

SELECT
  category,
  COUNT(*) AS published_total,
  SUM(CASE WHEN TRIM(COALESCE(address, '')) <> '' THEN 1 ELSE 0 END) AS has_address,
  SUM(CASE WHEN TRIM(COALESCE(address, '')) = '' THEN 1 ELSE 0 END) AS no_address,
  SUM(CASE WHEN TRIM(COALESCE(city, '')) <> '' THEN 1 ELSE 0 END) AS has_city,
  SUM(CASE WHEN TRIM(COALESCE(address, '')) = '' AND TRIM(COALESCE(city, '')) <> '' THEN 1 ELSE 0 END) AS city_only,
  SUM(CASE WHEN TRIM(COALESCE(address, '')) <> '' AND TRIM(COALESCE(city, '')) = '' THEN 1 ELSE 0 END) AS address_without_city
FROM directory_profiles
WHERE status = 'published'
GROUP BY category
ORDER BY category;

SELECT
  COUNT(*) AS published_total,
  SUM(CASE WHEN cancelled = 0 AND COALESCE(end_date, start_date) >= DATE('now') THEN 1 ELSE 0 END) AS active_or_upcoming,
  SUM(CASE WHEN TRIM(COALESCE(address, '')) <> '' THEN 1 ELSE 0 END) AS has_address,
  SUM(CASE WHEN TRIM(COALESCE(venue, '')) <> '' THEN 1 ELSE 0 END) AS has_venue,
  SUM(CASE WHEN TRIM(COALESCE(city, '')) <> '' THEN 1 ELSE 0 END) AS has_city,
  SUM(CASE WHEN TRIM(COALESCE(venue, '')) <> '' AND TRIM(COALESCE(address, '')) <> '' AND TRIM(COALESCE(city, '')) <> '' THEN 1 ELSE 0 END) AS venue_address_city,
  SUM(CASE WHEN TRIM(COALESCE(address, '')) = '' AND TRIM(COALESCE(city, '')) <> '' THEN 1 ELSE 0 END) AS city_without_address,
  SUM(CASE
    WHEN LOWER(TRIM(COALESCE(region, ''))) = 'online'
      OR LOWER(TRIM(COALESCE(city, ''))) = 'online'
      OR LOWER(TRIM(COALESCE(venue, ''))) = 'online'
    THEN 1 ELSE 0 END) AS online_events
FROM managed_events
WHERE status = 'published';

SELECT
  LOWER(TRIM(COALESCE(venue, ''))) AS venue_key,
  LOWER(TRIM(COALESCE(address, ''))) AS address_key,
  LOWER(TRIM(COALESCE(city, ''))) AS city_key,
  COUNT(*) AS event_count
FROM managed_events
WHERE status = 'published'
  AND (TRIM(COALESCE(venue, '')) <> '' OR TRIM(COALESCE(address, '')) <> '')
GROUP BY venue_key, address_key, city_key
HAVING COUNT(*) > 1
ORDER BY event_count DESC;

SELECT COUNT(*) AS published_organizations
FROM help_organizations
WHERE status = 'PUBLISHED' AND archived_at IS NULL;

SELECT
  role,
  COUNT(*) AS location_count,
  SUM(CASE WHEN TRIM(COALESCE(address, '')) <> '' THEN 1 ELSE 0 END) AS has_address,
  SUM(CASE WHEN TRIM(COALESCE(address, '')) = '' AND TRIM(COALESCE(city, '')) <> '' THEN 1 ELSE 0 END) AS city_only
FROM organization_locations
GROUP BY role
ORDER BY role;

SELECT COUNT(*) AS organizations_with_multiple_locations
FROM (
  SELECT organization_id
  FROM organization_locations
  GROUP BY organization_id
  HAVING COUNT(*) > 1
);

SELECT COUNT(*) AS organizations_linked_to_directory_profile
FROM help_organizations
WHERE directory_profile_id IS NOT NULL;

SELECT
  COUNT(*) AS active_or_reserved,
  SUM(CASE WHEN TRIM(COALESCE(city, '')) <> '' THEN 1 ELSE 0 END) AS has_city,
  SUM(CASE WHEN TRIM(COALESCE(district, '')) <> '' THEN 1 ELSE 0 END) AS has_district,
  SUM(CASE WHEN TRIM(COALESCE(region, '')) <> '' THEN 1 ELSE 0 END) AS has_region
FROM adoption_dogs
WHERE status IN ('ACTIVE', 'RESERVED');

SELECT
  category,
  COUNT(*) AS active_published,
  SUM(CASE WHEN TRIM(COALESCE(city, '')) <> '' THEN 1 ELSE 0 END) AS has_city,
  SUM(CASE WHEN TRIM(COALESCE(location_note, '')) <> '' THEN 1 ELSE 0 END) AS has_location_note
FROM help_cases
WHERE status = 'published'
  AND resolved = 0
  AND category IN ('docasna-opatera', 'zbierky', 'dobrovolnictvo')
GROUP BY category
ORDER BY category;

-- Lost/found inventory deliberately uses public fields only.
-- Never read lost_found_dog_private_details from this inventory.
SELECT
  type,
  status,
  COUNT(*) AS total,
  SUM(CASE WHEN public_latitude IS NOT NULL AND public_longitude IS NOT NULL THEN 1 ELSE 0 END) AS has_public_coordinates
FROM lost_found_dog_reports
GROUP BY type, status
ORDER BY type, status;
