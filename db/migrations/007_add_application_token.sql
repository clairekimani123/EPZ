-- ============================================================================
-- Run once: mysql -u root -p recruitment_db < server/db/migrations/007_add_application_token.sql
-- ============================================================================

-- A one-time secret handed to the applicant's browser at the moment they
-- apply, and required to trigger their own payment request afterward.
-- This is what stops a stranger from spamming payment prompts to random
-- applicant IDs - without this token, the public payment-trigger endpoint
-- rejects the request.
ALTER TABLE applicants ADD COLUMN application_token VARCHAR(64) NULL;
ALTER TABLE applicants ADD UNIQUE INDEX uq_application_token (application_token);
