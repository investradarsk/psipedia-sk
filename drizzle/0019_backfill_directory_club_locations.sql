DROP TABLE IF EXISTS `__psipedia_club_location_guard_0019`;--> statement-breakpoint
CREATE TABLE `__psipedia_club_location_guard_0019` (
	`valid` integer NOT NULL CHECK (`valid` = 1)
);--> statement-breakpoint
INSERT INTO `__psipedia_club_location_guard_0019` (`valid`)
SELECT CASE WHEN
	(SELECT COUNT(*) FROM `directory_profiles` WHERE `category` = 'kynologicke-kluby') = 248
	AND (SELECT COUNT(*) FROM `directory_profiles` WHERE `category` = 'kynologicke-kluby' AND `status` = 'published') = 248
	AND (SELECT COUNT(*) FROM `directory_profiles` WHERE `category` = 'kynologicke-kluby' AND trim(`name`) = '') = 0
	AND (SELECT COUNT(*) FROM `directory_profiles` WHERE `category` = 'kynologicke-kluby' AND trim(`city`) = '') = 0
	AND (SELECT COUNT(*) FROM `directory_profiles` WHERE `category` = 'kynologicke-kluby' AND trim(`region`) = '') = 0
	AND (SELECT COUNT(*) FROM `directory_profiles` WHERE `category` = 'kynologicke-kluby' AND trim(`slug`) = '') = 0
	AND (SELECT COUNT(DISTINCT `slug`) FROM `directory_profiles` WHERE `category` = 'kynologicke-kluby') = 248
	AND (
		SELECT COUNT(*) FROM `directory_profiles`
		WHERE `category` = 'kynologicke-kluby'
		AND CASE
			WHEN json_valid(`source_data_json`)
				THEN trim(COALESCE(CAST(json_extract(`source_data_json`, '$.Okres') AS text), ''))
			ELSE ''
		END = ''
	) = 0
	AND (
		SELECT COUNT(*) FROM `directory_profiles`
		WHERE `category` = 'kynologicke-kluby'
		AND trim(`district`) <> ''
		AND trim(`district`) <> trim(CAST(json_extract(`source_data_json`, '$.Okres') AS text))
	) = 0
	AND (
		SELECT COUNT(*) FROM `directory_profiles`
		WHERE `category` = 'kynologicke-kluby'
		AND trim(`region`) NOT IN (
			'Bratislavský', 'Bratislavský kraj',
			'Trnavský', 'Trnavský kraj',
			'Trenčiansky', 'Trenčiansky kraj',
			'Nitriansky', 'Nitriansky kraj',
			'Žilinský', 'Žilinský kraj',
			'Banskobystrický', 'Banskobystrický kraj',
			'Prešovský', 'Prešovský kraj',
			'Košický', 'Košický kraj'
		)
	) = 0
	AND (SELECT COUNT(*) FROM `directory_profiles` WHERE `category` = 'kynologicke-kluby' AND trim(`region`) = 'Online') = 0
THEN 1 ELSE 0 END;--> statement-breakpoint
UPDATE `directory_profiles`
SET `district` = trim(CAST(json_extract(`source_data_json`, '$.Okres') AS text))
WHERE `category` = 'kynologicke-kluby' AND trim(`district`) = '';--> statement-breakpoint
UPDATE `directory_profiles`
SET `region` = CASE trim(`region`)
	WHEN 'Bratislavský' THEN 'Bratislavský kraj'
	WHEN 'Bratislavský kraj' THEN 'Bratislavský kraj'
	WHEN 'Trnavský' THEN 'Trnavský kraj'
	WHEN 'Trnavský kraj' THEN 'Trnavský kraj'
	WHEN 'Trenčiansky' THEN 'Trenčiansky kraj'
	WHEN 'Trenčiansky kraj' THEN 'Trenčiansky kraj'
	WHEN 'Nitriansky' THEN 'Nitriansky kraj'
	WHEN 'Nitriansky kraj' THEN 'Nitriansky kraj'
	WHEN 'Žilinský' THEN 'Žilinský kraj'
	WHEN 'Žilinský kraj' THEN 'Žilinský kraj'
	WHEN 'Banskobystrický' THEN 'Banskobystrický kraj'
	WHEN 'Banskobystrický kraj' THEN 'Banskobystrický kraj'
	WHEN 'Prešovský' THEN 'Prešovský kraj'
	WHEN 'Prešovský kraj' THEN 'Prešovský kraj'
	WHEN 'Košický' THEN 'Košický kraj'
	WHEN 'Košický kraj' THEN 'Košický kraj'
	ELSE `region`
END
WHERE `category` = 'kynologicke-kluby';--> statement-breakpoint
DELETE FROM `__psipedia_club_location_guard_0019`;--> statement-breakpoint
INSERT INTO `__psipedia_club_location_guard_0019` (`valid`)
SELECT CASE WHEN
	(SELECT COUNT(*) FROM `directory_profiles` WHERE `category` = 'kynologicke-kluby') = 248
	AND (SELECT COUNT(*) FROM `directory_profiles` WHERE `category` = 'kynologicke-kluby' AND `status` = 'published') = 248
	AND (SELECT COUNT(*) FROM `directory_profiles` WHERE `category` = 'kynologicke-kluby' AND trim(`name`) = '') = 0
	AND (SELECT COUNT(*) FROM `directory_profiles` WHERE `category` = 'kynologicke-kluby' AND trim(`city`) = '') = 0
	AND (SELECT COUNT(*) FROM `directory_profiles` WHERE `category` = 'kynologicke-kluby' AND trim(`district`) = '') = 0
	AND (SELECT COUNT(*) FROM `directory_profiles` WHERE `category` = 'kynologicke-kluby' AND trim(`region`) = '') = 0
	AND (SELECT COUNT(*) FROM `directory_profiles` WHERE `category` = 'kynologicke-kluby' AND trim(`slug`) = '') = 0
	AND (SELECT COUNT(DISTINCT `slug`) FROM `directory_profiles` WHERE `category` = 'kynologicke-kluby') = 248
	AND (SELECT COUNT(DISTINCT `region`) FROM `directory_profiles` WHERE `category` = 'kynologicke-kluby') = 8
	AND (
		SELECT COUNT(*) FROM `directory_profiles`
		WHERE `category` = 'kynologicke-kluby'
		AND `region` NOT IN (
			'Bratislavský kraj', 'Trnavský kraj', 'Trenčiansky kraj', 'Nitriansky kraj',
			'Žilinský kraj', 'Banskobystrický kraj', 'Prešovský kraj', 'Košický kraj'
		)
	) = 0
	AND (
		SELECT COUNT(*) FROM `directory_profiles`
		WHERE `category` = 'kynologicke-kluby'
		AND trim(`district`) <> trim(CAST(json_extract(`source_data_json`, '$.Okres') AS text))
	) = 0
	AND (SELECT COUNT(*) FROM `directory_profiles` WHERE `category` = 'kynologicke-kluby' AND `region` = 'Online') = 0
THEN 1 ELSE 0 END;--> statement-breakpoint
DROP TABLE `__psipedia_club_location_guard_0019`;
