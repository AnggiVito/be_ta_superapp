/**
 * Script untuk reassign role kaur_lab ke user baru
 * Script ini akan:
 * 1. Deactivate role kaur_lab dari user lama (jika ada)
 * 2. Assign role kaur_lab ke user baru dari FIRST_KAUR_LAB_USER_ID
 * 
 * Usage:
 *   node scripts/reassign-kaur-lab.js
 * 
 * Atau dengan user ID spesifik:
 *   node scripts/reassign-kaur-lab.js <newUserId>
 */

import { userManagementDb } from '../config/databases.js';
import { logger } from '../core/utils/logger.js';
import * as roleModel from '../modules/user-management/models/roleModel.js';
import * as roleService from '../modules/user-management/services/roleService.js';

async function reassignKaurLab() {
  try {
    // Ambil user ID baru dari argument atau dari env
    const newUserId = process.argv[2] || process.env.FIRST_KAUR_LAB_USER_ID;

    if (!newUserId) {
      console.error('❌ User ID tidak ditemukan!');
      console.error('Usage: node scripts/reassign-kaur-lab.js [userId]');
      console.error('Atau set FIRST_KAUR_LAB_USER_ID di .env file');
      process.exit(1);
    }

    // Test database connection
    await userManagementDb.query('SELECT 1');
    logger.info('✓ Database connected');

    // Cek user lama yang punya role kaur_lab
    const existingKaurLab = await roleModel.getUsersByRole('kaur_lab', false);
    
    if (existingKaurLab.length > 0) {
      const oldUserId = existingKaurLab[0].user_id;
      
      if (oldUserId === newUserId) {
        console.log(`\n✅ User ${newUserId} sudah memiliki role kaur_lab. Tidak perlu reassign.`);
        process.exit(0);
      }

      console.log(`\n📋 User lama dengan role kaur_lab: ${oldUserId}`);
      console.log(`📋 User baru yang akan di-assign: ${newUserId}`);
      
      // Deactivate role dari user lama
      logger.info(`Deactivating role kaur_lab from old user: ${oldUserId}`);
      for (const role of existingKaurLab) {
        await roleModel.updateRoleStatus(role.id, false, 'system');
      }
      console.log(`✓ Role kaur_lab di-deactivate dari user lama`);
    } else {
      console.log('\n📋 Tidak ada user lama dengan role kaur_lab');
    }

    // Assign role ke user baru (validasi akan dilakukan di service)
    logger.info(`Assigning role kaur_lab to new user: ${newUserId}`);
    const assignedRole = await roleService.assignRole(newUserId, 'kaur_lab', 'system');
    
    logger.info('✓ Role kaur_lab berhasil di-assign', {
      userId: newUserId,
      roleId: assignedRole.id,
      isActive: assignedRole.is_active,
    });

    console.log('\n✅ Reassign berhasil!');
    console.log(`User ID: ${newUserId}`);
    console.log(`Role: kaur_lab`);
    console.log(`Role ID: ${assignedRole.id}`);
    console.log(`Is Active: ${assignedRole.is_active}`);
    console.log(`Assigned At: ${assignedRole.assigned_at}`);

    // Verifikasi
    const verify = await roleModel.getUsersByRole('kaur_lab', false);
    console.log(`\n📊 Verifikasi: Total user dengan role kaur_lab aktif = ${verify.length}`);
    if (verify.length > 0) {
      console.log(`   User ID: ${verify[0].user_id}`);
    }

    process.exit(0);
  } catch (error) {
    logger.error('Error reassigning role:', error);
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  } finally {
    await userManagementDb.end();
  }
}

reassignKaurLab();

