#!/usr/bin/env node
import { loadEnvSafe } from '../core/utils/envLoader.js';
loadEnvSafe();

import * as controller from '../modules/procurement/controllers/submissionController.js';

async function run() {
  // Mock request with a user that has both mahasiswa and asisten_praktikum
  const req = {
    body: {
      study_program_id: null,
      lab_id: null,
      items: [
        { item_name: 'Test Item', specification: null, quantity: 1, unit_price: 1000 }
      ],
      purpose: 'Test submission from script',
      action: 'submit'
    },
    headers: {},
    user: {
      id: '09e8932d-10e9-4ce6-a050-a0d1b1f9ad2f',
      roles: ['mahasiswa','asisten_praktikum'],
      full_name: 'Mahasiswa Test'
    }
  };

  const res = {
    status(code) {
      this._status = code;
      return this;
    },
    json(obj) {
      console.log('RESPONSE STATUS:', this._status || 200);
      console.log('RESPONSE BODY:', JSON.stringify(obj, null, 2));
      return obj;
    }
  };

  try {
    await controller.createSubmission(req, res, (err) => {
      console.error('Controller error:', err);
    });
  } catch (e) {
    console.error('Script error:', e);
  }
}

run().then(() => process.exit(0)).catch(() => process.exit(1));
