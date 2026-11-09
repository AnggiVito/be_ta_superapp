import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import axios from 'axios';
import { getTokenFromAuthGateway } from '../../../generate-token.js';

const BASE = 'http://localhost:3001/api/room-management';

const m001 = { username: 'M001', password: 'dev123' };
const kaur001 = { username: 'KAUR001', password: 'dev123' };

let mahasiswaToken;
let kaurToken;
let testRoomId;

async function createRoom(token, name, capacity) {
  const res = await axios.post(
    `${BASE}/rooms`,
    { name, capacity },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data?.data;
}

async function deleteRoom(token, roomId) {
  await axios.delete(`${BASE}/rooms/${roomId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

describe('Room Management RBAC (Integration)', () => {
  beforeAll(async () => {
    mahasiswaToken = await getTokenFromAuthGateway(m001.username, m001.password);
    kaurToken = await getTokenFromAuthGateway(kaur001.username, kaur001.password);

    const room = await createRoom(kaurToken, 'RBAC Test Room', 10);
    testRoomId = room?.id;
    if (!testRoomId) {
      throw new Error('Failed to create test room');
    }
  }, 30000);

  afterAll(async () => {
    if (testRoomId) {
      try {
        await deleteRoom(kaurToken, testRoomId);
      } catch (_) {
        // ignore cleanup errors
      }
    }
  }, 30000);

  test('Mahasiswa can view rooms list', async () => {
    const res = await axios.get(`${BASE}/rooms`, {
      headers: { Authorization: `Bearer ${mahasiswaToken}` },
    });
    expect(res.status).toBe(200);
  });

  test('Mahasiswa can view room detail', async () => {
    const res = await axios.get(`${BASE}/rooms/${testRoomId}`, {
      headers: { Authorization: `Bearer ${mahasiswaToken}` },
    });
    expect(res.status).toBe(200);
  });

  test('Mahasiswa cannot create room', async () => {
    await expect(
      axios.post(
        `${BASE}/rooms`,
        { name: 'Forbidden', capacity: 1 },
        { headers: { Authorization: `Bearer ${mahasiswaToken}` } }
      )
    ).rejects.toMatchObject({
      response: { status: 403 },
    });
  });

  test('Mahasiswa cannot update room', async () => {
    await expect(
      axios.put(
        `${BASE}/rooms/${testRoomId}`,
        { name: 'Forbidden Update' },
        { headers: { Authorization: `Bearer ${mahasiswaToken}` } }
      )
    ).rejects.toMatchObject({
      response: { status: 403 },
    });
  });

  test('Mahasiswa cannot delete room', async () => {
    await expect(
      axios.delete(`${BASE}/rooms/${testRoomId}`, {
        headers: { Authorization: `Bearer ${mahasiswaToken}` },
      })
    ).rejects.toMatchObject({
      response: { status: 403 },
    });
  });

  test('Kaur can update room', async () => {
    const res = await axios.put(
      `${BASE}/rooms/${testRoomId}`,
      { name: 'RBAC Test Room Updated', capacity: 11 },
      { headers: { Authorization: `Bearer ${kaurToken}` } }
    );
    expect(res.status).toBe(200);
  });

  test('Mahasiswa cannot delete IC card', async () => {
    await expect(
      axios.delete(`${BASE}/rooms/${testRoomId}/cards/99999`, {
        headers: { Authorization: `Bearer ${mahasiswaToken}` },
      })
    ).rejects.toMatchObject({
      response: { status: 403 },
    });
  });
});
