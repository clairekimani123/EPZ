import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import applicantsRouter from './routes/applicants.js';
import documentsRouter from './routes/documents.js';
import authRouter from './routes/auth.js';
import companiesRouter from './routes/companies.js';
import batchesRouter from './routes/batches.js';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/applicants', applicantsRouter);
app.use('/api/applicants', documentsRouter);
app.use('/api/companies', companiesRouter);
app.use('/api/batches', batchesRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});