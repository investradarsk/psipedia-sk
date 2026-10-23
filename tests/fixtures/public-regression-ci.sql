-- Local public regression CI only. Never apply to remote D1.
-- Keep >1,000 real published profiles so sitemap size and pagination stay tested.
WITH RECURSIVE profiles(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM profiles WHERE n<1100)
INSERT OR REPLACE INTO directory_profiles
(slug,name,category,status,excerpt,description,city,region,created_at,updated_at,published_at,created_by,updated_by)
SELECT 'public-regression-'||n, 'Testovací profil '||n, CASE (n % 10) WHEN 0 THEN 'veterinari' WHEN 1 THEN 'treneri' WHEN 2 THEN 'kynologicke-kluby' WHEN 3 THEN 'chovatelske-kluby' WHEN 4 THEN 'chovatelske-stanice' WHEN 5 THEN 'salony-a-sluzby' WHEN 6 THEN 'hotely-a-opatrovanie' WHEN 7 THEN 'vencenie' WHEN 8 THEN 'fyzioterapia' WHEN 9 THEN 'dalsie-sluzby' END, 'published',
'Lokálny testovací profil', 'Lokálny testovací profil pre verejné regresné testy.',
'Bratislava', 'Bratislavský kraj', datetime('now'),datetime('now'),datetime('now'),'local-ci','local-ci'
FROM profiles;
INSERT OR REPLACE INTO managed_events
(slug,title,excerpt,event_type,status,start_date,end_date,city,region,organizer,description,cancelled,created_at,updated_at,published_at,created_by,updated_by)
VALUES ('public-regression-exhibition','Testovacia výstava psov','Lokálna výstava','Výstava','published',date('now','+30 days'),date('now','+31 days'),'Nitra','Nitriansky kraj','Testovací klub','Lokálna výstava pre regresné testy.',0,datetime('now'),datetime('now'),datetime('now'),'local-ci','local-ci'),
('public-regression-past','Minulá výstava psov','Lokálna výstava','Výstava','published',date('now','-30 days'),date('now','-29 days'),'Nitra','Nitriansky kraj','Testovací klub','Lokálna výstava pre regresné testy.',0,datetime('now'),datetime('now'),datetime('now'),'local-ci','local-ci');
