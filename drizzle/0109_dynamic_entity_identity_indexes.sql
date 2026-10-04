-- DYNAMIC-ENTITY-IDENTITY-1
-- Additive lookup indexes only. No new identity tables and no canonical behavior changes.

CREATE INDEX IF NOT EXISTS managed_events_automation_identity_idx
  ON managed_events(start_date,title,organizer);

CREATE INDEX IF NOT EXISTS managed_events_automation_website_idx
  ON managed_events(website_url);

CREATE INDEX IF NOT EXISTS managed_events_automation_registration_idx
  ON managed_events(registration_url);

CREATE INDEX IF NOT EXISTS adoption_dogs_automation_identity_idx
  ON adoption_dogs(organization_name,name);

CREATE INDEX IF NOT EXISTS adoption_dogs_automation_source_url_idx
  ON adoption_dogs(external_source_url);

CREATE INDEX IF NOT EXISTS help_cases_automation_foster_dog_idx
  ON help_cases(category,organization,dog_name);

CREATE INDEX IF NOT EXISTS help_cases_automation_foster_title_idx
  ON help_cases(category,organization,title);

CREATE INDEX IF NOT EXISTS help_cases_automation_action_url_idx
  ON help_cases(action_url);

CREATE INDEX IF NOT EXISTS lost_found_automation_city_identity_idx
  ON lost_found_dog_reports(type,event_date,city);

CREATE INDEX IF NOT EXISTS lost_found_automation_district_identity_idx
  ON lost_found_dog_reports(type,event_date,district);

CREATE INDEX IF NOT EXISTS lost_found_automation_source_url_idx
  ON lost_found_dog_reports(source_url);
