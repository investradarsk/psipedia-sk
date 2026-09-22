-- MAP-1C isolated local D1 fixture. Synthetic data only.

INSERT INTO directory_profiles (
  id, slug, name, category, status, excerpt, description, services_json, qualifications_json,
  city, district, region, address, online, search_text, verified, featured,
  created_at, updated_at, published_at, archived_at, created_by, updated_by
) VALUES
(991001,'map-e2e-vet-a','MAP E2E Veterina A','veterinari','published','Presná veterinárna lokalita.','Syntetický MAP-1C profil.','["Pohotovosť"]','[]','Nitra','Nitra','Nitriansky kraj','Verejná 1',0,'map e2e veterina a pohotovost nitra',1,0,'2026-09-22T10:00:00Z','2026-09-22T10:00:00Z','2026-09-22T10:00:00Z',NULL,'map-e2e','map-e2e'),
(991002,'map-e2e-vet-b','MAP E2E Veterina B','veterinari','published','Druhá služba na rovnakej polohe.','Syntetický MAP-1C profil.','["Prevencia"]','[]','Nitra','Nitra','Nitriansky kraj','Verejná 1',0,'map e2e veterina b prevencia nitra',0,0,'2026-09-22T10:00:00Z','2026-09-22T10:00:00Z','2026-09-22T10:00:00Z',NULL,'map-e2e','map-e2e'),
(991003,'map-e2e-breeder','MAP E2E Chovateľská stanica','chovatelske-stanice','published','Approximate-only citlivý profil.','Syntetický MAP-1C profil.','[]','[]','Trnava','Trnava','Trnavský kraj','Súkromná 77',0,'map e2e chovatelska stanica trnava',0,0,'2026-09-22T10:00:00Z','2026-09-22T10:00:00Z','2026-09-22T10:00:00Z',NULL,'map-e2e','map-e2e'),
(991004,'map-e2e-hidden','MAP E2E Hidden venčenie','vencenie','published','Skrytý citlivý profil.','Syntetický MAP-1C profil.','[]','[]','Nitra','Nitra','Nitriansky kraj','Tajná 99',0,'map e2e hidden vencenie',0,0,'2026-09-22T10:00:00Z','2026-09-22T10:00:00Z','2026-09-22T10:00:00Z',NULL,'map-e2e','map-e2e'),
(991005,'map-e2e-needs-review','MAP E2E Needs Review','treneri','published','Neoverená poloha.','Syntetický MAP-1C profil.','[]','[]','Nitra','Nitra','Nitriansky kraj','Neoverená 1',0,'map e2e needs review',0,0,'2026-09-22T10:00:00Z','2026-09-22T10:00:00Z','2026-09-22T10:00:00Z',NULL,'map-e2e','map-e2e'),
(991006,'map-e2e-stale','MAP E2E Stale','fyzioterapia','published','Stale poloha.','Syntetický MAP-1C profil.','[]','[]','Nitra','Nitra','Nitriansky kraj','Stará 1',0,'map e2e stale',0,0,'2026-09-22T10:00:00Z','2026-09-22T10:00:00Z','2026-09-22T10:00:00Z',NULL,'map-e2e','map-e2e'),
(991010,'map-e2e-linked-directory','MAP E2E Linked Directory','dalsie-sluzby','published','Linked directory reprezentácia.','Syntetický MAP-1C profil.','[]','[]','Nitra','Nitra','Nitriansky kraj','Link 1',0,'map e2e linked directory',0,0,'2026-09-22T10:00:00Z','2026-09-22T10:00:00Z','2026-09-22T10:00:00Z',NULL,'map-e2e','map-e2e');

INSERT INTO help_organizations (
  id, name, slug, type, status, short_description, description,
  city, district, region, country_code, directory_profile_id,
  published_at, archived_at, created_at, updated_at, created_by, updated_by
) VALUES
(991100,'MAP E2E Linked Organization','map-e2e-linked-organization','CIVIC_ASSOCIATION','PUBLISHED','Linked organization.','Syntetický MAP-1C profil.','Nitra','Nitra','Nitriansky kraj','SK',991010,'2026-09-22T10:00:00Z',NULL,'2026-09-22T10:00:00Z','2026-09-22T10:00:00Z','map-e2e','map-e2e'),
(991101,'MAP E2E Multi Site Org','map-e2e-multi-site-org','RESCUE_ORGANIZATION','PUBLISHED','Organizácia s viacerými lokalitami.','Syntetický MAP-1C profil.','Nitra','Nitra','Nitriansky kraj','SK',NULL,'2026-09-22T10:00:00Z',NULL,'2026-09-22T10:00:00Z','2026-09-22T10:00:00Z','map-e2e','map-e2e');

INSERT INTO organization_locations (
  id, organization_id, role, label, address, city, district, region, country_code, is_primary, sort_order
) VALUES
(991110,991100,'SITE','Linked site','Link 1','Nitra','Nitra','Nitriansky kraj','SK',1,0),
(991111,991101,'SITE','Prevádzka','Verejná org 1','Nitra','Nitra','Nitriansky kraj','SK',1,0),
(991112,991101,'SERVICE_AREA','Pôsobnosť','Neverejná service-area 8','Šaľa','Šaľa','Nitriansky kraj','SK',0,10),
(991113,991101,'LEGAL_SEAT','Právne sídlo','Súkromné sídlo 55','Nitra','Nitra','Nitriansky kraj','SK',0,20);

INSERT INTO managed_events (
  id, slug, title, excerpt, event_type, status, start_date, start_time, end_date, end_time,
  venue, city, region, address, organizer, description, practical_info, cancelled,
  created_at, updated_at, published_at, created_by, updated_by
) VALUES
(991200,'map-e2e-upcoming-event','MAP E2E Budúca výstava','Budúce mapové podujatie.','Výstava','published','2030-10-01','09:00','2030-10-01','16:00','Výstavisko','Nitra','Nitriansky kraj','Výstavná 1','MAP E2E','Syntetické budúce podujatie.','',0,'2026-09-22T10:00:00Z','2026-09-22T10:00:00Z','2026-09-22T10:00:00Z','map-e2e','map-e2e'),
(991201,'map-e2e-past-event','MAP E2E Minulé podujatie','Historický event.','Výstava','published','2020-01-01','09:00','2020-01-01','16:00','Staré miesto','Nitra','Nitriansky kraj','Stará event 1','MAP E2E','Syntetické minulé podujatie.','',0,'2026-09-22T10:00:00Z','2026-09-22T10:00:00Z','2026-09-22T10:00:00Z','map-e2e','map-e2e'),
(991202,'map-e2e-cancelled-event','MAP E2E Zrušené podujatie','Zrušený event.','Preteky','published','2030-11-01','09:00','2030-11-01','16:00','Výstavisko','Nitra','Nitriansky kraj','Výstavná 2','MAP E2E','Syntetické zrušené podujatie.','',1,'2026-09-22T10:00:00Z','2026-09-22T10:00:00Z','2026-09-22T10:00:00Z','map-e2e','map-e2e');

INSERT INTO geo_points (
  target_type, directory_profile_id, organization_location_id, managed_event_id,
  public_visibility, public_precision, latitude, longitude, resolution_method,
  provider, source_fingerprint, resolved_source_fingerprint, geocode_status,
  last_error_code, created_at, updated_at
) VALUES
('DIRECTORY_PROFILE',991001,NULL,NULL,'EXACT_PUBLIC','EXACT',48.3060,18.0860,'MANUAL','geoapify','fp-vet-a','fp-vet-a','RESOLVED',NULL,'2026-09-22T10:00:00Z','2026-09-22T10:00:00Z'),
('DIRECTORY_PROFILE',991002,NULL,NULL,'EXACT_PUBLIC','EXACT',48.3060,18.0860,'MANUAL',NULL,'fp-vet-b','fp-vet-b','RESOLVED',NULL,'2026-09-22T10:00:00Z','2026-09-22T10:00:00Z'),
('DIRECTORY_PROFILE',991003,NULL,NULL,'APPROXIMATE_PUBLIC','MUNICIPALITY',48.3774,17.5883,'LOCALITY',NULL,'fp-breeder','fp-breeder','RESOLVED',NULL,'2026-09-22T10:00:00Z','2026-09-22T10:00:00Z'),
('DIRECTORY_PROFILE',991004,NULL,NULL,'HIDDEN','APPROXIMATE',NULL,NULL,NULL,NULL,'fp-hidden',NULL,'SKIPPED','PRIVATE_HIDDEN','2026-09-22T10:00:00Z','2026-09-22T10:00:00Z'),
('DIRECTORY_PROFILE',991005,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'fp-review',NULL,'NEEDS_REVIEW','PRIVACY_CLASSIFICATION_MISSING','2026-09-22T10:00:00Z','2026-09-22T10:00:00Z'),
('DIRECTORY_PROFILE',991006,NULL,NULL,'EXACT_PUBLIC','EXACT',48.3100,18.0900,'GEOCODER',NULL,'fp-stale-new','fp-stale-old','STALE','MANUAL_REVIEW','2026-09-22T10:00:00Z','2026-09-22T10:00:00Z'),
('DIRECTORY_PROFILE',991010,NULL,NULL,'EXACT_PUBLIC','EXACT',48.3200,18.1100,'MANUAL',NULL,'fp-linked-d','fp-linked-d','RESOLVED',NULL,'2026-09-22T10:00:00Z','2026-09-22T10:00:00Z'),
('ORGANIZATION_LOCATION',NULL,991110,NULL,'EXACT_PUBLIC','EXACT',48.3200,18.1100,'MANUAL',NULL,'fp-linked-o','fp-linked-o','RESOLVED',NULL,'2026-09-22T10:00:00Z','2026-09-22T10:00:00Z'),
('ORGANIZATION_LOCATION',NULL,991111,NULL,'EXACT_PUBLIC','EXACT',48.3300,18.1200,'MANUAL',NULL,'fp-org-site','fp-org-site','RESOLVED',NULL,'2026-09-22T10:00:00Z','2026-09-22T10:00:00Z'),
('ORGANIZATION_LOCATION',NULL,991112,NULL,'APPROXIMATE_PUBLIC','SERVICE_AREA',48.1510,17.8800,'LOCALITY',NULL,'fp-org-area','fp-org-area','RESOLVED',NULL,'2026-09-22T10:00:00Z','2026-09-22T10:00:00Z'),
('ORGANIZATION_LOCATION',NULL,991113,NULL,'HIDDEN','APPROXIMATE',NULL,NULL,NULL,NULL,'fp-legal-hidden',NULL,'SKIPPED','PRIVATE_HIDDEN','2026-09-22T10:00:00Z','2026-09-22T10:00:00Z'),
('MANAGED_EVENT',NULL,NULL,991200,'EXACT_PUBLIC','EXACT',48.3000,18.1000,'MANUAL',NULL,'fp-event-future','fp-event-future','RESOLVED',NULL,'2026-09-22T10:00:00Z','2026-09-22T10:00:00Z'),
('MANAGED_EVENT',NULL,NULL,991201,'EXACT_PUBLIC','EXACT',48.3010,18.1010,'MANUAL',NULL,'fp-event-past','fp-event-past','RESOLVED',NULL,'2026-09-22T10:00:00Z','2026-09-22T10:00:00Z'),
('MANAGED_EVENT',NULL,NULL,991202,'EXACT_PUBLIC','EXACT',48.3020,18.1020,'MANUAL',NULL,'fp-event-cancel','fp-event-cancel','RESOLVED',NULL,'2026-09-22T10:00:00Z','2026-09-22T10:00:00Z');
