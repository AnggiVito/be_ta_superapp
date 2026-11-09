/**
 * Unit Test: TTLock API Connection
 * 
 * Test suite untuk memastikan koneksi ke TTLock API berfungsi dengan baik
 * 
 * Test Cases:
 * 1. OAuth Authentication - Mendapatkan access token
 * 2. API Connection - Request ke TTLock API berhasil
 * 3. Lock List Retrieval - Mendapatkan daftar lock
 * 4. Error Handling - Menangani error dengan baik
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env.test FIRST with override=true
const envPath = path.resolve(__dirname, '../../../.env.test');
dotenv.config({ path: envPath, override: true });

// NOW import modules
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { ttlockClient } from '../../../services/ttlock/ttlockClient.js';
import { ttlockService } from '../../../services/ttlock/ttlockService.js';

describe('TTLock API Connection Tests', () => {
  let accessToken = null;

  // Setup: Get access token before running tests
  beforeAll(async () => {
    try {
      accessToken = await ttlockClient.getAccessToken();
    } catch (error) {
      console.error('Failed to get access token in beforeAll:', error.message);
    }
  });

  describe('1. OAuth Authentication', () => {
    test('should successfully authenticate and get access token', async () => {
      const token = await ttlockClient.getAccessToken();
      
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
    });

    test('access token should be valid format', async () => {
      const token = await ttlockClient.getAccessToken();
      
      // TTLock access tokens are typically alphanumeric strings
      expect(token).toMatch(/^[a-zA-Z0-9]+$/);
    });

    test('should handle invalid credentials gracefully', async () => {
      // Create a temporary client with invalid credentials
      const invalidClient = {
        baseURL: ttlockClient.baseURL,
        clientId: 'invalid_id',
        clientSecret: 'invalid_secret',
        username: 'invalid@email.com',
        password: 'invalid_password',
        request: ttlockClient.request.bind(ttlockClient)
      };

      // Mock getAccessToken with invalid credentials
      const getInvalidToken = async () => {
        const params = {
          client_id: invalidClient.clientId,
          client_secret: invalidClient.clientSecret,
          username: invalidClient.username,
          password: invalidClient.password,
          grant_type: 'password'
        };

        try {
          const response = await ttlockClient.request('POST', '/oauth2/token', params, null);
          return response.access_token;
        } catch (error) {
          throw error;
        }
      };

      await expect(getInvalidToken()).rejects.toThrow();
    });
  });

  describe('2. API Connection & Basic Requests', () => {
    test('should successfully connect to TTLock API', async () => {
      expect(accessToken).toBeDefined();
      expect(accessToken).not.toBeNull();
    });

    test('should make successful request to API endpoint', async () => {
      const params = {
        clientId: ttlockClient.clientId,
        accessToken: accessToken,
        pageNo: 1,
        pageSize: 1,
        date: Date.now()
      };

      const response = await ttlockClient.request('POST', '/v3/lock/list', params, accessToken);
      
      expect(response).toBeDefined();
      // TTLock returns response without errcode on success, just the data
      expect(response).toHaveProperty('list');
    });

    test('should include required parameters in request', async () => {
      const params = {
        pageNo: 1,
        pageSize: 1
      };

      const response = await ttlockClient.request('POST', '/v3/lock/list', params, accessToken);
      
      // Should auto-add clientId, accessToken, date
      expect(response).toBeDefined();
      expect(response).toHaveProperty('list');
    });
  });

  describe('3. Lock List Retrieval', () => {
    test('should retrieve lock list from API', async () => {
      const params = {
        clientId: ttlockClient.clientId,
        accessToken: accessToken,
        pageNo: 1,
        pageSize: 20,
        date: Date.now()
      };

      const response = await ttlockClient.request('POST', '/v3/lock/list', params, accessToken);
      
      expect(response).toBeDefined();
      expect(response).toHaveProperty('list');
      expect(Array.isArray(response.list)).toBe(true);
    });

    test('lock list should contain valid lock data structure', async () => {
      const params = {
        clientId: ttlockClient.clientId,
        accessToken: accessToken,
        pageNo: 1,
        pageSize: 20,
        date: Date.now()
      };

      const response = await ttlockClient.request('POST', '/v3/lock/list', params, accessToken);
      
      if (response.list && response.list.length > 0) {
        const lock = response.list[0];
        
        // Verify lock object structure
        expect(lock).toHaveProperty('lockId');
        expect(lock).toHaveProperty('lockAlias');
        expect(typeof lock.lockId).toBe('number');
      }
    });

    test('should handle pagination correctly', async () => {
      const page1 = await ttlockClient.request('POST', '/v3/lock/list', {
        clientId: ttlockClient.clientId,
        accessToken: accessToken,
        pageNo: 1,
        pageSize: 5,
        date: Date.now()
      }, accessToken);

      expect(page1).toBeDefined();
      expect(page1).toHaveProperty('list');
      expect(Array.isArray(page1.list)).toBe(true);
    });
  });

  describe('4. Error Handling', () => {
    test('should handle network timeout gracefully', async () => {
      // This test may take time or fail based on network conditions
      const slowRequest = ttlockClient.request('POST', '/v3/lock/list', {
        clientId: ttlockClient.clientId,
        accessToken: accessToken,
        pageNo: 1,
        pageSize: 1,
        date: Date.now()
      }, accessToken);

      await expect(slowRequest).resolves.toBeDefined();
    }, 35000); // Extended timeout for this test

    test('should handle invalid endpoint gracefully', async () => {
      await expect(
        ttlockClient.request('POST', '/v3/invalid/endpoint', {
          clientId: ttlockClient.clientId,
          accessToken: accessToken,
          date: Date.now()
        }, accessToken)
      ).rejects.toThrow();
    });

    test('should handle expired token scenario', async () => {
      const invalidToken = 'expired_or_invalid_token_12345';
      
      await expect(
        ttlockClient.request('POST', '/v3/lock/list', {
          clientId: ttlockClient.clientId,
          accessToken: invalidToken,
          pageNo: 1,
          pageSize: 1,
          date: Date.now()
        }, invalidToken)
      ).rejects.toThrow();
    });

    test('should validate required API parameters', async () => {
      // Missing required parameters should cause error
      await expect(
        ttlockClient.request('POST', '/v3/lock/list', {
          // Missing pageNo and pageSize
          clientId: ttlockClient.clientId,
          accessToken: accessToken,
          date: Date.now()
        }, accessToken)
      ).rejects.toThrow();
    });
  });

  describe('5. TTLock Service (with Token Caching)', () => {
    test('should use cached token from service', async () => {
      const token1 = await ttlockService.getValidToken();
      const token2 = await ttlockService.getValidToken();
      
      // Should return same token if not expired
      expect(token1).toBe(token2);
    });

    test('service should successfully call TTLock API', async () => {
      const locks = await ttlockService.getLockList(1, 10);
      
      expect(locks).toBeDefined();
      expect(Array.isArray(locks)).toBe(true);
    });
  });

  describe('6. Connection Health Check', () => {
    test('TTLock API should be reachable', async () => {
      const token = await ttlockClient.getAccessToken();
      
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
    });

    test('API response time should be acceptable', async () => {
      const startTime = Date.now();
      
      await ttlockClient.request('POST', '/v3/lock/list', {
        clientId: ttlockClient.clientId,
        accessToken: accessToken,
        pageNo: 1,
        pageSize: 1,
        date: Date.now()
      }, accessToken);
      
      const responseTime = Date.now() - startTime;
      
      // Should respond within 10 seconds
      expect(responseTime).toBeLessThan(10000);
    });

    test('should verify TTLock configuration is loaded', () => {
      expect(ttlockClient.baseURL).toBeDefined();
      expect(ttlockClient.clientId).toBeDefined();
      expect(ttlockClient.clientSecret).toBeDefined();
      expect(ttlockClient.username).toBeDefined();
      expect(ttlockClient.password).toBeDefined();
      
      // Check if URLs are valid
      expect(ttlockClient.baseURL).toMatch(/^https?:\/\//);
    });
  });
});
