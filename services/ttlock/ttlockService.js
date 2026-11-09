import { ttlockClient } from './ttlockClient.js';
import { logger } from '../../core/utils/logger.js';

/**
 * TTLOCK Service
 * Business logic untuk integrasi TTLOCK
 */
class TTLockService {
  constructor() {
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  clearCachedToken() {
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  /**
   * Get valid access token (with caching)
   */
  async getValidToken() {
    // Check if token is still valid (with 5 minute buffer)
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry - 300000) {
      return this.accessToken;
    }

    // Get new token
    const tokenData = await ttlockClient.getAccessTokenData();
    this.accessToken = tokenData.access_token;

    const expiresInSeconds = Number(tokenData.expires_in || 3600);
    this.tokenExpiry = Date.now() + (expiresInSeconds * 1000);

    return this.accessToken;
  }

  async withValidToken(operation) {
    const token = await this.getValidToken();

    try {
      return await operation(token);
    } catch (error) {
      if (Number(error.ttlockErrcode) !== 10003) {
        throw error;
      }

      logger.warn('TTLock access token rejected, refreshing token and retrying once');
      this.clearCachedToken();
      const refreshedToken = await this.getValidToken();
      return await operation(refreshedToken);
    }
  }

  /**
   * Create permanent passcode
   */
  async createPermanentPasscode(lockId, name) {
    return await this.withValidToken((token) =>
      ttlockClient.createPermanentPasscode(lockId, name, token)
    );
  }

  /**
   * Create one-time passcode (keyboardPwdType: 1)
   * Passcode hanya bisa digunakan 1 kali dalam periode validityHours
   */
  async createOnetimePasscode(lockId, name, validityHours = 6) {
    return await this.withValidToken((token) =>
      ttlockClient.createOnetimePasscode(lockId, name, validityHours, token)
    );
  }

  /**
   * Create temporary passcode
   */
  async createTemporaryPasscode(lockId, name, startDate, endDate, passcode = null) {
    return await this.withValidToken((token) =>
      ttlockClient.createTemporaryPasscode(lockId, name, startDate, endDate, passcode, token)
    );
  }

  /**
   * Create one-time passcode (DEPRECATED - use createOnetimePasscode instead)
   */
  async createOneTimePasscode(lockId, name, startDate, endDate, passcode = null) {
    return await this.withValidToken((token) =>
      ttlockClient.createOneTimePasscode(lockId, name, startDate, endDate, passcode, token)
    );
  }

  /**
   * Delete passcode
   */
  async deletePasscode(lockId, passcodeId) {
    return await this.withValidToken((token) =>
      ttlockClient.deletePasscode(lockId, passcodeId, token)
    );
  }

  /**
   * Get passcode list
   */
  async getPasscodeList(lockId, pageNo = 1, pageSize = 20) {
    return await this.withValidToken((token) =>
      ttlockClient.getPasscodeList(lockId, pageNo, pageSize, token)
    );
  }

  /**
   * Get lock list
   */
  async getLockList(pageNo = 1, pageSize = 20) {
    return await this.withValidToken(async (token) => {
      const response = await ttlockClient.request('POST', '/v3/lock/list', {
        pageNo: pageNo,
        pageSize: pageSize,
      }, token);
      return response.list || [];
    });
  }

  /**
   * Get gateway list for the authenticated TTLock account.
   */
  async getGatewayList(pageNo = 1, pageSize = 100) {
    return await this.withValidToken((token) =>
      ttlockClient.getGatewayList(token, pageNo, pageSize)
    );
  }

  /**
   * Get lock list for a specific TTLock gateway.
   */
  async getGatewayLockList(gatewayId) {
    return await this.withValidToken((token) =>
      ttlockClient.getGatewayLockList(gatewayId, token)
    );
  }

  /**
   * Get gateway list for a specific lock.
   */
  async getGatewayListByLock(lockId) {
    return await this.withValidToken((token) =>
      ttlockClient.getGatewayListByLock(lockId, token)
    );
  }

  /**
   * Get detailed information for a specific lock.
   */
  async getLockDetail(lockId) {
    return await this.withValidToken((token) =>
      ttlockClient.getLockDetail(lockId, token)
    );
  }

  /**
   * Modify passcode name
   */
  async modifyPasscodeName(lockId, passcodeId, newName) {
    return await this.withValidToken((token) =>
      ttlockClient.modifyPasscodeName(lockId, passcodeId, newName, token)
    );
  }

  /**
   * Create custom temporary passcode (Type 3 with user-defined 4-9 digit passcode)
   */
  async createCustomTemporaryPasscode(lockId, name, passcode, startDate, endDate) {
    return await this.withValidToken((token) =>
      ttlockClient.createCustomTemporaryPasscode(lockId, name, passcode, startDate, endDate, token)
    );
  }

  /**
   * Create custom permanent passcode (Type 2 with user-defined 4-9 digit passcode)
   */
  async createCustomPermanentPasscode(lockId, name, passcode) {
    return await this.withValidToken((token) =>
      ttlockClient.createCustomPermanentPasscode(lockId, name, passcode, token)
    );
  }

  // ==================== Fingerprint Methods ====================

  /**
   * Add fingerprint to lock
   * @param {number} lockId - Lock ID
   * @param {string} fingerprintNumber - Fingerprint code
   * @param {number} fingerprintType - 1=normal, 4=cyclic
   * @param {object} options - Optional: fingerprintName, startDate, endDate, cyclicConfig
   */
  async addFingerprint(lockId, fingerprintNumber, fingerprintType, options = {}) {
    return await this.withValidToken((token) =>
      ttlockClient.addFingerprint(lockId, fingerprintNumber, fingerprintType, token, options)
    );
  }

  /**
   * Get fingerprint list for a lock
   */
  async getFingerprintList(lockId, pageNo = 1, pageSize = 20) {
    return await this.withValidToken((token) =>
      ttlockClient.getFingerprintList(lockId, pageNo, pageSize, token)
    );
  }

  /**
   * Delete fingerprint from lock
   * @param {number} deleteType - 1=Bluetooth, 2=WiFi gateway (default), 3=NB-IoT
   */
  async deleteFingerprint(lockId, fingerprintId, deleteType = 2) {
    return await this.withValidToken((token) =>
      ttlockClient.deleteFingerprint(lockId, fingerprintId, token, deleteType)
    );
  }

  // ==================== IC Card Methods ====================

  /**
   * Get IC card list for a lock
   */
  async getICCardList(lockId, pageNo = 1, pageSize = 20) {
    return await this.withValidToken((token) =>
      ttlockClient.getICCardList(lockId, pageNo, pageSize, token)
    );
  }

  /**
   * Add IC card to a lock
   * @param {number} lockId - Lock ID
   * @param {string} cardNumber - Card number (reversed format for TTLock)
   * @param {object} options - Optional: cardName, startDate, endDate, addType
   */
  async addICCard(lockId, cardNumber, options = {}) {
    return await this.withValidToken((token) =>
      ttlockClient.addICCard(lockId, cardNumber, token, options)
    );
  }

  async changeICCardPeriod(lockId, cardId, options = {}) {
    return await this.withValidToken((token) =>
      ttlockClient.changeICCardPeriod(lockId, cardId, token, options)
    );
  }

  /**
   * Delete IC card from a lock
   * @param {number} deleteType - 1=Bluetooth, 2=WiFi gateway (default), 3=NB-IoT
   */
  async deleteICCard(lockId, cardId, deleteType = 2) {
    return await this.withValidToken((token) =>
      ttlockClient.deleteICCard(lockId, cardId, token, deleteType)
    );
  }

  // ==================== Lock Info Methods ====================

  /**
   * Query battery level of a lock
   * @param {number} lockId - TTLock lock ID
   * @returns {Promise<object>} { electricQuantity } - Battery percentage (0-100)
   */
  async queryElectricQuantity(lockId) {
    return await this.withValidToken((token) =>
      ttlockClient.queryElectricQuantity(lockId, token)
    );
  }
}

export const ttlockService = new TTLockService();


