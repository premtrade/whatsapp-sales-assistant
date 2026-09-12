-- Add password storage for staff authentication.
ALTER TABLE staff_users
ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Initialize the seeded admin account with the project admin password.
UPDATE staff_users
SET password_hash = '$2b$12$fj8/6l3Z9it3jglCrCALn.V.RtT/ErXsq6f8bGGPJpb72BegwuuAK'
WHERE email = 'leroy@example.com'
  AND password_hash IS NULL;
