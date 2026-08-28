-- ============================================================================
-- Run this ONCE:
--   mysql -u root -p recruitment_db < server/db/migrations/004_add_application_type.sql
-- ============================================================================

-- Every batch is now tagged as either a Straightex traineeship or an
-- external company's job opening. This is what lets the application form
-- show a different company list depending on which one someone picks.
ALTER TABLE batches
  ADD COLUMN application_type ENUM('trainee', 'job') NOT NULL DEFAULT 'job';
