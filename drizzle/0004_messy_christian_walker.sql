-- The latest baseline migration already includes recipient_email.
-- Runtime schema repair also adds it for databases created before migrations ran.
SELECT 1;
