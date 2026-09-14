-- Add password storage for staff authentication.
ALTER TABLE staff_users
ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Initialize the seeded admin account with the project admin password.
-- Hash below is bcrypt('admin123', 12) - generated and verified with bcrypt.compare.
UPDATE staff_users
SET password_hash = '$2b$12$iWiEzAzVmbg5O2J49g/VGeGHIRzp9sIoesa/LyGJPSiD5rBoZsi3S'
WHERE email = 'leroy@example.com'
  AND password_hash IS NULL;
