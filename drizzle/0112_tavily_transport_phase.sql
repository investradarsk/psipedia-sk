-- AUTOMATION-TAVILY-TRANSPORT-DIAG-2
-- Additive, nullable per-attempt Tavily transport phase diagnostic.

ALTER TABLE `automation_source_provider_usage`
  ADD COLUMN `transport_phase` text;
