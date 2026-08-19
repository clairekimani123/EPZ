-- ============================================================================
-- Run this ONCE against your existing database (applicants + documents
-- already exist there from Week 1/2). This only adds what's new for Week 3.
--
-- Run it the same way as before:
--   mysql -u root -p recruitment_db < server/db/migrations/002_add_companies_batches.sql
-- or paste its contents into a Workbench SQL tab and execute.
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
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_batches_company FOREIGN KEY (company_id)
    REFERENCES companies(id) ON DELETE CASCADE
);

ALTER TABLE applicants
  ADD COLUMN IF NOT EXISTS batch_id INT NULL,
  ADD CONSTRAINT fk_applicants_batch FOREIGN KEY (batch_id)
    REFERENCES batches(id) ON DELETE SET NULL;

-- Note: this migration is NOT safely re-runnable like schema.sql was -
-- running it a second time will error on the ADD CONSTRAINT line, because
-- MySQL doesn't support "ADD CONSTRAINT IF NOT EXISTS." That's expected and
-- fine - migrations are meant to run exactly once each, in order, which is
-- why this file is numbered (002) rather than just appended to schema.sql.
