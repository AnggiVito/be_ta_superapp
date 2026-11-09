/**
 * Smoke test: RBAC enforcement on room routes
 * Run: node modules/room-management/scripts/smoke-test-rbac.js
 */
import axios from 'axios';
import { getTokenFromAuthGateway } from '../../../generate-token.js';

const BASE = 'http://localhost:3001/api/room-management';
const ROOM_ID = '131deb03-6c33-4505-9a73-630bc740c419';

async function test(label, promise) {
  try {
    const res = await promise;
    console.log(
      `✅ ${label}: ${res.status} ${res.data?.success ? 'OK' : res.data?.message || ''}`
    );
    return res;
  } catch (e) {
    const res = e.response;
    if (res) {
      console.log(
        `${res.status === 403 ? '🔒' : '❌'} ${label}: ${res.status} ${res.data?.message || ''}`
      );
    } else {
      console.log(`❌ ${label}: ${e.message}`);
    }
    return e.response;
  }
}

const m001Token = await getTokenFromAuthGateway('M001', 'dev123');
const kaurToken = await getTokenFromAuthGateway('KAUR001', 'dev123');

console.log('\n--- Testing M001 (dev account; backend may assign asisten_praktikum) ---');
await test(
  'GET  /rooms         ',
  axios.get(`${BASE}/rooms`, {
    headers: { Authorization: `Bearer ${m001Token}` },
  })
);
await test(
  'GET  /rooms/:id     ',
  axios.get(`${BASE}/rooms/${ROOM_ID}`, {
    headers: { Authorization: `Bearer ${m001Token}` },
  })
);
await test(
  'POST /rooms         ',
  axios.post(
    `${BASE}/rooms`,
    { name: 'Hack', capacity: 1 },
    { headers: { Authorization: `Bearer ${m001Token}` } }
  )
);
await test(
  'PUT  /rooms/:id     ',
  axios.put(
    `${BASE}/rooms/${ROOM_ID}`,
    { name: 'Hack' },
    { headers: { Authorization: `Bearer ${m001Token}` } }
  )
);
await test(
  'DELETE /rooms/:id   ',
  axios.delete(`${BASE}/rooms/${ROOM_ID}`, {
    headers: { Authorization: `Bearer ${m001Token}` },
  })
);

console.log('\n--- Testing KAUR001 (Kaur Lab) ---');
await test(
  'GET  /rooms         ',
  axios.get(`${BASE}/rooms`, {
    headers: { Authorization: `Bearer ${kaurToken}` },
  })
);
await test(
  'GET  /rooms/:id     ',
  axios.get(`${BASE}/rooms/${ROOM_ID}`, {
    headers: { Authorization: `Bearer ${kaurToken}` },
  })
);
await test(
  'PUT  /rooms/:id     ',
  axios.put(
    `${BASE}/rooms/${ROOM_ID}`,
    { name: 'Room 1', capacity: 50 },
    { headers: { Authorization: `Bearer ${kaurToken}` } }
  )
);
