import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const JWT_SECRET = process.env.JWT_SECRET || 'OcFWkMQM7KF7k1Z8wxuiTS7B4QKcBQYOXltq9lu3H0gQk3fyC0DNP88a8DBUBGbN';

if (!JWT_SECRET) {
  console.error('JWT_SECRET not set in environment. Tests require JWT_SECRET to sign tokens.');
  process.exit(1);
}

function authHeader(payload = {}) {
  const token = jwt.sign(payload, JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
  return { Authorization: `Bearer ${token}` };
}

async function fetchJson(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch (e) { json = text; }
  return { status: res.status, body: json };
}

describe('Enrollment integration', async () => {
  let practicum = null;
  const testUserId = '00000000-0000-0000-0000-000000000001';

  it('setup practicum (lab->practicum)', async () => {
    const headers = { 'Content-Type': 'application/json', ...authHeader({ id: testUserId }) };

    // create study program
    let r = await fetchJson('/api/registration/study-programs', {
      method: 'POST', headers, body: JSON.stringify({ code: `SP-${Date.now()}`, name: 'Enroll SP' })
    });
    assert.equal(r.status, 201);
    const sp = r.body.data;

    // create laboratory
    r = await fetchJson('/api/registration/laboratories', {
      method: 'POST', headers, body: JSON.stringify({ study_program_id: sp.id, code: `LAB-${Date.now()}`, name: 'Enroll Lab' })
    });
    assert.equal(r.status, 201);
    const lab = r.body.data;

    // create practicum
    r = await fetchJson('/api/registration/practicums', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        laboratory_id: lab.id,
        code: `PR-${Date.now()}`,
        name: 'Enroll Practicum',
        periode: '2526-2',
      }),
    });
    assert.equal(r.status, 201);
    practicum = r.body.data;
    assert.ok(practicum.id);
  });

  it('should enroll current user to practicum and list then cancel', async () => {
    const headers = { 'Content-Type': 'application/json', ...authHeader({ id: testUserId }) };

    // Enroll via URL param
    let r = await fetchJson(`/api/registration/practicums/${practicum.id}/enroll`, {
      method: 'POST', headers
    });
    assert.equal(r.status, 201, `Enroll failed: ${JSON.stringify(r.body)}`);
    const enrollment = r.body.data;
    assert.ok(enrollment.id, 'Enrollment id missing');

    // List my enrollments
    r = await fetchJson('/api/registration/enrollments', { method: 'GET', headers });
    assert.equal(r.status, 200, `List enrollments failed: ${JSON.stringify(r.body)}`);
    const list = r.body.data;
    const found = list.find(e => e.id === enrollment.id);
    assert.ok(found, 'Enrollment not found in list');

    // Cancel enrollment
    r = await fetchJson(`/api/registration/enrollments/${enrollment.id}`, { method: 'DELETE', headers });
    assert.equal(r.status, 200, `Cancel enrollment failed: ${JSON.stringify(r.body)}`);
  });
});
