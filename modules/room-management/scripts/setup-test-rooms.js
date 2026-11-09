import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  host: process.env.ROOM_MANAGEMENT_DB_HOST || 'room_management_db',
  port: process.env.ROOM_MANAGEMENT_DB_PORT || 5432,
  database: process.env.ROOM_MANAGEMENT_DB_NAME || 'room_management_db',
  user: process.env.ROOM_MANAGEMENT_DB_USER || 'postgres',
  password: process.env.ROOM_MANAGEMENT_DB_PASSWORD || 'postgres',
});

async function setupTestRooms() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Setting up test rooms with TTLock integration...\n');
    
    // Insert test rooms
    const insertQuery = `
      INSERT INTO rooms (id, name, capacity, door_lock_id, is_occupied, created_at, updated_at)
      VALUES 
        (gen_random_uuid(), 'Lab Komputer 101', 30, '12405430', false, NOW(), NOW()),
        (gen_random_uuid(), 'Lab Jaringan 201', 25, '12405430', false, NOW(), NOW()),
        (gen_random_uuid(), 'Ruang Meeting A', 15, '12405430', false, NOW(), NOW())
      ON CONFLICT DO NOTHING;
    `;
    
    await client.query(insertQuery);
    console.log('✅ Test rooms inserted!\n');
    
    // Get rooms with lock ID
    const selectQuery = `
      SELECT id, name, capacity, door_lock_id, is_occupied, created_at
      FROM rooms 
      WHERE door_lock_id IS NOT NULL
      ORDER BY created_at DESC;
    `;
    
    const result = await client.query(selectQuery);
    
    console.log('📋 Rooms with TTLock Integration:\n');
    console.log('═══════════════════════════════════════════════════════════════════════════════════════════════\n');
    
    result.rows.forEach((room, index) => {
      console.log(`${index + 1}. Room Details:`);
      console.log(`   🆔 Room ID: ${room.id}`);
      console.log(`   📛 Name: ${room.name}`);
      console.log(`   👥 Capacity: ${room.capacity}`);
      console.log(`   🔑 Lock ID: ${room.door_lock_id}`);
      console.log(`   🚪 Occupied: ${room.is_occupied ? 'Yes' : 'No'}`);
      console.log(`   📅 Created: ${room.created_at.toLocaleString()}`);
      console.log('');
    });
    
    console.log('═══════════════════════════════════════════════════════════════════════════════════════════════\n');
    
    if (result.rows.length > 0) {
      const firstRoom = result.rows[0];
      console.log('📝 Postman Testing - Copy this:\n');
      console.log(`Room ID for API testing: ${firstRoom.id}`);
      console.log(`Room Name: ${firstRoom.name}`);
      console.log(`Lock ID: ${firstRoom.door_lock_id}\n`);
      
      console.log('🔗 Example API Endpoint:');
      console.log(`POST http://localhost:3000/api/room-management/rooms/${firstRoom.id}/passcodes/temporary\n`);
      
      console.log('📦 Example Request Body:');
      console.log(JSON.stringify({
        name: 'Test Temporary Access',
        validityDays: 7
      }, null, 2));
      console.log('');
    }
    
  } catch (error) {
    console.error('❌ Error setting up test rooms:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

setupTestRooms()
  .then(() => {
    console.log('✅ Setup completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  });
