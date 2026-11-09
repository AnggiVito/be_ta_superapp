import axios from 'axios';
import { config } from 'dotenv';

config();

const AUTH_GATEWAY_URL = process.env.AUTH_GATEWAY_URL || 'https://dev-fri-gateway.virtualfri.id';

// Test users dari API Gateway FRI
const testUsers = [
  { username: 'TPA001', password: 'dev123', role: 'TPA Staff' },
  { username: 'M001', password: 'dev123', role: 'asisten_praktikum (dev auto-assign)' },
  { username: 'M002', password: 'dev123', role: 'koordinator_asisten (dev auto-assign)' },
  { username: 'KAUR001', password: 'dev123', role: 'Kaur' },
  { username: 'KAUR002', password: 'dev123', role: 'Kaur' },
  { username: 'KAPRODI001', password: 'dev123', role: 'Kaprodi' },
  { username: 'DOSEN001', password: 'dev123', role: 'dosen_pembina (dev auto-assign)' },
  { username: 'DOSEN002', password: 'dev123', role: 'Dosen' },
];

async function getTokenFromAuthGateway(username, password) {
  try {
    console.log(`\n🔐 Logging in as: ${username}`);
    
    const response = await axios.post(`${AUTH_GATEWAY_URL}/login`, {
      username,
      password
    });

    if (response.data.token) {
      console.log('\n✅ Login successful!');
      console.log('\n=== JWT Token ===');
      console.log(response.data.token);
      
      console.log('\n=== User Info ===');
      console.log(JSON.stringify(response.data.user, null, 2));
      
      if (response.data.dev_mode) {
        console.log('\n⚠️  Running in DEVELOPMENT mode');
      }
      
      return response.data.token;
    }
  } catch (error) {
    console.error('\n❌ Error getting token from auth gateway:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error('Message:', error.message);
    }
    return null;
  }
}

// Main function
async function main() {
  console.log('🚀 FRI Auth Gateway Token Generator');
  console.log('📍 Gateway URL:', AUTH_GATEWAY_URL);
  console.log('\n📋 Available Test Users:');
  
  testUsers.forEach((user, index) => {
    console.log(`${index + 1}. ${user.username} - ${user.role}`);
  });

  // Get token for first user (TPA001) by default
  const defaultUser = testUsers[0];
  console.log(`\n🎯 Generating token for default user: ${defaultUser.username}`);
  
  await getTokenFromAuthGateway(defaultUser.username, defaultUser.password);
  
  console.log('\n💡 To get token for other users, modify the script or call:');
  console.log('   getTokenFromAuthGateway("USERNAME", "dev123")');
}

// Run main function
main();

// Export for use in other scripts
export { getTokenFromAuthGateway, testUsers };
