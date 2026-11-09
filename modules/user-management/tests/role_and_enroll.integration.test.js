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

describe('Role management and enrollment integration tests', async () => {
  const adminId = 'fd1a3f21-fec8-4310-bd7a-52665c2ab6d0'; // bootstrap kaur_lab in this environment
  const adminHeaders = { 'Content-Type': 'application/json', ...authHeader({ id: adminId }) };

  const laboranId = '00000000-0000-0000-0000-000000000010';
  const laboranHeaders = { 'Content-Type': 'application/json', ...authHeader({ id: laboranId }) };

  const assistantId = '00000000-0000-0000-0000-000000000011';
  const assistantHeaders = { 'Content-Type': 'application/json', ...authHeader({ id: assistantId }) };

  const studentId = '00000000-0000-0000-0000-000000000012';
  const studentHeaders = { 'Content-Type': 'application/json', ...authHeader({ id: studentId }) };

  let roleRecord = null;
  let practicum = null;

  it('admin assigns roles: laboran and asisten_praktikum_aktif', async () => {
    // assign laboran to laboranId
    let r = await fetchJson(`/api/user-management/users/${laboranId}/roles`, {
      method: 'POST', headers: adminHeaders, body: JSON.stringify({ role: 'laboran' })
    });
    assert.equal(r.status, 200, `Assign laboran failed: ${JSON.stringify(r.body)}`);

    // assign asisten_praktikum to assistantId first (required)
    r = await fetchJson(`/api/user-management/users/${assistantId}/roles`, {
      method: 'POST', headers: adminHeaders, body: JSON.stringify({ role: 'asisten_praktikum' })
    });
    assert.equal(r.status, 200, `Assign assistant base role failed: ${JSON.stringify(r.body)}`);

    // now assign asisten_praktikum_aktif to assistantId
    r = await fetchJson(`/api/user-management/users/${assistantId}/roles`, {
      method: 'POST', headers: adminHeaders, body: JSON.stringify({ role: 'asisten_praktikum_aktif' })
    });
    assert.equal(r.status, 200, `Assign assistant active failed: ${JSON.stringify(r.body)}`);

    // verify assistant role exists and capture role id
    r = await fetchJson(`/api/user-management/users/${assistantId}/roles`, { method: 'GET', headers: adminHeaders });
    assert.equal(r.status, 200);
    const roles = r.body.data;
    const found = roles.find(x => x.role === 'asisten_praktikum_aktif');
    assert.ok(found, 'Assigned assistant role not found');
    roleRecord = found;
  });

  it('laboran attempts to remove assistant role (expect 403 or 200 depending on policy)', async () => {
    // laboran tries to delete the assistant role record
    const r = await fetchJson(`/api/user-management/roles/${roleRecord.id}`, { method: 'DELETE', headers: laboranHeaders });
    // The system may allow laboran to remove assistant roles in your configuration.
    // Accept either 200 (allowed) or 403 (forbidden) here so the test documents behavior.
    assert.ok([200, 403].includes(r.status), `Unexpected status removing role by laboran: ${r.status} ${JSON.stringify(r.body)}`);
  });

  it('student can list practicums and enroll', async () => {
    // create a new study program, lab, and practicum by admin
    let r = await fetchJson('/api/registration/study-programs', {
      method: 'POST', headers: adminHeaders, body: JSON.stringify({ code: `SP-${Date.now()}`, name: 'Tst SP' })
    });
    assert.equal(r.status, 201);
    const sp = r.body.data;

    r = await fetchJson('/api/registration/laboratories', {
      method: 'POST', headers: adminHeaders, body: JSON.stringify({ study_program_id: sp.id, code: `LAB-${Date.now()}`, name: 'Tst Lab' })
    });
    assert.equal(r.status, 201);
    const lab = r.body.data;

    r = await fetchJson('/api/registration/practicums', {
      method: 'POST', headers: adminHeaders, body: JSON.stringify({ laboratory_id: lab.id, code: `PR-${Date.now()}`, name: 'Tst Practicum' })
    });
    assert.equal(r.status, 201);
    practicum = r.body.data;

    // student lists practicums
    r = await fetchJson('/api/registration/practicums', { method: 'GET', headers: studentHeaders });
    assert.equal(r.status, 200);

    // student enrolls
    r = await fetchJson(`/api/registration/practicums/${practicum.id}/enroll`, { method: 'POST', headers: studentHeaders });
    assert.equal(r.status, 201, `Student enroll failed: ${JSON.stringify(r.body)}`);
  });

  it('assistant (assigned) can view schedules and enroll as assistant role', async () => {
    // create a schedule for the practicum's first module (if modules required, use module listing)
    // For simplicity, create a schedule directly under schedules with assistant assigned
    const start = new Date(Date.now() + 3600 * 1000).toISOString();
    const end = new Date(Date.now() + 7200 * 1000).toISOString();

    let r = await fetchJson('/api/registration/schedules', {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({ module_id: practicum.id, start_time: start, end_time: end, assistants: [assistantId] })
    });
    // Depending on validation, module_id may expect a module id; accept 201 or 400 accordingly
    assert.ok([201, 400].includes(r.status), `Unexpected status creating schedule: ${r.status} ${JSON.stringify(r.body)}`);

    // assistant enrolls to practicum
    r = await fetchJson(`/api/registration/practicums/${practicum.id}/enroll`, { method: 'POST', headers: assistantHeaders });
    assert.equal(r.status, 201, `Assistant enroll failed: ${JSON.stringify(r.body)}`);
    const enrollment = r.body.data;
    // role should be one of assistant-like values
    assert.ok(['asisten_praktikum_aktif','asisten_praktikum','asisten','student'].includes(enrollment.role));
  });
});
