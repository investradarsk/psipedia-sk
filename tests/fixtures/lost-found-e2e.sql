INSERT INTO lost_found_dog_reports (
  id,type,status,slug,dog_name,sex,breed_id,breed,breed_unknown,color,approximate_age,size,
  description,distinguishing_marks,collar_description,chipped,main_image,main_image_key,gallery_json,
  event_date,last_seen_date_time,region,district,city,location_description,public_latitude,public_longitude,
  public_location_precision,public_contact_note,source,source_url,search_text,duplicate_of_id,duplicate_reason,
  created_at,updated_at,published_at,expires_at,resolved_at,archived_at
) VALUES (
  910001,'LOST','ACTIVE','strateny-e2e-rex-nitra','Rex','MALE',NULL,'Labrador retriever',0,'čierna','4 roky','LARGE',
  'Testovacie lokálne hlásenie pre overenie verejného detailu strateného psa.','Malá biela škvrna na hrudi.','Červený obojok.','YES',NULL,NULL,'[]',
  '2026-09-12','2026-09-12T16:30:00.000Z','Nitriansky kraj','Nitra','Nitra','okolie mestského parku',48.3064,18.0864,
  'APPROXIMATE','Kontakt sprostredkuje Psipedia.','E2E_LOCAL',NULL,'lost rex labrador cierna nitra mestsky park',NULL,'',
  '2026-09-12T16:35:00.000Z','2026-09-12T16:35:00.000Z','2026-09-12T16:35:00.000Z','2099-12-31T23:59:59.000Z',NULL,NULL
);

INSERT INTO lost_found_dog_private_details (
  report_id,contact_name,contact_phone,contact_email,private_location_description,private_latitude,private_longitude,
  verification_note,private_note,created_by,updated_by,created_at,updated_at
) VALUES (
  910001,'E2E súkromný kontakt','+421900000001','lost-e2e@example.invalid','Presná testovacia lokalita iba pre admina',48.306401,18.086401,
  'Lokálny test verifikácie.','Neverejná E2E poznámka.','e2e-admin@example.invalid','e2e-admin@example.invalid','2026-09-12T16:35:00.000Z','2026-09-12T16:35:00.000Z'
);

INSERT INTO lost_found_dog_reports (
  id,type,status,slug,dog_name,sex,breed_id,breed,breed_unknown,color,approximate_age,size,
  description,distinguishing_marks,collar_description,chipped,main_image,main_image_key,gallery_json,
  event_date,last_seen_date_time,region,district,city,location_description,public_latitude,public_longitude,
  public_location_precision,public_contact_note,source,source_url,search_text,duplicate_of_id,duplicate_reason,
  created_at,updated_at,published_at,expires_at,resolved_at,archived_at
) VALUES (
  910002,'FOUND','ACTIVE','najdeny-e2e-pes-nitra',NULL,'FEMALE',NULL,'',1,'hnedá','mladý pes','MEDIUM',
  'Testovacie lokálne hlásenie pre overenie verejného detailu nájdeného psa.','Svetlejšie labky.','Modrý postroj.','UNKNOWN',NULL,NULL,'[]',
  '2026-09-12',NULL,'Nitriansky kraj','Nitra','Nitra','približne pri železničnej stanici',48.3090,18.0810,
  'APPROXIMATE','Kontakt sprostredkuje Psipedia.','E2E_LOCAL',NULL,'found hneda suka nitra zeleznicna stanica',NULL,'',
  '2026-09-12T17:00:00.000Z','2026-09-12T17:00:00.000Z','2026-09-12T17:00:00.000Z','2099-12-31T23:59:59.000Z',NULL,NULL
);

INSERT INTO lost_found_dog_private_details (
  report_id,contact_name,contact_phone,contact_email,private_location_description,private_latitude,private_longitude,
  verification_note,private_note,created_by,updated_by,created_at,updated_at
) VALUES (
  910002,'E2E súkromný nálezca','+421900000002','found-e2e@example.invalid','Presná testovacia lokalita iba pre admina',48.309001,18.081001,
  'Lokálny test verifikácie.','Neverejná E2E poznámka.','e2e-admin@example.invalid','e2e-admin@example.invalid','2026-09-12T17:00:00.000Z','2026-09-12T17:00:00.000Z'
);
