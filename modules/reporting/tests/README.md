# Reporting Module - Test Suite

Dokumentasi lengkap untuk test suite modul reporting (feedback sentiment analysis).

## 📋 Daftar Isi

- [Overview](#overview)
- [Test Coverage](#test-coverage)
- [Setup](#setup)
- [Running Tests](#running-tests)
- [Test Files](#test-files)
- [Test Cases](#test-cases)

## 🎯 Overview

Test suite ini mencakup semua endpoint di modul reporting dengan fokus pada:
- ✅ Validasi response struktur
- ✅ Authentication & authorization
- ✅ Query parameter filtering
- ✅ Error handling
- ✅ Data integrity (tidak ada prodi_id/praktikum_id)
- ✅ Business logic validation

## 📊 Test Coverage

### Endpoints yang Di-test

| Endpoint | Method | Test File | Test Cases |
|----------|--------|-----------|------------|
| `/api/reporting/health` | GET | `health.test.js` | 3 |
| `/api/reporting/feedback/upload` | POST | `upload.test.js` | 7 |
| `/api/reporting/feedback/summaries` | GET | `summaries.test.js` | 8 |
| `/api/reporting/feedback/summaries/:uploadId` | GET | `summaries.test.js` | 4 |
| `/api/reporting/feedback/statistics` | GET | `statistics.test.js` | 11 |
| `/api/reporting/feedback/items/:uploadId` | GET | `items.test.js` | 9 |
| `/api/reporting/feedback/uploads` | GET | `uploads.test.js` | 11 |
| `/api/reporting/feedback/uploads/:uploadId` | DELETE | `uploads.test.js` | 5 |

**Total Test Cases: 58+**

## 🛠️ Setup

### 1. Install Dependencies

```bash
npm install --save-dev jest supertest @jest/globals
```

### 2. Update package.json

```json
{
  "scripts": {
    "test": "node --experimental-vm-modules node_modules/jest/bin/jest.js",
    "test:watch": "node --experimental-vm-modules node_modules/jest/bin/jest.js --watch",
    "test:coverage": "node --experimental-vm-modules node_modules/jest/bin/jest.js --coverage"
  }
}
```

### 3. Verify Setup

```bash
npm test
```

## 🚀 Running Tests

### Run All Tests

```bash
npm test
```

### Run Specific Test File

```bash
npm test health.test.js
npm test upload.test.js
npm test summaries.test.js
npm test statistics.test.js
npm test items.test.js
npm test uploads.test.js
```

### Run with Coverage Report

```bash
npm run test:coverage
```

### Watch Mode (Development)

```bash
npm run test:watch
```

## 📁 Test Files

### `setup.test.js`
- Konfigurasi global untuk semua test
- Mock environment variables
- Mock Redis connection
- Timeout configuration

### `health.test.js`
**Test Cases:**
- ✅ Health check returns 200
- ✅ Response has correct structure
- ✅ No authentication required

### `upload.test.js`
**Test Cases:**
- ✅ Reject upload without authentication
- ✅ Reject upload without file
- ✅ Reject non-Excel files
- ✅ Accept valid Excel file with periode
- ✅ Accept upload without periode (optional)
- ✅ Reject files larger than 10MB
- ✅ Role validation (admin, kaur, koordinator_praktikum only)

### `summaries.test.js`
**Test Cases:**

**GET /summaries:**
- ✅ Return list of summaries
- ✅ Filter by periode
- ✅ Support limit parameter
- ✅ Combine periode and limit filters
- ✅ Require authentication
- ✅ Include overall_sentiment field
- ✅ NOT include prodi_id/praktikum_id

**GET /summaries/:uploadId:**
- ✅ Return summary for specific upload
- ✅ Return 404 for non-existent upload
- ✅ Require authentication
- ✅ Include all required fields

### `statistics.test.js`
**Test Cases:**
- ✅ Return aggregated statistics
- ✅ Include all required fields (total_feedback, total_uploads, percentages, average_score)
- ✅ NOT include by_praktikum breakdown
- ✅ NOT include prodi_id/praktikum_id fields
- ✅ Filter by periode
- ✅ Ignore prodi_id query parameter
- ✅ Ignore praktikum_id query parameter
- ✅ Require authentication
- ✅ Percentage values sum to ~100
- ✅ Sentiment score between -1.0 and 1.0
- ✅ Return faculty-wide data only

### `items.test.js`
**Test Cases:**
- ✅ Return feedback items for upload
- ✅ Filter by sentiment=positive
- ✅ Filter by sentiment=negative
- ✅ Filter by sentiment=neutral
- ✅ Require authentication
- ✅ Include all required fields
- ✅ Return 404 for non-existent upload
- ✅ Return count of items
- ✅ Reject invalid sentiment values

### `uploads.test.js`
**Test Cases:**

**GET /uploads:**
- ✅ Return list of uploads
- ✅ Filter by periode
- ✅ Filter by status (pending/processing/processed/failed)
- ✅ Support limit parameter
- ✅ Combine multiple filters
- ✅ Require authentication
- ✅ Include all required fields
- ✅ NOT include prodi_id/praktikum_id
- ✅ Return count of uploads

**DELETE /uploads/:uploadId:**
- ✅ Delete upload successfully
- ✅ Require authentication
- ✅ Return 404 for non-existent upload
- ✅ Role validation
- ✅ Perform soft delete

## ✅ Test Cases Detail

### Critical Validations

#### 1. No Prodi/Praktikum Fields
```javascript
// summaries.test.js
it('should NOT include prodi_id or praktikum_id in response', async () => {
  const response = await request(app)
    .get('/api/reporting/feedback/summaries')
    .set('Authorization', 'Bearer test-token')
    .expect(200);

  expect(response.body.data[0]).not.toHaveProperty('prodi_id');
  expect(response.body.data[0]).not.toHaveProperty('praktikum_id');
});
```

#### 2. Statistics - Faculty-Wide Only
```javascript
// statistics.test.js
it('should NOT include by_praktikum breakdown', async () => {
  const response = await request(app)
    .get('/api/reporting/feedback/statistics')
    .set('Authorization', 'Bearer test-token')
    .expect(200);

  expect(response.body.data).not.toHaveProperty('by_praktikum');
});
```

#### 3. Overall Sentiment Validation
```javascript
// summaries.test.js
it('should return summaries with overall_sentiment field', async () => {
  const response = await request(app)
    .get('/api/reporting/feedback/summaries')
    .set('Authorization', 'Bearer test-token')
    .expect(200);

  expect(response.body.data[0]).toHaveProperty('overall_sentiment');
  expect(['positive', 'negative', 'neutral']).toContain(
    response.body.data[0].overall_sentiment
  );
});
```

#### 4. Sentiment Score Range
```javascript
// statistics.test.js
it('should have sentiment score between -1.0 and 1.0', async () => {
  const data = response.body.data;
  expect(data.average_sentiment_score).toBeGreaterThanOrEqual(-1.0);
  expect(data.average_sentiment_score).toBeLessThanOrEqual(1.0);
});
```

## 📈 Coverage Goals

- **Statements:** > 80%
- **Branches:** > 75%
- **Functions:** > 80%
- **Lines:** > 80%

## 🐛 Debugging Tests

### Enable Debug Mode

```bash
DEBUG=* npm test
```

### Run Single Test

```bash
npm test -- -t "should return aggregated statistics"
```

### Skip Tests

```javascript
describe.skip('Skipped test suite', () => {
  // Tests here will be skipped
});

it.skip('should skip this test', () => {
  // This test will be skipped
});
```

## 📝 Writing New Tests

### Template

```javascript
import { describe, it, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import express from 'express';

describe('New Endpoint Tests', () => {
  let app;

  beforeAll(async () => {
    const reportingRoutes = (await import('../routes.js')).default;
    app = express();
    app.use(express.json());
    app.use('/api/reporting', reportingRoutes);
  });

  describe('GET /api/reporting/new-endpoint', () => {
    it('should do something', async () => {
      const response = await request(app)
        .get('/api/reporting/new-endpoint')
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
    });
  });
});
```

## 🎯 Best Practices

1. **Isolation**: Setiap test harus independen
2. **Mocking**: Mock external dependencies (database, Redis, JWT)
3. **Assertions**: Gunakan assertions yang spesifik
4. **Cleanup**: Cleanup resources di afterAll/afterEach
5. **Descriptive**: Nama test harus jelas dan deskriptif
6. **Coverage**: Aim for >80% code coverage

## 🔍 Common Issues

### Issue: Tests timeout
```bash
# Increase timeout in jest.config.json
{
  "testTimeout": 15000
}
```

### Issue: Module import errors
```bash
# Ensure using Node experimental VM modules
node --experimental-vm-modules node_modules/jest/bin/jest.js
```

### Issue: Mock not working
```javascript
// Use unstable_mockModule before importing
jest.unstable_mockModule('../service.js', () => ({
  myFunction: jest.fn()
}));
```

## 📚 Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)

## ✨ Summary

Test suite ini memastikan:
- ✅ Semua endpoint berfungsi dengan benar
- ✅ Tidak ada prodi_id/praktikum_id di response (faculty-wide scope)
- ✅ Overall sentiment feature working
- ✅ Authentication & authorization proper
- ✅ Query filtering works correctly
- ✅ Error handling comprehensive

**Last Updated:** November 15, 2025
