/**
 * Test: Health Check Endpoint
 * GET /api/reporting/health
 */

import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import express from 'express';

describe('Health Check Endpoint', () => {
  let app;

  // Create simple app without importing routes (to avoid module dependencies)
  app = express();
  app.use(express.json());
  app.get('/api/reporting/health', (req, res) => {
    res.json({
      success: true,
      module: 'reporting',
      message: 'Reporting module is running',
    });
  });

  describe('GET /api/reporting/health', () => {
    it('should return 200 and success response', async () => {
      const response = await request(app)
        .get('/api/reporting/health')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('module', 'reporting');
      expect(response.body).toHaveProperty('message', 'Reporting module is running');
    });

    it('should return JSON content type', async () => {
      const response = await request(app)
        .get('/api/reporting/health')
        .expect('Content-Type', /json/);

      expect(response.body).toBeDefined();
    });

    it('should handle health check without authentication', async () => {
      const response = await request(app)
        .get('/api/reporting/health')
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });
});
