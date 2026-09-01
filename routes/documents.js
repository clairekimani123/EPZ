import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '..', 'uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const ALLOWED_DOC_TYPES = ['id_copy', 'passport_photo', 'personal_accident_cover', 'signature'];

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    const safeName = `${req.params.applicantId}-${req.body.docType}-${Date.now()}${ext}`;
    cb(null, safeName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowedMimes.includes(file.mimetype)) {
      return cb(new Error('Only JPG, PNG, or PDF files are allowed.'));
    }
    cb(null, true);
  },
});

const router = Router();

router.post('/:applicantId/documents', upload.single('file'), async (req, res) => {
  const { applicantId } = req.params;
  const { docType } = req.body;

  if (!ALLOWED_DOC_TYPES.includes(docType)) {
    return res.status(400).json({ error: `docType must be one of: ${ALLOWED_DOC_TYPES.join(', ')}` });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'No file was uploaded.' });
  }

  try {
    await pool.query(
      `INSERT INTO documents (applicant_id, doc_type, file_path, original_filename)
       VALUES (?, ?, ?, ?)`,
      [applicantId, docType, req.file.filename, req.file.originalname]
    );
    return res.status(201).json({ success: true });
  } catch (err) {
    console.error('Document save error:', err);
    return res.status(500).json({ error: 'Failed to save document record.' });
  }
});

router.get('/:applicantId/documents', requireAuth, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT id, doc_type, original_filename, uploaded_at FROM documents WHERE applicant_id = ?`,
    [req.params.applicantId]
  );
  return res.json({ documents: rows });
});

router.get('/:applicantId/documents/:documentId/download', requireAuth, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT file_path, original_filename FROM documents WHERE id = ? AND applicant_id = ?`,
    [req.params.documentId, req.params.applicantId]
  );
  const doc = rows[0];
  if (!doc) {
    return res.status(404).json({ error: 'Document not found.' });
  }
  const filePath = path.join(uploadsDir, doc.file_path);
  return res.download(filePath, doc.original_filename);
});

export default router;