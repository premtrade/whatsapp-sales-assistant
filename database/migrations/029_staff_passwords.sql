-- Add password storage for staff authentication.
ALTER TABLE staff_users
ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Initialize the seeded admin account with the project admin password.
-- Hash below is bcrypt('WafloAdmin#2026-xK9mQ7vZ', 12) - generated and verified with bcrypt.compare.
UPDATE staff_users
SET password_hash = '$2b$12$bivPCv6nqQf/HMg5tpsyfuWDQuECUufEVWOcVksQxvDIG/iYj9nH2'
WHERE email = 'leroy@example.com'
  AND password_hash IS NULL;
