-- ============================================================================
-- Run this in MySQL Workbench: open a SQL tab connected to your database,
-- paste this in, and execute (the lightning bolt icon).
-- ============================================================================

CREATE TABLE IF NOT EXISTS applicants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(255) NOT NULL,
  phone_number VARCHAR(50) NOT NULL,
  age INT NOT NULL,
  id_number VARCHAR(100) NOT NULL,
  has_experience BOOLEAN NOT NULL DEFAULT FALSE,
  experience_details TEXT,
  status ENUM('applied', 'shortlisted', 'contract_signed', 'in_training', 'employed', 'rejected')
    NOT NULL DEFAULT 'applied',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT chk_age CHECK (age >= 18 AND age <= 30),
  CONSTRAINT uq_id_number UNIQUE (id_number)
);

-- Week 2: documents uploaded per applicant (ID copy, photo, accident cover).
-- file_path stores only the filename on disk (server/uploads/<file_path>),
-- never a public URL - see server/routes/documents.js for why.
CREATE TABLE IF NOT EXISTS documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  applicant_id INT NOT NULL,
  doc_type ENUM('id_copy', 'passport_photo', 'personal_accident_cover') NOT NULL,
  file_path VARCHAR(255) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_documents_applicant FOREIGN KEY (applicant_id)
    REFERENCES applicants(id) ON DELETE CASCADE
);

-- ============================================================================
-- WEEK 3: companies + batches
-- A "batch" is one specific hiring request: "30 Tailoring Trainees for
-- Company X, ages 18-26." Applicants now apply to a specific batch instead
-- of landing in one flat undifferentiated list.
-- ============================================================================

CREATE TABLE IF NOT EXISTS companies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  contact_person VARCHAR(255),
  contact_phone VARCHAR(50),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS batches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  role VARCHAR(255) NOT NULL,
  quantity_needed INT NOT NULL,
  age_min INT NOT NULL DEFAULT 18,
  age_max INT NOT NULL DEFAULT 30,
  application_type ENUM('trainee', 'job') NOT NULL DEFAULT 'job',
  status ENUM('open', 'filled', 'closed') NOT NULL DEFAULT 'open',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_batches_company FOREIGN KEY (company_id)
    REFERENCES companies(id) ON DELETE CASCADE
);

-- Every applicant now belongs to a batch. NULL is allowed for old rows
-- created before this column existed.
ALTER TABLE applicants ADD COLUMN batch_id INT NULL;

ALTER TABLE applicants
  ADD CONSTRAINT fk_applicants_batch FOREIGN KEY (batch_id)
    REFERENCES batches(id) ON DELETE SET NULL;

-- Location + payment tracking (groundwork for the payment feature, not
-- wired to a real payment provider yet - payment_status starts 'pending'
-- for everyone and stays that way until that integration exists).
ALTER TABLE applicants ADD COLUMN location VARCHAR(255) NULL;
ALTER TABLE applicants ADD COLUMN payment_status ENUM('pending', 'completed', 'failed') NOT NULL DEFAULT 'pending';
ALTER TABLE applicants ADD COLUMN payment_date TIMESTAMP NULL DEFAULT NULL;

-- ----------------------------------------------------------------------------
-- NOTE — same as before: no row-level security in MySQL either. Access
-- control lives entirely in server/routes/*.js. Never expose this database
-- directly to the internet; only your Express server's connection should
-- ever reach it.
-- ----------------------------------------------------------------------------
