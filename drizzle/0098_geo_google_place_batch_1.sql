-- GEO-GOOGLE-PLACE-BATCH-1 — bounded curated identity enrichment for 19 of the first 20 coordinate-only exact DIRECTORY_PROFILE rows.
-- Research date: 2026-09-29.
-- Canonical directory addresses and Geoapify coordinates remain authoritative and are NOT changed here.
-- Every update is fail-closed on the exact production source fingerprint captured by the read-only audit.
-- A concurrent fresh Google Place match wins: rows that already have a current Place ID are not overwritten.

UPDATE geo_points
SET google_place_id = 'ChIJodc3P3k9FUcRqScWiGz8_ow',
    google_place_source_fingerprint = source_fingerprint,
    google_place_matched_at = CURRENT_TIMESTAMP
WHERE target_type = 'DIRECTORY_PROFILE'
  AND directory_profile_id = 254
  AND geocode_status = 'RESOLVED'
  AND public_visibility = 'EXACT_PUBLIC'
  AND public_precision = 'EXACT'
  AND source_fingerprint = '331dddf45224c56d0a62fafd7ef84b24e948d8aad774d819bd98d782bee0a76c'
  AND resolved_source_fingerprint = source_fingerprint
  AND (google_place_id IS NULL
    OR google_place_source_fingerprint IS NULL
    OR google_place_source_fingerprint <> source_fingerprint);

UPDATE geo_points
SET google_place_id = 'ChIJXQO1eHQWFUcRljNbLhyWFTg',
    google_place_source_fingerprint = source_fingerprint,
    google_place_matched_at = CURRENT_TIMESTAMP
WHERE target_type = 'DIRECTORY_PROFILE'
  AND directory_profile_id = 258
  AND geocode_status = 'RESOLVED'
  AND public_visibility = 'EXACT_PUBLIC'
  AND public_precision = 'EXACT'
  AND source_fingerprint = 'c24115d9d9f0dd9601247da885d2cbcccabc4df22cc43b534e63b2bb0bb9d1e8'
  AND resolved_source_fingerprint = source_fingerprint
  AND (google_place_id IS NULL
    OR google_place_source_fingerprint IS NULL
    OR google_place_source_fingerprint <> source_fingerprint);

UPDATE geo_points
SET google_place_id = 'ChIJJXnGQAA9FUcR2vn1DrgOR2o',
    google_place_source_fingerprint = source_fingerprint,
    google_place_matched_at = CURRENT_TIMESTAMP
WHERE target_type = 'DIRECTORY_PROFILE'
  AND directory_profile_id = 259
  AND geocode_status = 'RESOLVED'
  AND public_visibility = 'EXACT_PUBLIC'
  AND public_precision = 'EXACT'
  AND source_fingerprint = 'b0ff6c13d542a63886298affa15a07a255728c2bdb97b198d7b2b3657e5c60a2'
  AND resolved_source_fingerprint = source_fingerprint
  AND (google_place_id IS NULL
    OR google_place_source_fingerprint IS NULL
    OR google_place_source_fingerprint <> source_fingerprint);

UPDATE geo_points
SET google_place_id = 'ChIJxQFJfiuPbEcR4YBQ6LhmaSQ',
    google_place_source_fingerprint = source_fingerprint,
    google_place_matched_at = CURRENT_TIMESTAMP
WHERE target_type = 'DIRECTORY_PROFILE'
  AND directory_profile_id = 276
  AND geocode_status = 'RESOLVED'
  AND public_visibility = 'EXACT_PUBLIC'
  AND public_precision = 'EXACT'
  AND source_fingerprint = '3d5982fd94e1efe4b417d8b55d8a2428700642b0764425fb56f07df2cfe0feff'
  AND resolved_source_fingerprint = source_fingerprint
  AND (google_place_id IS NULL
    OR google_place_source_fingerprint IS NULL
    OR google_place_source_fingerprint <> source_fingerprint);

UPDATE geo_points
SET google_place_id = 'ChIJPbMNxNKIbEcRixt9Fe9UICo',
    google_place_source_fingerprint = source_fingerprint,
    google_place_matched_at = CURRENT_TIMESTAMP
WHERE target_type = 'DIRECTORY_PROFILE'
  AND directory_profile_id = 277
  AND geocode_status = 'RESOLVED'
  AND public_visibility = 'EXACT_PUBLIC'
  AND public_precision = 'EXACT'
  AND source_fingerprint = '736f26040d1db2c46dfe274ba04cd67edd9d2ded21fab6cf0f8a12a44a010685'
  AND resolved_source_fingerprint = source_fingerprint
  AND (google_place_id IS NULL
    OR google_place_source_fingerprint IS NULL
    OR google_place_source_fingerprint <> source_fingerprint);

UPDATE geo_points
SET google_place_id = 'ChIJsSQyt3lva0cR2ckhdmdMfpo',
    google_place_source_fingerprint = source_fingerprint,
    google_place_matched_at = CURRENT_TIMESTAMP
WHERE target_type = 'DIRECTORY_PROFILE'
  AND directory_profile_id = 332
  AND geocode_status = 'RESOLVED'
  AND public_visibility = 'EXACT_PUBLIC'
  AND public_precision = 'EXACT'
  AND source_fingerprint = 'b775f6c195229ddebdfe7e33dd6b757556774502fc9ff5a702e5e50ba87d5c5b'
  AND resolved_source_fingerprint = source_fingerprint
  AND (google_place_id IS NULL
    OR google_place_source_fingerprint IS NULL
    OR google_place_source_fingerprint <> source_fingerprint);

UPDATE geo_points
SET google_place_id = 'ChIJ6Uh5479na0cR75aXbIyaA9Y',
    google_place_source_fingerprint = source_fingerprint,
    google_place_matched_at = CURRENT_TIMESTAMP
WHERE target_type = 'DIRECTORY_PROFILE'
  AND directory_profile_id = 333
  AND geocode_status = 'RESOLVED'
  AND public_visibility = 'EXACT_PUBLIC'
  AND public_precision = 'EXACT'
  AND source_fingerprint = '347b90eda43495d832fb0f8041a80d6ccebc7403ac57e431626f2932d37c1493'
  AND resolved_source_fingerprint = source_fingerprint
  AND (google_place_id IS NULL
    OR google_place_source_fingerprint IS NULL
    OR google_place_source_fingerprint <> source_fingerprint);

UPDATE geo_points
SET google_place_id = 'ChIJ3aF53L1na0cRCauKSgf-04o',
    google_place_source_fingerprint = source_fingerprint,
    google_place_matched_at = CURRENT_TIMESTAMP
WHERE target_type = 'DIRECTORY_PROFILE'
  AND directory_profile_id = 334
  AND geocode_status = 'RESOLVED'
  AND public_visibility = 'EXACT_PUBLIC'
  AND public_precision = 'EXACT'
  AND source_fingerprint = '68d9d8d7ff096da6351aa9330ae7dd43865a3573fa77f34843e10012a015c4b2'
  AND resolved_source_fingerprint = source_fingerprint
  AND (google_place_id IS NULL
    OR google_place_source_fingerprint IS NULL
    OR google_place_source_fingerprint <> source_fingerprint);

UPDATE geo_points
SET google_place_id = 'ChIJD9-ES7fhPkcRZIkt2N6zSMg',
    google_place_source_fingerprint = source_fingerprint,
    google_place_matched_at = CURRENT_TIMESTAMP
WHERE target_type = 'DIRECTORY_PROFILE'
  AND directory_profile_id = 350
  AND geocode_status = 'RESOLVED'
  AND public_visibility = 'EXACT_PUBLIC'
  AND public_precision = 'EXACT'
  AND source_fingerprint = '4779506480e8bf1426368fd82574f48b3005f8b050966eb11a775b7d975cf758'
  AND resolved_source_fingerprint = source_fingerprint
  AND (google_place_id IS NULL
    OR google_place_source_fingerprint IS NULL
    OR google_place_source_fingerprint <> source_fingerprint);

UPDATE geo_points
SET google_place_id = 'ChIJ7-d1xHggP0cRt2hKRQKA2L4',
    google_place_source_fingerprint = source_fingerprint,
    google_place_matched_at = CURRENT_TIMESTAMP
WHERE target_type = 'DIRECTORY_PROFILE'
  AND directory_profile_id = 360
  AND geocode_status = 'RESOLVED'
  AND public_visibility = 'EXACT_PUBLIC'
  AND public_precision = 'EXACT'
  AND source_fingerprint = 'e703091bd3cae45481b734f6beebdefd2de9fbc9f95648e87971e76eeb3fd0ac'
  AND resolved_source_fingerprint = source_fingerprint
  AND (google_place_id IS NULL
    OR google_place_source_fingerprint IS NULL
    OR google_place_source_fingerprint <> source_fingerprint);

UPDATE geo_points
SET google_place_id = 'ChIJ2_KcVrVcFEcROTRsLsDG-8M',
    google_place_source_fingerprint = source_fingerprint,
    google_place_matched_at = CURRENT_TIMESTAMP
WHERE target_type = 'DIRECTORY_PROFILE'
  AND directory_profile_id = 371
  AND geocode_status = 'RESOLVED'
  AND public_visibility = 'EXACT_PUBLIC'
  AND public_precision = 'EXACT'
  AND source_fingerprint = '5fceea4939528aae02171d0ebabd1f4777c77dbde444a7fc4eae4fce1b5d699a'
  AND resolved_source_fingerprint = source_fingerprint
  AND (google_place_id IS NULL
    OR google_place_source_fingerprint IS NULL
    OR google_place_source_fingerprint <> source_fingerprint);

UPDATE geo_points
SET google_place_id = 'ChIJN9VZeK3_FEcReOKipKItA44',
    google_place_source_fingerprint = source_fingerprint,
    google_place_matched_at = CURRENT_TIMESTAMP
WHERE target_type = 'DIRECTORY_PROFILE'
  AND directory_profile_id = 392
  AND geocode_status = 'RESOLVED'
  AND public_visibility = 'EXACT_PUBLIC'
  AND public_precision = 'EXACT'
  AND source_fingerprint = 'c7bc8442dfcb37562fcecf7120ea7e673c892362ae5c90b7b0def2eea1314e54'
  AND resolved_source_fingerprint = source_fingerprint
  AND (google_place_id IS NULL
    OR google_place_source_fingerprint IS NULL
    OR google_place_source_fingerprint <> source_fingerprint);

UPDATE geo_points
SET google_place_id = 'ChIJN2prW0z9FEcRHvkX65OCzVQ',
    google_place_source_fingerprint = source_fingerprint,
    google_place_matched_at = CURRENT_TIMESTAMP
WHERE target_type = 'DIRECTORY_PROFILE'
  AND directory_profile_id = 393
  AND geocode_status = 'RESOLVED'
  AND public_visibility = 'EXACT_PUBLIC'
  AND public_precision = 'EXACT'
  AND source_fingerprint = '75d7976b3af4c5589f6d06db6025d8b478c02036f74ed784e7d6c998d2a58018'
  AND resolved_source_fingerprint = source_fingerprint
  AND (google_place_id IS NULL
    OR google_place_source_fingerprint IS NULL
    OR google_place_source_fingerprint <> source_fingerprint);

UPDATE geo_points
SET google_place_id = 'ChIJ87oT1oo_a0cRIYW_lagk1TA',
    google_place_source_fingerprint = source_fingerprint,
    google_place_matched_at = CURRENT_TIMESTAMP
WHERE target_type = 'DIRECTORY_PROFILE'
  AND directory_profile_id = 409
  AND geocode_status = 'RESOLVED'
  AND public_visibility = 'EXACT_PUBLIC'
  AND public_precision = 'EXACT'
  AND source_fingerprint = '3ea7473c671b391e59e6c62fbbf7f0fcb91cbb1bc74e5948acc44f7452d32d63'
  AND resolved_source_fingerprint = source_fingerprint
  AND (google_place_id IS NULL
    OR google_place_source_fingerprint IS NULL
    OR google_place_source_fingerprint <> source_fingerprint);

UPDATE geo_points
SET google_place_id = 'ChIJ-RC-MbmQbEcRBGXSbtDcicg',
    google_place_source_fingerprint = source_fingerprint,
    google_place_matched_at = CURRENT_TIMESTAMP
WHERE target_type = 'DIRECTORY_PROFILE'
  AND directory_profile_id = 422
  AND geocode_status = 'RESOLVED'
  AND public_visibility = 'EXACT_PUBLIC'
  AND public_precision = 'EXACT'
  AND source_fingerprint = '9b1dbbbe4816023cd3151d8b7a38d40363163d3fb4f50405ee021b5381c7d854'
  AND resolved_source_fingerprint = source_fingerprint
  AND (google_place_id IS NULL
    OR google_place_source_fingerprint IS NULL
    OR google_place_source_fingerprint <> source_fingerprint);

UPDATE geo_points
SET google_place_id = 'ChIJ_xPdK5NUa0cRfqQ-eBkz0yU',
    google_place_source_fingerprint = source_fingerprint,
    google_place_matched_at = CURRENT_TIMESTAMP
WHERE target_type = 'DIRECTORY_PROFILE'
  AND directory_profile_id = 426
  AND geocode_status = 'RESOLVED'
  AND public_visibility = 'EXACT_PUBLIC'
  AND public_precision = 'EXACT'
  AND source_fingerprint = '674cf1a12cb86330b8a9568cb3ab9a24b41ef9605d0b86a32bb085386ab4f2e0'
  AND resolved_source_fingerprint = source_fingerprint
  AND (google_place_id IS NULL
    OR google_place_source_fingerprint IS NULL
    OR google_place_source_fingerprint <> source_fingerprint);

UPDATE geo_points
SET google_place_id = 'ChIJDWatDbg6PkcRCt1s2PetYzY',
    google_place_source_fingerprint = source_fingerprint,
    google_place_matched_at = CURRENT_TIMESTAMP
WHERE target_type = 'DIRECTORY_PROFILE'
  AND directory_profile_id = 429
  AND geocode_status = 'RESOLVED'
  AND public_visibility = 'EXACT_PUBLIC'
  AND public_precision = 'EXACT'
  AND source_fingerprint = '7886c5c3ee346a4657d3677a5773af243081f1ae55157952312085d55465e3b8'
  AND resolved_source_fingerprint = source_fingerprint
  AND (google_place_id IS NULL
    OR google_place_source_fingerprint IS NULL
    OR google_place_source_fingerprint <> source_fingerprint);

UPDATE geo_points
SET google_place_id = 'ChIJDWatDbg6PkcRCt1s2PetYzY',
    google_place_source_fingerprint = source_fingerprint,
    google_place_matched_at = CURRENT_TIMESTAMP
WHERE target_type = 'DIRECTORY_PROFILE'
  AND directory_profile_id = 434
  AND geocode_status = 'RESOLVED'
  AND public_visibility = 'EXACT_PUBLIC'
  AND public_precision = 'EXACT'
  AND source_fingerprint = '7886c5c3ee346a4657d3677a5773af243081f1ae55157952312085d55465e3b8'
  AND resolved_source_fingerprint = source_fingerprint
  AND (google_place_id IS NULL
    OR google_place_source_fingerprint IS NULL
    OR google_place_source_fingerprint <> source_fingerprint);

UPDATE geo_points
SET google_place_id = 'ChIJc98WyOiLFEcRLcPMnNnSig8',
    google_place_source_fingerprint = source_fingerprint,
    google_place_matched_at = CURRENT_TIMESTAMP
WHERE target_type = 'DIRECTORY_PROFILE'
  AND directory_profile_id = 436
  AND geocode_status = 'RESOLVED'
  AND public_visibility = 'EXACT_PUBLIC'
  AND public_precision = 'EXACT'
  AND source_fingerprint = '8637f4d86a2529b3f42c20e3e58bf000f5b6d12cd0210f1b2e21f34b751b2bd6'
  AND resolved_source_fingerprint = source_fingerprint
  AND (google_place_id IS NULL
    OR google_place_source_fingerprint IS NULL
    OR google_place_source_fingerprint <> source_fingerprint);
