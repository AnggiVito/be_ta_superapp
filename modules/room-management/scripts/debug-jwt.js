import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;

console.log('🔍 JWT Token Debugger\n');
console.log('═══════════════════════════════════════════════════════════\n');
console.log(`JWT Secret (first 20 chars): ${JWT_SECRET?.substring(0, 20)}...`);
console.log(`JWT Secret length: ${JWT_SECRET?.length} characters\n`);

// Paste your token here
const YOUR_TOKEN = process.argv[2];

if (!YOUR_TOKEN) {
  console.log('❌ No token provided!\n');
  console.log('Usage:');
  console.log('  node scripts/debug-jwt.js "YOUR_TOKEN_HERE"\n');
  console.log('Example:');
  console.log('  node scripts/debug-jwt.js "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIx..."\n');
  process.exit(1);
}

console.log('═══════════════════════════════════════════════════════════\n');
console.log('🔑 Testing Token Validation...\n');
console.log(`Token (first 50 chars): ${YOUR_TOKEN.substring(0, 50)}...\n`);

try {
  // Try to decode without verification first
  const decoded = jwt.decode(YOUR_TOKEN);
  console.log('📄 Token Payload (decoded without verification):');
  console.log(JSON.stringify(decoded, null, 2));
  console.log('');

  // Now verify with secret
  console.log('🔐 Verifying with JWT_SECRET...\n');
  const verified = jwt.verify(YOUR_TOKEN, JWT_SECRET, {
    ignoreNotBefore: true, // Ignore nbf untuk handle clock skew
    clockTolerance: 60 // 60 seconds tolerance
  });
  
  console.log('✅ TOKEN VALID!\n');
  console.log('Verified Payload:');
  console.log(JSON.stringify(verified, null, 2));
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('✅ Token is valid! You can use this token in Postman.\n');
  
} catch (error) {
  console.log('❌ TOKEN VERIFICATION FAILED!\n');
  console.log(`Error: ${error.message}\n`);
  
  if (error.message.includes('invalid signature')) {
    console.log('🔍 Diagnosis:');
    console.log('   The JWT_SECRET in your .env does not match');
    console.log('   the secret used by AUTH service to sign this token.\n');
    console.log('💡 Solution:');
    console.log('   1. Check JWT_SECRET in AUTH service');
    console.log('   2. Copy the exact same secret to be_practicum/.env');
    console.log('   3. Restart backend: docker-compose restart backend');
    console.log('   4. Get new token from AUTH service');
    console.log('   5. Try again\n');
  } else if (error.message.includes('expired')) {
    console.log('🔍 Diagnosis:');
    console.log('   Token has expired.\n');
    console.log('💡 Solution:');
    console.log('   Login again to get a fresh token.\n');
  } else {
    console.log('🔍 Error details:');
    console.log(`   ${error.stack}\n`);
  }
  
  console.log('═══════════════════════════════════════════════════════════\n');
  process.exit(1);
}
