import { describe, test, expect, beforeEach, jest } from '@jest/globals';

const mockRoomModel = {
  getAllRooms: jest.fn(),
  getRoomById: jest.fn(),
  createRoom: jest.fn(),
  updateRoom: jest.fn(),
  deleteRoom: jest.fn(),
  updateRoomOccupancy: jest.fn(),
};

jest.unstable_mockModule('../models/roomModel.js', () => mockRoomModel);

const roomService = await import('../services/roomService.js');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Room Service', () => {
  test('createRoom rejects empty name', async () => {
    await expect(roomService.createRoom({ name: '', capacity: 10 }))
      .rejects.toThrow('Room name is required');
  });

  test('createRoom rejects non-positive capacity', async () => {
    await expect(roomService.createRoom({ name: 'Room A', capacity: 0 }))
      .rejects.toThrow('Room capacity must be greater than 0');
  });

  test('createRoom returns created room', async () => {
    const created = { id: 'room-1', name: 'Room A', capacity: 10 };
    mockRoomModel.createRoom.mockResolvedValue(created);

    const result = await roomService.createRoom({ name: 'Room A', capacity: 10 });

    expect(result).toEqual(created);
    expect(mockRoomModel.createRoom).toHaveBeenCalledWith({
      name: 'Room A',
      capacity: 10,
    });
  });

  test('updateRoom rejects if room not found', async () => {
    mockRoomModel.getRoomById.mockResolvedValue(null);

    await expect(roomService.updateRoom('room-1', { name: 'New' }))
      .rejects.toThrow('Room not found');
  });

  test('updateRoom rejects empty name', async () => {
    mockRoomModel.getRoomById.mockResolvedValue({ id: 'room-1' });

    await expect(roomService.updateRoom('room-1', { name: '  ' }))
      .rejects.toThrow('Room name cannot be empty');
  });

  test('updateRoom rejects non-positive capacity', async () => {
    mockRoomModel.getRoomById.mockResolvedValue({ id: 'room-1' });

    await expect(roomService.updateRoom('room-1', { capacity: 0 }))
      .rejects.toThrow('Room capacity must be greater than 0');
  });

  test('updateRoom returns updated room', async () => {
    const updated = { id: 'room-1', name: 'Room B', capacity: 20 };
    mockRoomModel.getRoomById.mockResolvedValue({ id: 'room-1' });
    mockRoomModel.updateRoom.mockResolvedValue(updated);

    const result = await roomService.updateRoom('room-1', {
      name: 'Room B',
      capacity: 20,
    });

    expect(result).toEqual(updated);
    expect(mockRoomModel.updateRoom).toHaveBeenCalledWith('room-1', {
      name: 'Room B',
      capacity: 20,
    });
  });

  test('deleteRoom rejects if room not found', async () => {
    mockRoomModel.getRoomById.mockResolvedValue(null);

    await expect(roomService.deleteRoom('room-1'))
      .rejects.toThrow('Room not found');
  });

  test('deleteRoom rejects if delete fails', async () => {
    mockRoomModel.getRoomById.mockResolvedValue({ id: 'room-1' });
    mockRoomModel.deleteRoom.mockResolvedValue(false);

    await expect(roomService.deleteRoom('room-1'))
      .rejects.toThrow('Failed to delete room');
  });

  test('deleteRoom returns success payload', async () => {
    mockRoomModel.getRoomById.mockResolvedValue({ id: 'room-1' });
    mockRoomModel.deleteRoom.mockResolvedValue(true);

    const result = await roomService.deleteRoom('room-1');

    expect(result).toEqual({ deleted: true, message: 'Room deleted successfully' });
  });

  test('updateRoomOccupancy rejects if room not found', async () => {
    mockRoomModel.getRoomById.mockResolvedValue(null);

    await expect(roomService.updateRoomOccupancy('room-1', true))
      .rejects.toThrow('Room not found');
  });

  test('updateRoomOccupancy returns updated room', async () => {
    const updated = { id: 'room-1', is_occupied: true };
    mockRoomModel.getRoomById.mockResolvedValue({ id: 'room-1' });
    mockRoomModel.updateRoomOccupancy.mockResolvedValue(updated);

    const result = await roomService.updateRoomOccupancy('room-1', true);

    expect(result).toEqual(updated);
    expect(mockRoomModel.updateRoomOccupancy).toHaveBeenCalledWith('room-1', true);
  });
});
