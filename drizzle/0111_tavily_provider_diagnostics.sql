-- AUTOMATION-TAVILY-PROVIDER-DIAGNOSTICS-1
-- Additive, nullable per-attempt Tavily provider diagnostics.

ALTER TABLE `automation_source_provider_usage`
  ADD COLUMN `provider_http_status` integer;

ALTER TABLE `automation_source_provider_usage`
  ADD COLUMN `provider_error_code` text;

ALTER TABLE `automation_source_provider_usage`
  ADD COLUMN `provider_error_detail` text;

ALTER TABLE `automation_source_provider_usage`
  ADD COLUMN `provider_request_id` text;

ALTER TABLE `automation_source_provider_usage`
  ADD COLUMN `transport_error_name` text;

ALTER TABLE `automation_source_provider_usage`
  ADD COLUMN `transport_error_code` text;
