-- ============================================================================
-- Run once: mysql -u root -p recruitment_db < server/db/migrations/006_add_payments.sql
-- ============================================================================

-- Fee varies per batch (a training batch and a job batch can charge
-- different amounts, or nothing at all).
ALTER TABLE batches ADD COLUMN fee_amount DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Needed to correlate Safaricom's asynchronous callback back to the right
-- applicant - we store the ID Safaricom gives us when we INITIATE the
-- request, then look up by it when the callback arrives with the RESULT.
ALTER TABLE applicants ADD COLUMN mpesa_checkout_request_id VARCHAR(100) NULL;
ALTER TABLE applicants ADD COLUMN mpesa_receipt_number VARCHAR(50) NULL;
