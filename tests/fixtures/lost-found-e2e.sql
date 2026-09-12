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
  report_id,contact_name_encrypted,contact_phone_encrypted,contact_phone_hash,contact_email_encrypted,contact_email_hash,
  private_location_description_encrypted,private_latitude_encrypted,private_longitude_encrypted,
  verification_note_encrypted,private_note_encrypted,created_by,updated_by,created_at,updated_at
) VALUES (
  910001,
  'v1.AAAAAAAAAAAAAAAB.i-cn3hLs7FDjtBAflqDd8A5E4auwSSlsdyRomcDSog',
  'v1.AAAAAAAAAAAAAAAC.DrTYvaEOn_23NHmR1Bry7oa0PMVgc1BzbhoMKdo',
  'o_663FKT1JCW83HDzX0kxGUDNjup76mJin2Us0JKuhg',
  'v1.AAAAAAAAAAAAAAAD.Mrvud8iexR7XwssPdMwH359iSHAgPAL6O7pAzU6eTInwDpeRWG0qBw',
  '3Viosr8SEheZMLfFhS-tvZyTfSDDb3ivHnHKxDY9m-g',
  'v1.AAAAAAAAAAAAAAAE.i5feTBhMHeqe6eRfVCoV61PA-cvQ3jCQo8vMzTK8CwbNcyr1WHQSPNjwumGUBx0fI10m9zcUqxFleg',
  'v1.AAAAAAAAAAAAAAAF.hB81XrUMxQYqxwqddnF4yKR0RryYC2hqMQ',
  'v1.AAAAAAAAAAAAAAAG.TF8lb1Nzbmt7FTzvNm765ygw2HiADd0ifQ',
  'v1.AAAAAAAAAAAAAAAH.S8nbg-fwv79JNUNevgx3lYZ1_5DK7LNHNNMmgTFrQR4',
  'v1.AAAAAAAAAAAAAAAI.-K5j9hpviwZyqtxTXV709wNyTmOOT-EUSzyRwBOczEdCNMSJu4npnWg',
  'e2e-admin@example.invalid','e2e-admin@example.invalid','2026-09-12T16:35:00.000Z','2026-09-12T16:35:00.000Z'
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
  report_id,contact_name_encrypted,contact_phone_encrypted,contact_phone_hash,contact_email_encrypted,contact_email_hash,
  private_location_description_encrypted,private_latitude_encrypted,private_longitude_encrypted,
  verification_note_encrypted,private_note_encrypted,created_by,updated_by,created_at,updated_at
) VALUES (
  910002,
  'v1.AAAAAAAAAAAAAAAJ.44kIyEyY_WDI9c1pVZ_qAy09PIBZeg0Mq81c_f_Qw6I',
  'v1.AAAAAAAAAAAAAAAK.tQMOoZuaxApqd-vxcbGWUGPGo0VOZ0vuTFR8Wnk',
  'IfenAAEZ3bKCJ1dwjTKe_e7WT_nrK6Hwk0oBu8KXxS4',
  'v1.AAAAAAAAAAAAAAAL.P69Kros9SsDPKbOz1o8jelMLNz0RgZZPYorvOY-XuJCyg0NjQxiyX-M',
  'BExCTObBN0VsgwReYQdJ4HtPl7qcMJ_-FY3nY8qH6J8',
  'v1.AAAAAAAAAAAAAAAM.mucOZoHVngqeDBD7_VK14ITFMxIE0MRcuEr-O3pqbbQsagy0uhVsIEHQ-tTq1FHsWkyXhONQQF3ZNg',
  'v1.AAAAAAAAAAAAAAAN.95aTn25jyRltGfKLtE6VT0I2I8ICnMfCRA',
  'v1.AAAAAAAAAAAAAAAO.gXNh6dzEWuHOadRe6SprZQ2i2BJanfILug',
  'v1.AAAAAAAAAAAAAAAP.o8ciFNwlsRWbxqsBN3tPQE4sFMSC1k-jK4pEJKMobBQ',
  'v1.AAAAAAAAAAAAAAAQ.-YiCBXLkbVcLiZ5PUxzI87OzlF8gXL5SZM_d01DzB6mtivVyNh1eGug',
  'e2e-admin@example.invalid','e2e-admin@example.invalid','2026-09-12T17:00:00.000Z','2026-09-12T17:00:00.000Z'
);
