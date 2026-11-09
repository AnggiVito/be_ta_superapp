import fs from 'fs';
import { config } from 'dotenv';
config();

// This script connects to the procurement_db using the config in config/databases.js
// It fetches submission id passed by env SUBMISSION_ID (default 41) and calls the pdfService
// to generate a PDF and writes it to ./tmp_proposal.pdf for inspection.

const submissionId = process.env.SUBMISSION_ID || '41';

import { procurementDb } from '../config/databases.js';
import pdfService from '../modules/procurement/services/pdfService.js';

async function run() {
  console.log('Using PROCUREMENT_DB_HOST', process.env.PROCUREMENT_DB_HOST, 'PORT', process.env.PROCUREMENT_DB_PORT);
  const client = await procurementDb.connect();
  try {
    const subRes = await client.query('SELECT * FROM procurement_submission WHERE id = $1', [submissionId]);
    if (!subRes.rows.length) {
      console.error('Submission not found:', submissionId);
      return process.exit(1);
    }
    const submission = subRes.rows[0];
  const itemsRes = await client.query('SELECT * FROM procurement_submission_items WHERE submission_id = $1 ORDER BY id', [submissionId]);
    const items = itemsRes.rows;

    console.log('Submission:', { id: submission.id, requester_name: submission.requester_name, requester_role: submission.requester_role });

    const pdf = await pdfService.renderSubmissionProposalPdf(submission, items);
    if (!pdf || !Buffer.isBuffer(pdf)) {
      console.error('pdfService returned non-buffer (fallback HTML?)');
      fs.writeFileSync('proposal_fallback.html', pdf && typeof pdf === 'string' ? pdf : String(pdf || ''));
      console.log('Wrote fallback HTML to proposal_fallback.html');
      return;
    }
    fs.writeFileSync('proposal_' + submissionId + '.pdf', pdf);
    console.log('Wrote proposal_' + submissionId + '.pdf, size=', pdf.length);
  } catch (err) {
    console.error('Error:', err && err.stack || err);
  } finally {
    client.release();
    await procurementDb.end();
  }
}

run();
