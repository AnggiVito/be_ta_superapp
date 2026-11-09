/**
 * Test Script untuk cek koneksi ke:
 * 1. AUTH Gateway
 * 2. TTLock API
 * 3. Database
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// IMPORTANT: Load .env.local FIRST (for host machine testing)
// This must be done BEFORE importing any modules that use process.env
dotenv.config({ path: join(__dirname, '../../../.env.local') });
dotenv.config({ path: join(__dirname, '../../../.env') });

// Now import modules that depend on environment variables
import axios from 'axios';
import { ttlockService } from '../../../services/ttlock/ttlockService.js';
import { ttlockClient } from '../../../services/ttlock/ttlockClient.js';
import { roomManagementDb } from '../../../config/databases.js';

console.log('🔍 Testing Connections...\n');
console.log('=' .repeat(60));

// Test 1: Database Connection
async function testDatabase() {
  console.log('\n📊 1. Testing Database Connection...');
  try {
    const result = await roomManagementDb.query('SELECT NOW() as current_time, current_database() as database');
    console.log('✅ Database Connected!');
    console.log(`   Database: ${result.rows[0].database}`);
    console.log(`   Server Time: ${result.rows[0].current_time}`);
    
    // Check tables
    const tables = await roomManagementDb.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.log(`   Tables: ${tables.rows.map(r => r.table_name).join(', ')}`);
    return true;
  } catch (error) {
    console.error('❌ Database Connection Failed!');
    console.error(`   Error: ${error.message}`);
    return false;
  }
}

// Test 2: AUTH Gateway Connection
async function testAuthGateway() {
  console.log('\n🔐 2. Testing AUTH Gateway Connection...');
  const authUrl = process.env.AUTH_GATEWAY_URL;
  
  if (!authUrl) {
    console.error('❌ AUTH_GATEWAY_URL not configured in .env');
    return false;
  }

  console.log(`   Gateway URL: ${authUrl}`);
  
  try {
    // Test basic connectivity (health check or base URL)
    const response = await axios.get(authUrl, {
      timeout: 5000,
      validateStatus: () => true // Accept any status
    });
    
    console.log(`✅ AUTH Gateway Reachable!`);
    console.log(`   Status: ${response.status}`);
    console.log(`   Response: ${response.statusText}`);
    
    // Try to get more info if available
    if (response.data) {
      console.log(`   Data: ${JSON.stringify(response.data).substring(0, 100)}...`);
    }
    
    return true;
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.error('❌ AUTH Gateway Connection Refused!');
      console.error(`   Cannot connect to: ${authUrl}`);
      console.error('   Is the gateway running?');
    } else if (error.code === 'ETIMEDOUT') {
      console.error('❌ AUTH Gateway Timeout!');
      console.error('   Gateway is not responding');
    } else {
      console.error('❌ AUTH Gateway Error!');
      console.error(`   Error: ${error.message}`);
    }
    return false;
  }
}

// Test 3: TTLock API Connection
async function testTTLockAPI() {
  console.log('\n🔑 3. Testing TTLock API Connection...');
  
  const clientId = process.env.TTLOCK_CLIENT_ID;
  const clientSecret = process.env.TTLOCK_CLIENT_SECRET;
  const baseUrl = process.env.TTLOCK_API_URL || process.env.TTLOCK_BASE_URL;
  
  if (!clientId || !clientSecret) {
    console.error('❌ TTLock credentials not configured!');
    console.error('   Missing: TTLOCK_CLIENT_ID or TTLOCK_CLIENT_SECRET');
    return false;
  }
  
  console.log(`   Client ID: ${clientId}`);
  console.log(`   Base URL: ${baseUrl}`);
  
  try {
    // Test 3a: Get Access Token
    console.log('\n   📌 Step 1: Getting Access Token...');
    const token = await ttlockClient.getAccessToken();
    
    if (token) {
      console.log('   ✅ Access Token Retrieved!');
      console.log(`   Token (first 20 chars): ${token.substring(0, 20)}...`);
    } else {
      console.error('   ❌ No token returned!');
      return false;
    }
    
    // Test 3b: Get Lock List (if available)
    console.log('\n   📌 Step 2: Testing API with Lock List...');
    try {
      const params = {
        clientId: clientId,
        accessToken: token,
        pageNo: 1,
        pageSize: 10,
        date: Date.now()
      };
      
      const response = await ttlockClient.request('POST', '/v3/lock/list', params);
      
      if (response.errcode === 0) {
        console.log('   ✅ TTLock API Working!');
        console.log(`   Lock Count: ${response.total || 0}`);
        
        if (response.list && response.list.length > 0) {
          console.log('\n   📋 Available Locks:');
          response.list.forEach((lock, index) => {
            console.log(`      ${index + 1}. Lock ID: ${lock.lockId}`);
            console.log(`         Name: ${lock.lockAlias || 'N/A'}`);
            console.log(`         Status: ${lock.electricQuantity}% battery`);
          });
        } else {
          console.log('   ℹ️  No locks found in your account');
        }
      } else {
        console.log(`   ⚠️  API Response: ${response.errmsg || 'Unknown error'}`);
        console.log(`   Error Code: ${response.errcode}`);
      }
      
      return true;
    } catch (apiError) {
      console.log('   ⚠️  Could not get lock list (this is OK if you have no locks yet)');
      console.log(`   Message: ${apiError.message}`);
      return true; // Still consider success if token works
    }
    
  } catch (error) {
    if (error.message.includes('401')) {
      console.error('   ❌ Invalid TTLock Credentials!');
      console.error('   Client ID or Secret is wrong');
    } else if (error.code === 'ENOTFOUND') {
      console.error('   ❌ TTLock API URL not found!');
      console.error(`   Cannot resolve: ${baseUrl}`);
    } else {
      console.error('   ❌ TTLock API Error!');
      console.error(`   Error: ${error.message}`);
    }
    return false;
  }
}

// Test 4: JWT Secret Configuration
async function testJWTConfig() {
  console.log('\n🎫 4. Testing JWT Configuration...');
  
  const jwtSecret = process.env.JWT_SECRET;
  
  if (!jwtSecret || jwtSecret === 'your_jwt_secret_key') {
    console.error('❌ JWT_SECRET not configured properly!');
    console.error('   Using default/placeholder value');
    return false;
  }
  
  console.log('✅ JWT Secret configured');
  console.log(`   Length: ${jwtSecret.length} characters`);
  return true;
}

// Run all tests
async function runAllTests() {
  const results = {
    database: false,
    authGateway: false,
    ttlockApi: false,
    jwtConfig: false
  };
  
  try {
    results.database = await testDatabase();
    results.authGateway = await testAuthGateway();
    results.ttlockApi = await testTTLockAPI();
    results.jwtConfig = await testJWTConfig();
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('\n📋 Connection Test Summary:\n');
    console.log(`   Database:      ${results.database ? '✅ Connected' : '❌ Failed'}`);
    console.log(`   AUTH Gateway:  ${results.authGateway ? '✅ Connected' : '❌ Failed'}`);
    console.log(`   TTLock API:    ${results.ttlockApi ? '✅ Connected' : '❌ Failed'}`);
    console.log(`   JWT Config:    ${results.jwtConfig ? '✅ OK' : '❌ Not Set'}`);
    
    const allPassed = Object.values(results).every(r => r === true);
    
    if (allPassed) {
      console.log('\n🎉 All connections are working!');
      console.log('   Your application is ready to use.');
    } else {
      console.log('\n⚠️  Some connections failed.');
      console.log('   Please check the errors above and fix configuration.');
    }
    
    console.log('\n' + '='.repeat(60));
    
  } catch (error) {
    console.error('\n💥 Unexpected Error:', error.message);
  } finally {
    // Close database connection
    await roomManagementDb.end();
    process.exit(0);
  }
}

// Run tests
runAllTests();
