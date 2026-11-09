/**
 * Script untuk assign role secara manual
 * 
 * Usage:
 *   node scripts/assign-role-manual.js <userId> <role>
 * 
 * Contoh:
 *   node scripts/assign-role-manual.js a4449154-2c32-4863-9e8a-0b56588fe308 kaur_lab
 */

import dotenv from 'dotenv';
import { userManagementDb } from '../config/databases.js';
import { logger } from '../core/utils/logger.js';
import * as roleService from '../modules/user-management/services/roleService.js';

// Load environment variables
import { loadEnvSafe } from '../core/utils/envLoader.js';
loadEnvSafe();

async function assignRoleManually() {
  try {
    const userId = process.argv[2];
    const role = process.argv[3];

    if (!userId || !role) {
      console.error('Usage: node scripts/assign-role-manual.js <userId> <role>');
      console.error('Contoh: node scripts/assign-role-manual.js a4449154-2c32-4863-9e8a-0b56588fe308 kaur_lab');
      process.exit(1);
    }

    // Test database connection
    await userManagementDb.query('SELECT 1');
    logger.info('✓ Database connected');

    // Assign role (validasi akan dilakukan di service)
    logger.info(`Assigning role ${role} to user ${userId}...`);
    const assignedRole = await roleService.assignRole(userId, role, 'system');
    
    logger.info('✓ Role berhasil di-assign', {
      userId,
      role,
      roleId: assignedRole.id,
      isActive: assignedRole.is_active,
    });

    console.log('\n✅ Role berhasil di-assign!');
    console.log(`User ID: ${userId}`);
    console.log(`Role: ${role}`);
    console.log(`Role ID: ${assignedRole.id}`);
    console.log(`Is Active: ${assignedRole.is_active}`);
    console.log(`Assigned At: ${assignedRole.assigned_at}`);

    process.exit(0);
  } catch (error) {
    logger.error('Error assigning role:', error);
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  } finally {
    await userManagementDb.end();
  }
}

assignRoleManually();

