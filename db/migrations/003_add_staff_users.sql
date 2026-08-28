-- ============================================================================
-- Run this ONCE against your existing database:
--   mysql -u root -p recruitment_db < server/db/migrations/003_add_staff_users.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS staff_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT uq_staff_username UNIQUE (username)
);

-- This replaces the single hard-coded ADMIN_USERNAME/ADMIN_PASSWORD_HASH
-- approach from Week 2. If you already set those in .env, they're no
-- longer used by the login route - each of your 5 staff members now
-- registers their own row in this table instead.
