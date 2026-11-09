import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const JWT_SECRET = process.env.JWT_SECRET;

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

describe('Registration module CRUD (integration)', async () => {
  it('should create study program, lab, practicum, module and enforce delete-if-empty rules', async () => {
    const headers = { 'Content-Type': 'application/json', ...authHeader({ id: 'test-user-id' }) };

    // Create study program
    const spCode = `SP-${Date.now()}`;
    let r = await fetchJson('/api/registration/study-programs', {
      method: 'POST', headers, body: JSON.stringify({ code: spCode, name: 'Test Study Program' })
    });
    assert.equal(r.status, 201, `Create study program failed: ${JSON.stringify(r.body)}`);
    const sp = r.body.data;
    assert.ok(sp.id, 'Study program id missing');

    // Create laboratory under study program
    const labCode = `LAB-${Date.now()}`;
    r = await fetchJson('/api/registration/laboratories', {
      method: 'POST', headers, body: JSON.stringify({ study_program_id: sp.id, code: labCode, name: 'Test Lab' })
    });
    assert.equal(r.status, 201, `Create laboratory failed: ${JSON.stringify(r.body)}`);
    const lab = r.body.data;

    // Create practicum under laboratory
    const practCode = `PR-${Date.now()}`;
    r = await fetchJson('/api/registration/practicums', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        laboratory_id: lab.id,
        code: practCode,
        name: 'Test Practicum',
        periode: '2526-2',
      }),
    });
    assert.equal(r.status, 201, `Create practicum failed: ${JSON.stringify(r.body)}`);
    const pract = r.body.data;

    // Create module under practicum
    const modCode = `MOD-${Date.now()}`;
    r = await fetchJson(`/api/registration/practicums/${pract.id}/modules`, {
      method: 'POST', headers, body: JSON.stringify({ code: modCode, name: 'Test Module' })
    });
    assert.equal(r.status, 201, `Create module failed: ${JSON.stringify(r.body)}`);
    const mod = r.body.data;

    // Attempt to delete study program (should fail because lab exists)
    r = await fetchJson(`/api/registration/study-programs/${sp.id}`, { method: 'DELETE', headers });
    assert.equal(r.status, 400, `Study program deletion should be blocked when labs exist: ${JSON.stringify(r.body)}`);

    // Attempt to delete laboratory (should fail because practicum exists)
    r = await fetchJson(`/api/registration/laboratories/${lab.id}`, { method: 'DELETE', headers });
    assert.equal(r.status, 400, `Laboratory deletion should be blocked when practicums exist: ${JSON.stringify(r.body)}`);

    // Attempt to delete practicum (should fail because module exists)
    r = await fetchJson(`/api/registration/practicums/${pract.id}`, { method: 'DELETE', headers });
    assert.equal(r.status, 400, `Practicum deletion should be blocked when modules/enrollments exist: ${JSON.stringify(r.body)}`);

    // Delete module
    r = await fetchJson(`/api/registration/practicums/${pract.id}/modules/${mod.id}`, { method: 'DELETE', headers });
    assert.equal(r.status, 200, `Delete module failed: ${JSON.stringify(r.body)}`);

    // Now delete practicum
    r = await fetchJson(`/api/registration/practicums/${pract.id}`, { method: 'DELETE', headers });
    assert.equal(r.status, 200, `Delete practicum failed: ${JSON.stringify(r.body)}`);

    // Now delete laboratory
    r = await fetchJson(`/api/registration/laboratories/${lab.id}`, { method: 'DELETE', headers });
    assert.equal(r.status, 200, `Delete laboratory failed: ${JSON.stringify(r.body)}`);

    // Now delete study program
    r = await fetchJson(`/api/registration/study-programs/${sp.id}`, { method: 'DELETE', headers });
    assert.equal(r.status, 200, `Delete study program failed: ${JSON.stringify(r.body)}`);
  });
});
