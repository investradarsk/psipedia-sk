-- Activate only the reviewed adoption staging cohort after validating its complete state.
-- Any mismatch aborts before the single cohort-scoped UPDATE.

DROP TABLE IF EXISTS __psipedia_adoption_activation_guard_0039;
CREATE TABLE __psipedia_adoption_activation_guard_0039 (
  ok INTEGER NOT NULL CHECK (ok = 1)
);

INSERT INTO __psipedia_adoption_activation_guard_0039 (ok)
SELECT CASE WHEN
  (SELECT COUNT(*) FROM adoption_dogs WHERE created_by = 'adoption-staging-import:v1') = 36
  AND (SELECT COUNT(*) FROM adoption_dogs WHERE created_by = 'adoption-staging-import:v1' AND status = 'DRAFT') = 36
  AND (SELECT COUNT(*) FROM adoption_dogs WHERE created_by = 'adoption-staging-import:v1' AND status IN ('ACTIVE', 'RESERVED')) = 0
  AND (SELECT COUNT(*) FROM adoption_dogs WHERE created_by = 'adoption-staging-import:v1' AND published_at IS NULL) = 36
  AND (SELECT COUNT(DISTINCT slug) FROM adoption_dogs WHERE created_by = 'adoption-staging-import:v1') = 36
  AND (SELECT COUNT(*) FROM adoption_dogs WHERE created_by = 'adoption-staging-import:v1' AND organization_id IS NOT NULL) = 36
  AND (SELECT COUNT(DISTINCT organization_id) FROM adoption_dogs WHERE created_by = 'adoption-staging-import:v1') = 4
  AND (SELECT COUNT(*) FROM adoption_dogs dog JOIN help_organizations organization ON organization.id = dog.organization_id
    WHERE dog.created_by = 'adoption-staging-import:v1'
      AND dog.organization_name = organization.name AND dog.organization_slug = organization.slug) = 36
  AND (SELECT COUNT(*) FROM adoption_dogs WHERE created_by = 'adoption-staging-import:v1'
    AND slug IN ('charlie-hlada-novy-domov', 'kira-hlada-novy-domov', 'aisha-hlada-novy-domov', 'max-hlada-novy-domov')) = 0
  AND (SELECT COUNT(*) FROM adoption_dogs dog JOIN help_organizations organization ON organization.id = dog.organization_id
    WHERE dog.created_by = 'adoption-staging-import:v1' AND organization.import_key = 'help-org:pomoc-unia-vzajomnej-pomoci-ludi-a-psov-u-v-p') = 16
  AND (SELECT COUNT(*) FROM adoption_dogs dog JOIN help_organizations organization ON organization.id = dog.organization_id
    WHERE dog.created_by = 'adoption-staging-import:v1' AND organization.import_key = 'help-org:pomoc-dog-azyl-o-z') = 9
  AND (SELECT COUNT(*) FROM adoption_dogs dog JOIN help_organizations organization ON organization.id = dog.organization_id
    WHERE dog.created_by = 'adoption-staging-import:v1' AND organization.import_key = 'help-org:pomoc-zdruzenie-na-ochranu-zvierat-trnava') = 7
  AND (SELECT COUNT(*) FROM adoption_dogs dog JOIN help_organizations organization ON organization.id = dog.organization_id
    WHERE dog.created_by = 'adoption-staging-import:v1' AND organization.import_key = 'help-org:pomoc-oz-pes-v-nudzi') = 4
THEN 1 ELSE 0 END;

UPDATE adoption_dogs
SET status = 'ACTIVE',
    published_at = '2026-09-15T16:00:00.000Z',
    updated_at = '2026-09-15T16:00:00.000Z',
    updated_by = 'adoption-public-cutover:v1'
WHERE created_by = 'adoption-staging-import:v1' AND status = 'DRAFT';

INSERT INTO __psipedia_adoption_activation_guard_0039 (ok)
SELECT CASE WHEN
  (SELECT COUNT(*) FROM adoption_dogs WHERE created_by = 'adoption-staging-import:v1') = 36
  AND (SELECT COUNT(*) FROM adoption_dogs WHERE created_by = 'adoption-staging-import:v1' AND status = 'ACTIVE') = 36
  AND (SELECT COUNT(*) FROM adoption_dogs WHERE created_by = 'adoption-staging-import:v1' AND status IN ('DRAFT', 'RESERVED')) = 0
  AND (SELECT COUNT(*) FROM adoption_dogs WHERE created_by = 'adoption-staging-import:v1' AND published_at IS NOT NULL) = 36
  AND (SELECT COUNT(*) FROM adoption_dogs dog JOIN help_organizations organization ON organization.id = dog.organization_id
    WHERE dog.created_by = 'adoption-staging-import:v1'
      AND dog.organization_name = organization.name AND dog.organization_slug = organization.slug) = 36
  AND (SELECT COUNT(DISTINCT organization_id) FROM adoption_dogs WHERE created_by = 'adoption-staging-import:v1') = 4
  AND (SELECT COUNT(*) FROM adoption_dogs WHERE created_by = 'adoption-staging-import:v1'
    AND slug IN ('charlie-hlada-novy-domov', 'kira-hlada-novy-domov', 'aisha-hlada-novy-domov', 'max-hlada-novy-domov')) = 0
  AND (SELECT COUNT(*) FROM adoption_dogs dog JOIN help_organizations organization ON organization.id = dog.organization_id
    WHERE dog.created_by = 'adoption-staging-import:v1' AND organization.import_key = 'help-org:pomoc-unia-vzajomnej-pomoci-ludi-a-psov-u-v-p') = 16
  AND (SELECT COUNT(*) FROM adoption_dogs dog JOIN help_organizations organization ON organization.id = dog.organization_id
    WHERE dog.created_by = 'adoption-staging-import:v1' AND organization.import_key = 'help-org:pomoc-dog-azyl-o-z') = 9
  AND (SELECT COUNT(*) FROM adoption_dogs dog JOIN help_organizations organization ON organization.id = dog.organization_id
    WHERE dog.created_by = 'adoption-staging-import:v1' AND organization.import_key = 'help-org:pomoc-zdruzenie-na-ochranu-zvierat-trnava') = 7
  AND (SELECT COUNT(*) FROM adoption_dogs dog JOIN help_organizations organization ON organization.id = dog.organization_id
    WHERE dog.created_by = 'adoption-staging-import:v1' AND organization.import_key = 'help-org:pomoc-oz-pes-v-nudzi') = 4
THEN 1 ELSE 0 END;

DROP TABLE __psipedia_adoption_activation_guard_0039;
