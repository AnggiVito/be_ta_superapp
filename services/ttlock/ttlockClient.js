import axios from 'axios';
import crypto from 'crypto';
import { ttlockConfig } from '../../config/ttlock.js';
import { logger } from '../../core/utils/logger.js';

/**
 * TTLOCK API Client
 * Terisolasi untuk integrasi dengan TTLOCK API
 */
class TTLockClient {
  constructor() {
    this.baseURL = ttlockConfig.apiUrl;
    this.clientId = ttlockConfig.clientId;
    this.clientSecret = ttlockConfig.clientSecret;
    this.username = ttlockConfig.username;
    this.password = ttlockConfig.password;
  }

  /**
   * Generate random 8-digit passcode for one-time passcode
   */
  generateRandomPasscode() {
    return Math.floor(10000000 + Math.random() * 90000000).toString();
  }

  /**
   * Generate random 8-digit passcode for permanent
   */
  generatePermanentPasscode() {
    return Math.floor(10000000 + Math.random() * 90000000).toString();
  }

  /**
   * Validate custom passcode (4-9 digits)
   * @param {string} passcode - Passcode to validate
   * @returns {boolean} True if valid
   */
  validateCustomPasscode(passcode) {
    // Must be string of 4-9 digits
    return /^\d{4,9}$/.test(passcode);
  }

  sanitizeParams(params) {
    const sanitized = { ...params };
    if (sanitized.accessToken) sanitized.accessToken = '[REDACTED]';
    if (sanitized.password) sanitized.password = '[REDACTED]';
    if (sanitized.clientSecret) sanitized.clientSecret = '[REDACTED]';
    if (sanitized.client_secret) sanitized.client_secret = '[REDACTED]';
    return sanitized;
  }

  /**
   * Make authenticated request to TTLOCK API
   */
  async request(method, endpoint, params = {}, accessToken = null) {
    try {
      // Prepare request parameters untuk TTLock API
      // Base parameters menggunakan camelCase sesuai TTLock API
      const requestParams = {
        clientId: this.clientId,
        accessToken: accessToken,
        date: Date.now(),
        ...params
      };

      // Debug: log actual parameters being sent
      logger.info('TTLock API Request:', {
        endpoint,
        method,
        params: this.sanitizeParams(requestParams)
      });

      const config = {
        method,
        url: `${this.baseURL}${endpoint}`,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 30000, // 30 seconds
      };

      // TTLock API menggunakan POST dengan form data
      if (method === 'POST') {
        config.data = new URLSearchParams(requestParams).toString();
      } else {
        config.params = requestParams;
      }

      const response = await axios(config);

      // Check TTLock API error codes
      if (response.data.errcode !== 0 && response.data.errcode !== undefined) {
        logger.error('TTLock API Error Response:', response.data);
        const ttlockError = new Error(`TTLock API Error (${response.data.errcode}): ${response.data.errmsg}`);
        ttlockError.ttlockErrcode = response.data.errcode;
        ttlockError.ttlockErrmsg = response.data.errmsg;
        ttlockError.ttlockResponse = response.data;
        throw ttlockError;
      }

      return response.data;
    } catch (error) {
      logger.error('TTLOCK API request error:', {
        endpoint,
        method,
        error: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data
      });
      throw error;
    }
  }

  /**
   * Get access token response from TTLOCK
   */
  async getAccessTokenData() {
    try {
      // Password must be MD5 encrypted
      const passwordMd5 = crypto.createHash('md5').update(this.password).digest('hex');
      
      const authData = new URLSearchParams({
        clientId: this.clientId,
        clientSecret: this.clientSecret,
        username: this.username,
        password: passwordMd5,
      });

      const response = await axios.post(
        `${this.baseURL}/oauth2/token`,
        authData.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 30000, // 30 seconds for authentication
        }
      );

      if (!response.data?.access_token) {
        logger.error('TTLock token response missing access_token:', response.data);
        throw new Error(
          `TTLock token response missing access_token: ${JSON.stringify(response.data)}`
        );
      }

      logger.info('TTLock authentication successful');
      return response.data;
    } catch (error) {
      logger.error('Failed to get TTLOCK access token:', error.response?.data || error.message);
      throw new Error('Failed to authenticate with TTLOCK API');
    }
  }

  /**
   * Get access token from TTLOCK.
   * Kept as a string-returning helper for existing scripts/tests.
   */
  async getAccessToken() {
    const tokenData = await this.getAccessTokenData();
    return tokenData.access_token;
  }

  /**
   * Create permanent passcode
   * Uses keyboardPwdType=2 for TRUE permanent passcode
   * NOTE: Passcode must be used at least once within 24 hours or it will be invalidated
   * After first use within 24 hours, passcode becomes permanent forever
   * 
   * @param {string} lockId - TTLock lock ID
   * @param {string} name - Passcode name
   * @param {string} accessToken - Access token
   * @returns {Promise<object>} Created passcode data
   */
  async createPermanentPasscode(lockId, name, accessToken) {
    try {
      // Permanent passcode must be 8 digits random
      const keyboardPwd = this.generatePermanentPasscode();

      // Based on TTLock API behavior:
      // Using keyboardPwdType=2 + addType=2 creates "Permanent Custom" passcode
      // This is fully functional permanent passcode, label "Custom" only indicates
      // it was created via API (not via mobile app which uses internal SDK)

      // TTLock API requires ALL parameters in camelCase (not snake_case)
      const params = {
        lockId: parseInt(lockId),
        keyboardPwd: keyboardPwd,
        keyboardPwdName: name,
        keyboardPwdType: 2, // 2 = Permanent type
        addType: 2 // 2 = gateway mode (required for syncing to lock)
        // NO startDate/endDate for permanent
      };

      logger.info('Creating permanent passcode (API method):', params);

      const response = await this.request('POST', '/v3/keyboardPwd/add', params, accessToken);

      logger.info('TTLock API response:', response);

      // Add passcode to response
      return {
        ...response,
        keyboardPwd: keyboardPwd,
        type: 'permanent',
        note: 'Permanent passcode created successfully. Must be used within 24 hours to activate.'
      };
    } catch (error) {
      logger.error('Failed to create permanent passcode:', {
        message: error.message,
        lockId,
        name
      });
      throw error;
    }
  }

  /**
   * Create one-time passcode (keyboardPwdType: 1)
   * Passcode hanya bisa digunakan 1 kali dalam periode validityHours (default 6 jam)
   * Format: 8 digit (sama seperti TTLock app)
   */
  async createOnetimePasscode(lockId, name, validityHours, accessToken) {
    try {
      // One-time passcode uses 8 digits (same as TTLock app)
      const keyboardPwd = this.generateRandomPasscode();

      // TTLock rounds timestamp DOWN to the nearest hour
      // Example: 10:32 becomes 10:00, 18:57 becomes 18:00
      const now = Date.now();
      const currentDate = new Date(now);

      // Round down to current hour (set minutes, seconds, ms to 0)
      currentDate.setMinutes(0);
      currentDate.setSeconds(0);
      currentDate.setMilliseconds(0);

      const startTime = currentDate.getTime();
      // IMPORTANT: One-time type does NOT use endDate!
      // The validity period (6 hours) is built into type 1 itself

      // keyboardPwdType=1 untuk one-time passcode
      // Passcode valid untuk 1x penggunaan dalam 6 jam dari startDate
      const params = {
        lockId: parseInt(lockId),
        keyboardPwd: keyboardPwd,
        keyboardPwdName: name,
        keyboardPwdType: 1, // 1 = One-time type
        startDate: startTime,
        // NO endDate for one-time! It's implicit (6 hours from start)
        addType: 2 // 2 = gateway mode
      };

      logger.info('Creating one-time passcode:', params);

      const response = await this.request('POST', '/v3/keyboardPwd/add', params, accessToken);

      logger.info('TTLock API response:', response);

      return {
        ...response,
        keyboardPwd: keyboardPwd,
        type: 'onetime',
        note: `One-time passcode created. Valid for single use within 6 hours from start time.`
      };
    } catch (error) {
      logger.error('Failed to create one-time passcode:', {
        message: error.message,
        lockId,
        name
      });
      throw error;
    }
  }

  /**
   * Create temporary passcode
   * @param {string} lockId - TTLock lock ID
   * @param {string} name - Passcode name
   * @param {number} startDate - Start timestamp (ms)
   * @param {number} endDate - End timestamp (ms)
   * @param {string} passcode - Optional passcode
   * @param {string} accessToken - Access token
   * @returns {Promise<object>} Created passcode data
   */
  async createTemporaryPasscode(lockId, name, startDate, endDate, passcode, accessToken) {
    try {
      // Temporary passcode uses 6 digits
      const keyboardPwd = passcode || Math.floor(100000 + Math.random() * 900000).toString();

      const params = {
        lockId: parseInt(lockId),
        keyboardPwd: keyboardPwd,
        keyboardPwdName: name,
        keyboardPwdType: 3, // 3 = Period/Temporary type
        startDate: startDate, // Milliseconds timestamp
        endDate: endDate, // Milliseconds timestamp
        addType: 2 // 2 = gateway mode
      };

      const response = await this.request('POST', '/v3/keyboardPwd/add', params, accessToken);

      // Add passcode to response since TTLock doesn't return it
      return {
        ...response,
        keyboardPwd: keyboardPwd
      };
    } catch (error) {
      logger.error('Failed to create temporary passcode:', error);
      throw error;
    }
  }

  /**
   * Create one-time passcode
   * @param {string} lockId - TTLock lock ID
   * @param {string} name - Passcode name
   * @param {number} startDate - Start timestamp (ms)
   * @param {number} endDate - End timestamp (ms)
   * @param {string} passcode - Optional passcode
   * @param {string} accessToken - Access token
   * @returns {Promise<object>} Created passcode data
   */
  async createOneTimePasscode(lockId, name, startDate, endDate, passcode, accessToken) {
    try {
      const keyboardPwd = passcode || this.generateRandomPasscode();

      const params = {
        lockId: parseInt(lockId),
        keyboardPwd: keyboardPwd,
        keyboardPwdName: name,
        addType: 2, // 2 = period (one-time - WORKING for this lock)
        startDate: startDate,
        endDate: endDate
      };

      const response = await this.request('POST', '/v3/keyboardPwd/add', params, accessToken);

      // Add passcode to response since TTLock doesn't return it
      return {
        ...response,
        keyboardPwd: keyboardPwd
      };
    } catch (error) {
      logger.error('Failed to create one-time passcode:', error);
      throw error;
    }
  }

  /**
   * Delete passcode
   * @param {string} lockId - TTLock lock ID
   * @param {number} passcodeId - Passcode ID to delete
   * @param {string} accessToken - Access token
   * @returns {Promise<object>} Deletion result
   */
  async deletePasscode(lockId, passcodeId, accessToken) {
    try {
      const params = {
        lockId: parseInt(lockId),
        keyboardPwdId: parseInt(passcodeId),
      };

      const response = await this.request('POST', '/v3/keyboardPwd/delete', params, accessToken);
      return response;
    } catch (error) {
      logger.error('Failed to delete passcode:', error);
      throw error;
    }
  }

  /**
   * Get passcode list
   * @param {string} lockId - TTLock lock ID
   * @param {number} pageNo - Page number
   * @param {number} pageSize - Page size
   * @param {string} accessToken - Access token
   * @returns {Promise<object>} Passcode list
   */
  async getPasscodeList(lockId, pageNo, pageSize, accessToken) {
    try {
      const params = {
        lockId: parseInt(lockId),
        pageNo: pageNo,
        pageSize: pageSize,
      };

      const response = await this.request('POST', '/v3/lock/listKeyboardPwd', params, accessToken);
      return response;
    } catch (error) {
      logger.error('Failed to get passcode list:', error);
      throw error;
    }
  }

  /**
   * Get the gateway list of an account.
   * @param {string} accessToken - Access token
   * @param {number} pageNo - Page number
   * @param {number} pageSize - Page size
   * @returns {Promise<object>} Gateway list payload
   */
  async getGatewayList(accessToken, pageNo = 1, pageSize = 100) {
    try {
      const params = {
        pageNo: pageNo,
        pageSize: pageSize,
      };

      return await this.request('POST', '/v3/gateway/list', params, accessToken);
    } catch (error) {
      logger.error('Failed to get gateway list:', {
        message: error.message,
        pageNo,
        pageSize,
      });
      throw error;
    }
  }

  /**
   * Get the lock list of a gateway.
   * @param {number} gatewayId - TTLock gateway ID
   * @param {string} accessToken - Access token
   * @returns {Promise<object>} Gateway lock list payload
   */
  async getGatewayLockList(gatewayId, accessToken) {
    try {
      const params = {
        gatewayId: parseInt(gatewayId),
      };

      return await this.request('POST', '/v3/gateway/listLock', params, accessToken);
    } catch (error) {
      logger.error('Failed to get gateway lock list:', {
        message: error.message,
        gatewayId,
      });
      throw error;
    }
  }

  /**
   * Get the gateway list of a lock.
   * @param {number} lockId - TTLock lock ID
   * @param {string} accessToken - Access token
   * @returns {Promise<object>} Lock gateway list payload
   */
  async getGatewayListByLock(lockId, accessToken) {
    try {
      const params = {
        lockId: parseInt(lockId),
      };

      return await this.request('POST', '/v3/gateway/listByLock', params, accessToken);
    } catch (error) {
      logger.error('Failed to get gateway list by lock:', {
        message: error.message,
        lockId,
      });
      throw error;
    }
  }

  /**
   * Get lock detail.
   * @param {number} lockId - TTLock lock ID
   * @param {string} accessToken - Access token
   * @returns {Promise<object>} Lock detail payload
   */
  async getLockDetail(lockId, accessToken) {
    try {
      const params = {
        lockId: parseInt(lockId),
      };

      return await this.request('POST', '/v3/lock/detail', params, accessToken);
    } catch (error) {
      logger.error('Failed to get lock detail:', {
        message: error.message,
        lockId,
      });
      throw error;
    }
  }

  /**
   * Modify passcode name
   * @param {string} lockId - TTLock lock ID
   * @param {number} passcodeId - Passcode ID
   * @param {string} newName - New passcode name
   * @param {string} accessToken - Access token
   * @returns {Promise<object>} Update result
   */
  async modifyPasscodeName(lockId, passcodeId, newName, accessToken) {
    try {
      const params = {
        lockId: parseInt(lockId),
        keyboardPwdId: parseInt(passcodeId),
        keyboardPwdName: newName,
      };

      const response = await this.request('POST', '/v3/keyboardPwd/modify', params, accessToken);
      return response;
    } catch (error) {
      logger.error('Failed to modify passcode name:', error);
      throw error;
    }
  }

  /**
   * Create custom temporary passcode (Type 3 with custom 4-9 digit passcode)
   * Same as temporary but allows custom passcode input
   * 
   * @param {string} lockId - TTLock lock ID
   * @param {string} name - Passcode name
   * @param {string} passcode - Custom passcode (4-9 digits)
   * @param {number} startDate - Start timestamp (ms)
   * @param {number} endDate - End timestamp (ms)
   * @param {string} accessToken - Access token
   * @returns {Promise<object>} Created passcode data
   */
  async createCustomTemporaryPasscode(lockId, name, passcode, startDate, endDate, accessToken) {
    try {
      // Validate custom passcode
      if (!this.validateCustomPasscode(passcode)) {
        throw new Error('Invalid passcode. Must be 4-9 digits.');
      }

      const params = {
        lockId: parseInt(lockId),
        keyboardPwd: passcode,
        keyboardPwdName: name,
        keyboardPwdType: 3, // 3 = Period/Temporary type
        startDate: startDate, // Milliseconds timestamp
        endDate: endDate, // Milliseconds timestamp
        addType: 2 // 2 = gateway mode
      };

      logger.info('Creating custom temporary passcode:', params);
      logger.info('Custom temporary passcode timestamps:', {
        startDate: params.startDate,
        endDate: params.endDate,
      });

      const response = await this.request('POST', '/v3/keyboardPwd/add', params, accessToken);

      logger.info('TTLock API response:', response);

      return {
        ...response,
        keyboardPwd: passcode,
        type: 'custom-temporary',
        note: 'Custom temporary passcode created. Valid during specified time period.'
      };
    } catch (error) {
      logger.error('Failed to create custom temporary passcode:', {
        message: error.message,
        lockId,
        name
      });
      throw error;
    }
  }

  /**
   * Create custom permanent passcode (Type 2 with custom 4-9 digit passcode)
   * Same as permanent but allows custom passcode input
   * 
   * @param {string} lockId - TTLock lock ID
   * @param {string} name - Passcode name
   * @param {string} passcode - Custom passcode (4-9 digits)
   * @param {string} accessToken - Access token
   * @returns {Promise<object>} Created passcode data
   */
  async createCustomPermanentPasscode(lockId, name, passcode, accessToken) {
    try {
      // Validate custom passcode
      if (!this.validateCustomPasscode(passcode)) {
        throw new Error('Invalid passcode. Must be 4-9 digits.');
      }

      const params = {
        lockId: parseInt(lockId),
        keyboardPwd: passcode,
        keyboardPwdName: name,
        keyboardPwdType: 2, // 2 = Permanent type
        addType: 2 // 2 = gateway mode
        // NO startDate/endDate for permanent
      };

      logger.info('Creating custom permanent passcode:', params);

      const response = await this.request('POST', '/v3/keyboardPwd/add', params, accessToken);

      logger.info('TTLock API response:', response);

      return {
        ...response,
        keyboardPwd: passcode,
        type: 'custom-permanent',
        note: 'Custom permanent passcode created. Must be used within 24 hours to activate, then permanent forever.'
      };
    } catch (error) {
      logger.error('Failed to create custom permanent passcode:', {
        message: error.message,
        lockId,
        name
      });
      throw error;
    }
  }

  // ==================== Fingerprint Methods ====================

  /**
   * Add fingerprint
   * Call this API after a fingerprint has been added to the lock
   * 
   * @param {number} lockId - TTLock lock ID
   * @param {string} fingerprintNumber - Fingerprint code (required)
   * @param {number} fingerprintType - 1=normal, 4=cyclic (required)
   * @param {string} accessToken - Access token
   * @param {object} options - Optional params: fingerprintName, startDate, endDate, cyclicConfig
   * @returns {Promise<object>} { fingerprintId }
   */
  async addFingerprint(lockId, fingerprintNumber, fingerprintType, accessToken, options = {}) {
    try {
      const params = {
        lockId: parseInt(lockId),
        fingerprintNumber: fingerprintNumber,
        fingerprintType: parseInt(fingerprintType),
      };

      // Optional parameters
      if (options.fingerprintName) {
        params.fingerprintName = options.fingerprintName;
      }
      if (options.startDate) {
        params.startDate = options.startDate;
      }
      if (options.endDate) {
        params.endDate = options.endDate;
      }
      if (options.cyclicConfig) {
        params.cyclicConfig = JSON.stringify(options.cyclicConfig);
      }

      logger.info('Adding fingerprint:', params);

      const response = await this.request('POST', '/v3/fingerprint/add', params, accessToken);

      logger.info('TTLock Add Fingerprint response:', response);

      return response;
    } catch (error) {
      logger.error('Failed to add fingerprint:', {
        message: error.message,
        lockId,
        fingerprintNumber,
      });
      throw error;
    }
  }

  /**
   * Get fingerprint list for a lock
   * 
   * @param {number} lockId - TTLock lock ID
   * @param {number} pageNo - Page number (start from 1)
   * @param {number} pageSize - Items per page (default 20, max 100)
   * @param {string} accessToken - Access token
   * @returns {Promise<object>} { list } containing fingerprint records
   */
  async getFingerprintList(lockId, pageNo, pageSize, accessToken) {
    try {
      const params = {
        lockId: parseInt(lockId),
        pageNo: pageNo,
        pageSize: pageSize,
      };

      const response = await this.request('POST', '/v3/fingerprint/list', params, accessToken);

      return response;
    } catch (error) {
      logger.error('Failed to get fingerprint list:', {
        message: error.message,
        lockId,
      });
      throw error;
    }
  }

  /**
   * Delete fingerprint
   * Call this API after a fingerprint has been deleted from the lock
   * 
   * @param {number} lockId - TTLock lock ID
   * @param {number} fingerprintId - Fingerprint ID
   * @param {string} accessToken - Access token
   * @param {number} deleteType - 1=Bluetooth, 2=WiFi gateway (default), 3=NB-IoT
   * @returns {Promise<object>} { errcode, errmsg }
   */
  async deleteFingerprint(lockId, fingerprintId, accessToken, deleteType = 2) {
    try {
      const params = {
        lockId: parseInt(lockId),
        fingerprintId: parseInt(fingerprintId),
        deleteType: deleteType,
      };

      const response = await this.request('POST', '/v3/fingerprint/delete', params, accessToken);

      return response;
    } catch (error) {
      logger.error('Failed to delete fingerprint:', {
        message: error.message,
        lockId,
        fingerprintId,
      });
      throw error;
    }
  }
  // ==================== IC Card Methods ====================

  /**
   * Get IC card list for a lock
   * 
   * @param {number} lockId - TTLock lock ID
   * @param {number} pageNo - Page number (start from 1)
   * @param {number} pageSize - Items per page (default 20, max 100)
   * @param {string} accessToken - Access token
   * @returns {Promise<object>} { list } containing IC card records
   */
  async getICCardList(lockId, pageNo, pageSize, accessToken) {
    try {
      const params = {
        lockId: parseInt(lockId),
        pageNo: pageNo,
        pageSize: pageSize,
      };

      const response = await this.request('POST', '/v3/identityCard/list', params, accessToken);

      return response;
    } catch (error) {
      logger.error('Failed to get IC card list:', {
        message: error.message,
        lockId,
      });
      throw error;
    }
  }

  /**
   * Add IC card to a lock
   * Uses addForReversedCardNumber endpoint
   * 
   * @param {number} lockId - TTLock lock ID
   * @param {string} cardNumber - IC card number (reversed format)
   * @param {string} accessToken - Access token
   * @param {object} options - Optional: cardName, startDate, endDate, addType
   * @returns {Promise<object>} { cardId }
   */
  async addICCard(lockId, cardNumber, accessToken, options = {}) {
    try {
      const params = {
        lockId: parseInt(lockId),
        cardNumber: cardNumber,
        addType: options.addType || 2, // Default: WiFi gateway
      };

      if (options.cardName) params.cardName = options.cardName;
      if (options.startDate) params.startDate = options.startDate;
      if (options.endDate) params.endDate = options.endDate;

      const response = await this.request('POST', '/v3/identityCard/addForReversedCardNumber', params, accessToken);

      return response;
    } catch (error) {
      logger.error('Failed to add IC card:', {
        message: error.message,
        lockId,
        cardNumber,
      });
      throw error;
    }
  }

  /**
   * Change validity period of an IC card on a lock
   */
  async changeICCardPeriod(lockId, cardId, accessToken, options = {}) {
    try {
      const params = {
        lockId: parseInt(lockId),
        cardId: parseInt(cardId),
        changeType: options.changeType || 2,
      };
      if (options.startDate != null) params.startDate = options.startDate;
      if (options.endDate != null) params.endDate = options.endDate;

      return await this.request('POST', '/v3/identityCard/changePeriod', params, accessToken);
    } catch (error) {
      logger.error('Failed to change IC card period:', {
        message: error.message,
        lockId,
        cardId,
      });
      throw error;
    }
  }

  /**
   * Delete IC card from a lock
   * 
   * @param {number} lockId - TTLock lock ID
   * @param {number} cardId - IC card ID
   * @param {string} accessToken - Access token
   * @param {number} deleteType - 1=Bluetooth, 2=WiFi gateway (default), 3=NB-IoT
   * @returns {Promise<object>} { errcode, errmsg }
   */
  async deleteICCard(lockId, cardId, accessToken, deleteType = 2) {
    try {
      const params = {
        lockId: parseInt(lockId),
        cardId: parseInt(cardId),
        deleteType: deleteType,
      };

      const response = await this.request('POST', '/v3/identityCard/delete', params, accessToken);

      return response;
    } catch (error) {
      logger.error('Failed to delete IC card:', {
        message: error.message,
        lockId,
        cardId,
      });
      throw error;
    }
  }

  // ==================== Lock Info Methods ====================

  /**
   * Query the electric quantity (battery level) of a lock
   * 
   * @param {number} lockId - TTLock lock ID
   * @param {string} accessToken - Access token
   * @returns {Promise<object>} { electricQuantity } - Battery percentage (0-100)
   */
  async queryElectricQuantity(lockId, accessToken) {
    try {
      const params = {
        lockId: parseInt(lockId),
      };

      const result = await this.request(
        'POST',
        '/v3/lock/queryElectricQuantity',
        params,
        accessToken
      );

      return result;
    } catch (error) {
      logger.error('Failed to query electric quantity:', {
        message: error.message,
        lockId,
      });
      throw error;
    }
  }
}

export const ttlockClient = new TTLockClient();

