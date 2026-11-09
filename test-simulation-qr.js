#!/usr/bin/env node

/**
 * Test script for Simulation QR Scan endpoints
 */

import axios from 'axios';

const API_URL = 'http://localhost:3001';
const SIMULATION_ID = '50c079f7-ce1b-406e-abd8-643f66528121';

// Test user token (koordinator_praktikum role for generating QR)
// and asisten_praktikum_aktif for scanning
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmZDFhM2YyMS1mZWM4LTQzMTAtYmQ3YS01MjY2NWMyYWI2ZDAiLCJpYXQiOjE3MzAwMDAwMDB9.test';

async function testQRGeneration() {
  try {
    console.log('\n=== Testing QR Generation ===');
    console.log(`POST /api/v1/conducts/simulations/${SIMULATION_ID}/attendance-qr/generate`);
    
    const response = await axios.post(
      `${API_URL}/api/v1/conducts/simulations/${SIMULATION_ID}/attendance-qr/generate`,
      {},
      {
        headers: {
          'Authorization': `Bearer ${TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('✅ QR Generation successful!');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    return response.data?.data?.qrToken;
  } catch (error) {
    console.error('❌ QR Generation failed!');
    console.error('Error:', error.response?.data || error.message);
    throw error;
  }
}

async function testQRScan(qrToken) {
  try {
    console.log('\n=== Testing QR Scan ===');
    console.log(`POST /api/v1/conducts/simulations/${SIMULATION_ID}/attendance/scan`);
    console.log(`QR Token: ${qrToken}`);
    
    const response = await axios.post(
      `${API_URL}/api/v1/conducts/simulations/${SIMULATION_ID}/attendance/scan`,
      { qrToken },
      {
        headers: {
          'Authorization': `Bearer ${TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('✅ QR Scan successful!');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    return response.data?.data?.attendanceId;
  } catch (error) {
    console.error('❌ QR Scan failed!');
    console.error('Error:', error.response?.data || error.message);
    throw error;
  }
}

async function testDuplicateScan(qrToken) {
  try {
    console.log('\n=== Testing Duplicate Scan Prevention ===');
    console.log(`POST /api/v1/conducts/simulations/${SIMULATION_ID}/attendance/scan (again)`);
    
    const response = await axios.post(
      `${API_URL}/api/v1/conducts/simulations/${SIMULATION_ID}/attendance/scan`,
      { qrToken },
      {
        headers: {
          'Authorization': `Bearer ${TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('Response:', JSON.stringify(response.data, null, 2));
    if (response.data?.data?.alreadyScanned) {
      console.log('✅ Duplicate scan prevention working!');
    }
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

async function testInvalidQR() {
  try {
    console.log('\n=== Testing Invalid QR ===');
    console.log(`POST /api/v1/conducts/simulations/${SIMULATION_ID}/attendance/scan (invalid token)`);
    
    const response = await axios.post(
      `${API_URL}/api/v1/conducts/simulations/${SIMULATION_ID}/attendance/scan`,
      { qrToken: 'invalid-token-xyz' },
      {
        headers: {
          'Authorization': `Bearer ${TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('Response:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    if (error.response?.status === 404 || error.response?.status === 400) {
      console.log('✅ Invalid QR rejection working!');
      console.log('Status:', error.response?.status);
      console.log('Message:', error.response?.data?.message);
    } else {
      console.error('❌ Unexpected error:', error.response?.data || error.message);
    }
  }
}

async function main() {
  console.log('🧪 Simulation QR Scan API Test Suite');
  console.log(`API URL: ${API_URL}`);
  console.log(`Simulation ID: ${SIMULATION_ID}`);
  
  try {
    // Step 1: Generate QR
    const qrToken = await testQRGeneration();
    
    if (!qrToken) {
      console.log('⚠️  No QR token received, skipping scan tests');
      return;
    }
    
    // Step 2: Scan QR
    await testQRScan(qrToken);
    
    // Step 3: Test duplicate prevention
    await testDuplicateScan(qrToken);
    
    // Step 4: Test invalid QR
    await testInvalidQR();
    
    console.log('\n✅ All tests completed!');
  } catch (error) {
    console.log('\n❌ Test suite failed!');
    process.exit(1);
  }
}

main();
