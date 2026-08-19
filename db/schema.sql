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

-- ----------------------------------------------------------------------------
-- NOTE — same as before: no row-level security in MySQL either. Access
-- control lives entirely in server/routes/applicants.js. Never expose this
-- database directly to the internet; only your Express server's connection
-- should ever reach it.
-- ----------------------------------------------------------------------------