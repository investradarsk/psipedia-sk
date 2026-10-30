-- Last acknowledged values per editable breed field. The stable identity
-- remains breed_notion_sync.breed_id (unique). These JSON receipts allow
-- changes to one Notion field to update only the corresponding Admin field.
-- NULL means legacy row: baseline is established safely on its first run.
ALTER TABLE breed_notion_sync ADD COLUMN notion_fields_json TEXT;
ALTER TABLE breed_notion_sync ADD COLUMN admin_fields_json TEXT;
