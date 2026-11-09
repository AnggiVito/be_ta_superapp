import { describe, test, expect, jest } from '@jest/globals';
import {
  validateCreateRoom,
  validateUpdateRoom,
  validateUuidParams,
} from '../middleware/roomValidator.js';

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('Room Validator', () => {
  test('validateCreateRoom passes with valid payload', () => {
    const req = { body: { name: 'Room A', capacity: 10 } };
    const res = mockRes();
    const next = jest.fn();

    validateCreateRoom(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.body.is_occupied).toBe(false);
  });

  test('validateCreateRoom rejects missing fields', () => {
    const req = { body: {} };
    const res = mockRes();
    const next = jest.fn();

    validateCreateRoom(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test('validateUpdateRoom rejects empty payload', () => {
    const req = { body: {} };
    const res = mockRes();
    const next = jest.fn();

    validateUpdateRoom(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test('validateUpdateRoom passes with at least one field', () => {
    const req = { body: { name: 'Room B' } };
    const res = mockRes();
    const next = jest.fn();

    validateUpdateRoom(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  test('validateUuidParams rejects invalid uuid', () => {
    const req = { params: { id: 'not-a-uuid' } };
    const res = mockRes();
    const next = jest.fn();

    validateUuidParams(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});
