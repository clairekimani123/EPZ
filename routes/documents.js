import { Router } from 'express';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws'; // ✅ Import ws
import sql from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    realtime: { transport: ws } // ✅ Force WebSocket transport
  }
);

// Change to memory storage, so we can get the file buffer
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.post('/:applicantId/documents', upload.single('file'), async (req, res) => {
  const { applicantId } = req.params;
  const { docType } = req.body;
  const file = req.file;

  if (!file) return res.status(400).json({ error: 'No file uploaded.' });

  // Generate a unique file path
  const fileExt = file.originalname.split('.').pop();
  const fileName = `${applicantId}-${docType}-${Date.now()}.${fileExt}`;
  const filePath = `PCLDocuments-docs/${fileName}`;

  // Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from('PCLDocuments-docs')
    .upload(filePath, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });

  if (uploadError) {
    console.error('Storage upload error:', uploadError);
    return res.status(500).json({ error: 'Failed to upload file.' });
  }

  // Save the storage path to the database (not a local path)
  await sql`
    INSERT INTO documents (applicant_id, doc_type, file_path, original_filename)
    VALUES (${applicantId}, ${docType}, ${filePath}, ${file.originalname})
  `;

  return res.status(201).json({ success: true });
});

// When downloading, generate a signed URL instead of reading from local disk
router.get('/:applicantId/documents/:documentId/download', requireAuth, async (req, res) => {
  const rows = await sql`
    SELECT file_path, original_filename FROM documents 
    WHERE id = ${req.params.documentId} AND applicant_id = ${req.params.applicantId}
  `;
  const doc = rows[0];
  if (!doc) return res.status(404).json({ error: 'Document not found.' });

  // Generate a signed URL valid for 60 seconds
  const { data, error } = await supabase.storage
    .from('PCLDocuments-docs')
    .createSignedUrl(doc.file_path, 60);

  if (error) return res.status(500).json({ error: 'Failed to generate download link.' });
  
  // Redirect directly to the signed URL
  return res.redirect(data.signedUrl);
});

export default router;