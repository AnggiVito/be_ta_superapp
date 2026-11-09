# Quick Start - Testing Reporting Module

## 🚀 Setup & Run (5 Minutes)

### 1. Install Dependencies

```powershell
npm install
```

Ini akan install:
- `jest` - Test framework
- `supertest` - HTTP assertion library
- `@jest/globals` - Jest ES modules support

### 2. Run Tests

#### Run All Tests
```powershell
npm test
```

#### Run Only Reporting Module Tests
```powershell
npm run test:reporting
```

#### Run Specific Test File
```powershell
npm test health.test.js
npm test upload.test.js
npm test summaries.test.js
npm test statistics.test.js
npm test items.test.js
npm test uploads.test.js
```

#### Run with Coverage
```powershell
npm run test:coverage
```

#### Watch Mode (Auto-rerun on change)
```powershell
npm run test:watch
```

## 📊 Expected Output

### Successful Test Run
```
 PASS  modules/reporting/tests/health.test.js
  ✓ Health check returns 200 (25ms)
  ✓ Response has correct structure (12ms)
  ✓ No authentication required (10ms)

 PASS  modules/reporting/tests/statistics.test.js
  ✓ Return aggregated statistics (30ms)
  ✓ Include all required fields (18ms)
  ✓ NOT include by_praktikum breakdown (15ms)
  ✓ NOT include prodi_id/praktikum_id (12ms)
  ...

Test Suites: 6 passed, 6 total
Tests:       58 passed, 58 total
Snapshots:   0 total
Time:        3.456 s
```

### Coverage Report
```
--------------------------|---------|----------|---------|---------|
File                      | % Stmts | % Branch | % Funcs | % Lines |
--------------------------|---------|----------|---------|---------|
All files                 |   82.45 |    75.32 |   85.67 |   83.12 |
 controllers              |   85.23 |    78.45 |   88.34 |   86.78 |
  feedbackController.js   |   85.23 |    78.45 |   88.34 |   86.78 |
 services                 |   88.67 |    82.12 |   90.45 |   89.23 |
  feedbackService.js      |   88.67 |    82.12 |   90.45 |   89.23 |
 models                   |   75.34 |    68.90 |   78.23 |   76.45 |
  feedbackModel.js        |   75.34 |    68.90 |   78.23 |   76.45 |
--------------------------|---------|----------|---------|---------|
```

## 🎯 Test Breakdown

| Test File | Endpoint | Cases | Focus |
|-----------|----------|-------|-------|
| `health.test.js` | GET /health | 3 | Basic connectivity |
| `upload.test.js` | POST /upload | 7 | File validation, auth |
| `summaries.test.js` | GET /summaries | 12 | Filtering, overall_sentiment |
| `statistics.test.js` | GET /statistics | 11 | Faculty-wide, no prodi/praktikum |
| `items.test.js` | GET /items/:id | 9 | Sentiment filtering |
| `uploads.test.js` | GET/DELETE /uploads | 16 | CRUD operations |

**Total: 58+ test cases**

## ✅ Key Tests

### 1. No Prodi/Praktikum Fields ✨
```javascript
// Ensures faculty-wide scope
expect(data).not.toHaveProperty('prodi_id');
expect(data).not.toHaveProperty('praktikum_id');
```

### 2. Overall Sentiment Present ✨
```javascript
// Ensures overall sentiment feature works
expect(data).toHaveProperty('overall_sentiment');
expect(['positive', 'negative', 'neutral']).toContain(data.overall_sentiment);
```

### 3. Statistics - No Breakdown ✨
```javascript
// Ensures no by_praktikum array
expect(data).not.toHaveProperty('by_praktikum');
```

## 🐛 Troubleshooting

### Tests Failing?

**Issue: Module not found**
```powershell
# Clear cache and reinstall
Remove-Item -Recurse -Force node_modules
npm install
```

**Issue: Timeout errors**
```powershell
# Increase timeout (already set to 10s in jest.config.json)
# If still timing out, check your database connection
```

**Issue: Mock errors**
```powershell
# Make sure you're using Node 20+
node --version  # Should be v20.x.x or higher
```

## 📝 Development Workflow

### When Adding New Endpoint

1. **Write test first** (TDD approach)
2. **Run test** - Should fail
3. **Implement endpoint**
4. **Run test again** - Should pass
5. **Check coverage** - Should maintain >80%

### Example: Adding New Endpoint Test

```javascript
// modules/reporting/tests/new-endpoint.test.js
import { describe, it, expect } from '@jest/globals';
import request from 'supertest';

describe('New Endpoint', () => {
  it('should do something', async () => {
    const response = await request(app)
      .get('/api/reporting/new-endpoint')
      .set('Authorization', 'Bearer test-token')
      .expect(200);

    expect(response.body.success).toBe(true);
  });
});
```

## 🎓 Learning Resources

- **Jest Docs**: https://jestjs.io/docs/getting-started
- **Supertest**: https://github.com/visionmedia/supertest
- **Testing Best Practices**: https://github.com/goldbergyoni/javascript-testing-best-practices

## 💡 Tips

1. **Run tests before commit**: Always verify tests pass
2. **Keep tests isolated**: Each test should be independent
3. **Mock external dependencies**: Database, Redis, APIs
4. **Descriptive test names**: Use "should..." format
5. **Check coverage**: Aim for >80%

## 🔥 Quick Commands Cheat Sheet

```powershell
# Install
npm install

# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch

# Run specific test
npm test statistics.test.js

# Run tests matching pattern
npm test -- -t "statistics"

# Debug mode
DEBUG=* npm test
```

## 📞 Need Help?

1. Check `modules/reporting/tests/README.md` for detailed documentation
2. Review test files for examples
3. Check Jest documentation for advanced features

---

**Last Updated:** November 15, 2025
**Test Framework:** Jest 29.7.0
**Node Version:** 20+ LTS
