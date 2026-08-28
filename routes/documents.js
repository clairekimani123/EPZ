import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

// --------------------------------------------------------------------------
// WHERE FILES ACTUALLY LIVE:
// We store uploaded files in server/uploads/ — a folder that is NEVER
// served publicly (see index.js: we do not app.use(express.static(...))
// on this folder, on purpose). The only way to get a file back out is
// through the GET /:documentId/download route below, which requires a
// valid login token. This is the difference between "private storage" and
// "public storage" in practice: it's not about where bytes sit on disk,
// it's about whether there's a public URL that serves them with no checks.
// --------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '..', 'uploads');

// Ensure the uploads folder exists the first time the server starts.
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const ALLOWED_DOC_TYPES = ['id_copy', 'passport_photo', 'personal_accident_cover'];

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    // Never trust the original filename from the browser - someone could
    // name a file "../../etc/passwd" to try to escape the folder. We
    // generate our own safe name instead: applicantId-docType-timestamp.ext
    const ext = path.extname(file.originalname);
    const safeName = `${req.params.applicantId}-${req.body.docType}-${Date.now()}${ext}`;
    cb(null, safeName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max per file
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowedMimes.includes(file.mimetype)) {
      return cb(new Error('Only JPG, PNG, or PDF files are allowed.'));
    }
    cb(null, true);
  },
});

const router = Router();

// POST /api/applicants/:applicantId/documents
// Public for now (an applicant uploads their own docs right after applying,
// no login required for them - they're not staff). docType comes from a
// dropdown in the React form, validated server-side against the allow-list.
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

// GET /api/applicants/:applicantId/documents  -> list what's been uploaded (staff only)
router.get('/:applicantId/documents', requireAuth, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT id, doc_type, original_filename, uploaded_at FROM documents WHERE applicant_id = ?`,
    [req.params.applicantId]
  );
  return res.json({ documents: rows });
});

// GET /api/applicants/:applicantId/documents/:documentId/download  -> staff only
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