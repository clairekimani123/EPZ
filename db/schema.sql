- ============================================================================
-- Full current schema for a FRESH install. If you already have a database
-- from earlier in this project, don't run this - use the numbered files in
-- migrations/ instead, in order, starting from whichever one you haven't
-- run yet.
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
  status ENUM('open', 'filled', 'closed') NOT NULL DEFAULT 'open',
  application_type ENUM('trainee', 'job') NOT NULL DEFAULT 'job',
  fee_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_batches_company FOREIGN KEY (company_id)
    REFERENCES companies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS applicants (
  id INT AUTO_INCREMENT PRIMARY KEY,

  -- Core / bio data
  full_name VARCHAR(255) NOT NULL,
  phone_number VARCHAR(50) NOT NULL,
  age INT NOT NULL,
  id_number VARCHAR(100) NOT NULL,
  location VARCHAR(255) NULL,
  gender ENUM('male', 'female', 'other') NULL,
  email VARCHAR(255) NULL,
  postal_address VARCHAR(255) NULL,
  current_residence VARCHAR(255) NULL,
  county_of_residence VARCHAR(100) NULL,
  date_of_birth DATE NULL,
  place_of_birth VARCHAR(255) NULL,
  religion VARCHAR(100) NULL,
  nationality VARCHAR(100) NULL,
  referring_agent VARCHAR(255) NULL,

  -- Academic details
  academic_qualification VARCHAR(255) NULL,
  institution_name VARCHAR(255) NULL,
  year_of_completion VARCHAR(10) NULL,
  grade VARCHAR(50) NULL,

  -- Parent/Guardian
  guardian_full_name VARCHAR(255) NULL,
  guardian_relationship VARCHAR(100) NULL,
  guardian_phone VARCHAR(50) NULL,
  guardian_residence VARCHAR(255) NULL,
  guardian_occupation VARCHAR(255) NULL,

  -- Next of kin
  nok_full_name VARCHAR(255) NULL,
  nok_relationship VARCHAR(100) NULL,
  nok_id_number VARCHAR(50) NULL,
  nok_phone VARCHAR(50) NULL,
  nok_email VARCHAR(255) NULL,

  -- Emergency contact
  emergency_name VARCHAR(255) NULL,
  emergency_relationship VARCHAR(100) NULL,
  emergency_phone VARCHAR(50) NULL,
  emergency_email VARCHAR(255) NULL,
  emergency_residence VARCHAR(255) NULL,

  -- Declaration
  declaration_accepted BOOLEAN NOT NULL DEFAULT FALSE,
  declaration_name VARCHAR(255) NULL,
  declaration_id_number VARCHAR(50) NULL,
  declaration_date DATE NULL,

  -- Job-specific
  has_experience BOOLEAN NOT NULL DEFAULT FALSE,
  experience_details TEXT NULL,

  -- Matching / pipeline
  batch_id INT NULL,
  status ENUM('applied', 'shortlisted', 'contract_signed', 'in_training', 'employed', 'rejected')
    NOT NULL DEFAULT 'applied',

  -- Payment
  payment_status ENUM('pending', 'completed', 'failed') NOT NULL DEFAULT 'pending',
  payment_date TIMESTAMP NULL DEFAULT NULL,
  mpesa_checkout_request_id VARCHAR(100) NULL,
  mpesa_receipt_number VARCHAR(50) NULL,
  payer_relationship ENUM('self', 'parent', 'guardian', 'friend') NULL,
  payer_name VARCHAR(255) NULL,
  payer_phone VARCHAR(50) NULL,

  -- Security
  application_token VARCHAR(64) NULL,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT chk_age CHECK (age >= 18 AND age <= 30),
  CONSTRAINT uq_id_number UNIQUE (id_number),
  CONSTRAINT uq_application_token UNIQUE (application_token),
  CONSTRAINT fk_applicants_batch FOREIGN KEY (batch_id)
    REFERENCES batches(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  applicant_id INT NOT NULL,
  doc_type ENUM('id_copy', 'passport_photo', 'personal_accident_cover', 'signature') NOT NULL,
  file_path VARCHAR(255) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_documents_applicant FOREIGN KEY (applicant_id)
    REFERENCES applicants(id) ON DELETE CASCADE
);

-- NOTE: no Row Level Security in MySQL. All access control lives in
-- server/routes/*.js and server/middleware/auth.js. Never expose this
-- database directly to the internet.
