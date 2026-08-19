import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import applicantsRouter from './routes/applicants.js';
import documentsRouter from './routes/documents.js';
import authRouter from './routes/auth.js';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/applicants', applicantsRouter);
app.use('/api/applicants', documentsRouter); // adds /:applicantId/documents routes

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Deliberately NO express.static('uploads') here - files only leave the
// server through the authenticated download route in documents.js.

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});