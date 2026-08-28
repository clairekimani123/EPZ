-- ============================================================================
-- Run once: mysql -u root -p recruitment_db < server/db/migrations/005_add_location_payment_columns.sql
-- ============================================================================

ALTER TABLE applicants ADD COLUMN location VARCHAR(255) NULL;
ALTER TABLE applicants ADD COLUMN payment_status ENUM('pending', 'completed', 'failed') NOT NULL DEFAULT 'pending';
ALTER TABLE applicants ADD COLUMN payment_date TIMESTAMP NULL DEFAULT NULL;

-- Fix: any existing Straightex batches that were created before the
-- Trainee/Job selector existed defaulted to 'job'. Run this to fix your
-- two test batches from the screenshot (adjust the WHERE if you have
-- other Job batches at Straightex you actually want to keep as Job):
UPDATE batches
SET application_type = 'trainee'
WHERE company_id = (SELECT id FROM companies WHERE name = 'Straightex')
  AND application_type = 'job';
