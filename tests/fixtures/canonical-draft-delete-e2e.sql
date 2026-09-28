DELETE FROM managed_events WHERE id IN (990001,990002,990011,990012);

INSERT INTO managed_events (
  id,slug,title,excerpt,event_type,status,start_date,start_time,end_date,end_time,
  venue,city,region,address,organizer,description,practical_info,website_url,
  registration_url,image_url,image_key,cancelled,seo_json,created_at,updated_at,
  published_at,created_by,updated_by
) VALUES
(990001,'e2e-draft-delete-desktop','E2E DRAFT delete desktop','E2E draft','Iné','draft','2026-12-01','10:00',NULL,NULL,'E2E','Nitra','Nitriansky kraj','','Psipedia E2E','E2E draft delete test','',NULL,NULL,NULL,NULL,0,'{}','2026-09-28T20:00:00.000Z','2026-09-28T20:00:00.000Z',NULL,'e2e','e2e'),
(990002,'e2e-published-delete-desktop','E2E PUBLISHED desktop','E2E published','Iné','published','2026-12-02','10:00',NULL,NULL,'E2E','Nitra','Nitriansky kraj','','Psipedia E2E','E2E published guard test','',NULL,NULL,NULL,NULL,0,'{}','2026-09-28T20:00:00.000Z','2026-09-28T20:00:00.000Z','2026-09-28T20:00:00.000Z','e2e','e2e'),
(990011,'e2e-draft-delete-mobile','E2E DRAFT delete mobile','E2E draft','Iné','draft','2026-12-03','10:00',NULL,NULL,'E2E','Nitra','Nitriansky kraj','','Psipedia E2E','E2E mobile draft delete test','',NULL,NULL,NULL,NULL,0,'{}','2026-09-28T20:00:00.000Z','2026-09-28T20:00:00.000Z',NULL,'e2e','e2e'),
(990012,'e2e-published-delete-mobile','E2E PUBLISHED mobile','E2E published','Iné','published','2026-12-04','10:00',NULL,NULL,'E2E','Nitra','Nitriansky kraj','','Psipedia E2E','E2E mobile published guard test','',NULL,NULL,NULL,NULL,0,'{}','2026-09-28T20:00:00.000Z','2026-09-28T20:00:00.000Z','2026-09-28T20:00:00.000Z','e2e','e2e');
