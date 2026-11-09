-- Optional public lead; main description remains a separate long field.
ALTER TABLE lost_found_dog_reports ADD COLUMN short_description TEXT NOT NULL DEFAULT '';
