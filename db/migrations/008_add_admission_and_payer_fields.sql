-- ============================================================================
-- Run once: mysql -u root -p recruitment_db < server/db/migrations/008_add_admission_and_payer_fields.sql
--
-- Column names here match server/db/schema.sql exactly - if you're ever
-- unsure what a fresh install looks like, schema.sql is the source of
-- truth for the full current shape of every table.
-- ============================================================================

-- --- 1. Personal Details / Bio Data (beyond what already existed) ---------
ALTER TABLE applicants ADD COLUMN gender ENUM('male', 'female', 'other') NULL;
ALTER TABLE applicants ADD COLUMN email VARCHAR(255) NULL;
ALTER TABLE applicants ADD COLUMN postal_address VARCHAR(255) NULL;
ALTER TABLE applicants ADD COLUMN current_residence VARCHAR(255) NULL;
ALTER TABLE applicants ADD COLUMN county_of_residence VARCHAR(100) NULL;
ALTER TABLE applicants ADD COLUMN date_of_birth DATE NULL;
ALTER TABLE applicants ADD COLUMN place_of_birth VARCHAR(255) NULL;
ALTER TABLE applicants ADD COLUMN religion VARCHAR(100) NULL;
ALTER TABLE applicants ADD COLUMN nationality VARCHAR(100) NULL;
ALTER TABLE applicants ADD COLUMN referring_agent VARCHAR(255) NULL;

-- --- 2. Academic Details ----------------------------------------------------
ALTER TABLE applicants ADD COLUMN academic_qualification VARCHAR(255) NULL;
ALTER TABLE applicants ADD COLUMN institution_name VARCHAR(255) NULL;
ALTER TABLE applicants ADD COLUMN year_of_completion VARCHAR(10) NULL;
ALTER TABLE applicants ADD COLUMN grade VARCHAR(50) NULL;

-- --- 3. Parent/Guardian Details ---------------------------------------------
ALTER TABLE applicants ADD COLUMN guardian_full_name VARCHAR(255) NULL;
ALTER TABLE applicants ADD COLUMN guardian_relationship VARCHAR(100) NULL;
ALTER TABLE applicants ADD COLUMN guardian_phone VARCHAR(50) NULL;
ALTER TABLE applicants ADD COLUMN guardian_residence VARCHAR(255) NULL;
ALTER TABLE applicants ADD COLUMN guardian_occupation VARCHAR(255) NULL;

-- --- 4. Next of Kin Details --------------------------------------------------
ALTER TABLE applicants ADD COLUMN nok_full_name VARCHAR(255) NULL;
ALTER TABLE applicants ADD COLUMN nok_relationship VARCHAR(100) NULL;
ALTER TABLE applicants ADD COLUMN nok_id_number VARCHAR(50) NULL;
ALTER TABLE applicants ADD COLUMN nok_phone VARCHAR(50) NULL;
ALTER TABLE applicants ADD COLUMN nok_email VARCHAR(255) NULL;

-- --- 5. Emergency Contact ----------------------------------------------------
ALTER TABLE applicants ADD COLUMN emergency_name VARCHAR(255) NULL;
ALTER TABLE applicants ADD COLUMN emergency_relationship VARCHAR(100) NULL;
ALTER TABLE applicants ADD COLUMN emergency_phone VARCHAR(50) NULL;
ALTER TABLE applicants ADD COLUMN emergency_email VARCHAR(255) NULL;
ALTER TABLE applicants ADD COLUMN emergency_residence VARCHAR(255) NULL;

-- --- Declaration --------------------------------------------------------------
-- The signature IMAGE is stored via the existing documents table
-- (doc_type='signature'), not a column here - reuses the private-storage +
-- authenticated-download machinery already built for ID copies/photos.
ALTER TABLE applicants ADD COLUMN declaration_accepted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE applicants ADD COLUMN declaration_name VARCHAR(255) NULL;
ALTER TABLE applicants ADD COLUMN declaration_id_number VARCHAR(50) NULL;
ALTER TABLE applicants ADD COLUMN declaration_date DATE NULL;

-- --- Payer details (who actually pays, if not the applicant themselves) -----
ALTER TABLE applicants ADD COLUMN payer_relationship ENUM('self', 'parent', 'guardian', 'friend') NULL;
ALTER TABLE applicants ADD COLUMN payer_name VARCHAR(255) NULL;
ALTER TABLE applicants ADD COLUMN payer_phone VARCHAR(50) NULL;

-- Allow signature as a document type alongside the existing three (a no-op
-- if you already ran this as part of an earlier round).
ALTER TABLE documents MODIFY COLUMN doc_type
  ENUM('id_copy', 'passport_photo', 'personal_accident_cover', 'signature') NOT NULL;
