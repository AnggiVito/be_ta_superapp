import { describe, test, expect, beforeEach, jest } from '@jest/globals';

const mockRoomModel = {
  getRoomById: jest.fn(),
};

const mockCardModel = {
  getCardLogByRoomAndCardId: jest.fn(),
  getCardLogByCardId: jest.fn(),
  getLatestCreatedCardLogByRoomAndNumber: jest.fn(),
  isCardDeletedInRoom: jest.fn(),
  logCardDeletion: jest.fn(),
};

const mockTtlockService = {
  deleteICCard: jest.fn(),
};

jest.unstable_mockModule('../models/roomModel.js', () => mockRoomModel);
jest.unstable_mockModule('../models/cardModel.js', () => mockCardModel);
jest.unstable_mockModule('../../../services/ttlock/ttlockService.js', () => ({
  ttlockService: mockTtlockService,
}));

const { deleteCard } = await import('../services/cardService.js');

const ROOM_ID = 'room-1';
const CARD_ID = 153569282;

beforeEach(() => {
  jest.clearAllMocks();
  mockRoomModel.getRoomById.mockResolvedValue({
    id: ROOM_ID,
    door_lock_id: 'lock-1',
    name: 'Lab',
  });
  mockCardModel.getCardLogByRoomAndCardId.mockResolvedValue(null);
  mockCardModel.getCardLogByCardId.mockResolvedValue(null);
  mockCardModel.getLatestCreatedCardLogByRoomAndNumber.mockResolvedValue(null);
  mockCardModel.isCardDeletedInRoom.mockResolvedValue(false);
  mockCardModel.logCardDeletion.mockResolvedValue({ id: 'log-del-1' });
  mockTtlockService.deleteICCard.mockResolvedValue({ success: true });
});

describe('deleteCard without local card_log', () => {
  test('deletes from TTLock even when no card_logs row exists', async () => {
    const result = await deleteCard(ROOM_ID, CARD_ID, 'admin-1', 2, '926551455');

    expect(result.success).toBe(true);
    expect(mockTtlockService.deleteICCard).toHaveBeenCalledWith('lock-1', CARD_ID, 2);
    expect(mockCardModel.logCardDeletion).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId: ROOM_ID,
        cardId: CARD_ID,
        cardNumber: '926551455',
        metadata: expect.objectContaining({ deletedWithoutLocalLog: true }),
      })
    );
  });

  test('treats TTLock already-deleted card as success', async () => {
    const err = new Error('TTLock API Error (-1021): This IC Card does not exist.');
    err.ttlockErrcode = -1021;
    mockTtlockService.deleteICCard.mockRejectedValue(err);

    const result = await deleteCard(ROOM_ID, CARD_ID, 'admin-1', 2, '926551455');

    expect(result.success).toBe(true);
    expect(mockCardModel.logCardDeletion).toHaveBeenCalled();
  });
});
