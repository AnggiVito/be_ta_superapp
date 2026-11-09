# Run Tests - Reporting Module

Write-Host "================================" -ForegroundColor Cyan
Write-Host "  REPORTING MODULE TEST SUITE  " -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Check if node_modules exists
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies..." -ForegroundColor Yellow
    npm install
    Write-Host ""
}

# Check if Jest is installed
if (-not (Test-Path "node_modules/jest")) {
    Write-Host "Installing test dependencies..." -ForegroundColor Yellow
    npm install --save-dev jest supertest @jest/globals
    Write-Host ""
}

Write-Host "Running tests..." -ForegroundColor Green
Write-Host ""

# Run tests
node --experimental-vm-modules node_modules/jest/bin/jest.js modules/reporting/tests

Write-Host ""
Write-Host "================================" -ForegroundColor Cyan
Write-Host "Test run completed!" -ForegroundColor Cyan
Write-Host ""
Write-Host "To run with coverage:" -ForegroundColor Yellow
Write-Host "  npm run test:coverage" -ForegroundColor White
Write-Host ""
Write-Host "To run in watch mode:" -ForegroundColor Yellow
Write-Host "  npm run test:watch" -ForegroundColor White
Write-Host "================================" -ForegroundColor Cyan
