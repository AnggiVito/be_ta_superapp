/**
 * Bootstrap Script untuk Assign Role Kaur Lab Pertama Kali
 * 
 * Script ini akan:
 * 1. Cek apakah sudah ada user dengan role kaur_lab
 * 2. Jika belum ada dan FIRST_KAUR_LAB_USER_ID sudah di-set, assign role kaur_lab
 * 3. Jika sudah ada, skip (idempotent)
 * 
 * Usage:
 *   node scripts/bootstrap-kaur-lab.js
 * 
 * Atau akan otomatis dijalankan saat aplikasi startup jika RUN_BOOTSTRAP=true
 */

import { userManagementDb } from '../config/databases.js';
import { logger } from '../core/utils/logger.js';
import * as roleModel from '../modules/user-management/models/roleModel.js';
import * as roleService from '../modules/user-management/services/roleService.js';
import * as profileModel from '../modules/user-management/models/profileModel.js';

// Note: Environment variables sudah di-load oleh Docker melalui env_file di docker-compose.yml
// atau oleh app.js yang memanggil dotenv.config() sebelumnya
// Tidak perlu memanggil dotenv.config() lagi di sini karena process.env sudah terisi

/**
 * Bootstrap kaur_lab role untuk user pertama
 */
export async function bootstrapKaurLab() {
  try {
    // Cek apakah FIRST_KAUR_LAB_USER_ID sudah di-set
    const firstKaurLabUserId = process.env.FIRST_KAUR_LAB_USER_ID;
    
    // Debug logging untuk memastikan environment variable terdeteksi
    logger.debug('Checking FIRST_KAUR_LAB_USER_ID:', {
      hasValue: !!firstKaurLabUserId,
      valueLength: firstKaurLabUserId ? firstKaurLabUserId.length : 0,
      allEnvKeys: Object.keys(process.env).filter(key => key.includes('FIRST') || key.includes('KAUR')).join(', '),
    });
    
    if (!firstKaurLabUserId) {
      logger.warn('FIRST_KAUR_LAB_USER_ID tidak di-set di environment variables. Skip bootstrap kaur_lab.');
      logger.warn('Pastikan FIRST_KAUR_LAB_USER_ID sudah di-set di .env file atau di docker-compose.yml environment section.');
      return {
        success: false,
        message: 'FIRST_KAUR_LAB_USER_ID tidak di-set',
        skipped: true,
      };
    }

    // Cek apakah sudah ada user dengan role kaur_lab
    const existingKaurLab = await roleModel.getUsersByRole('kaur_lab', false);
    
    if (existingKaurLab.length > 0) {
      logger.info('Role kaur_lab sudah ada. Skip bootstrap.', {
        existingCount: existingKaurLab.length,
        firstUserId: existingKaurLab[0].user_id,
      });
      return {
        success: true,
        message: 'Role kaur_lab sudah ada, skip bootstrap',
        skipped: true,
        existingKaurLab: existingKaurLab[0].user_id,
      };
    }

    // Ensure profile exists for the kaur_lab user so resolveRelatedUserIds can bridge
    // the JWT login identity with this role-bearing user_id via nipnim / name matching.
    try {
      const existingProfile = await profileModel.getProfileByUserId(firstKaurLabUserId);
      if (!existingProfile) {
        await userManagementDb.query(
          `INSERT INTO user_profiles (user_id, name, nipnim)
           VALUES ($1, $1, $1)
           ON CONFLICT (user_id) DO NOTHING`,
          [firstKaurLabUserId]
        );
        logger.info('✓ Profile placeholder created for kaur_lab user', {
          userId: firstKaurLabUserId,
        });
      } else {
        logger.info('✓ Profile already exists for kaur_lab user', {
          userId: firstKaurLabUserId,
        });
      }
    } catch (profileErr) {
      logger.warn('Could not ensure profile for kaur_lab user (non-fatal):', profileErr.message);
    }

    // Assign role kaur_lab ke user pertama (validasi akan dilakukan di service)
    logger.info('Assigning role kaur_lab untuk user pertama...', {
      userId: firstKaurLabUserId,
    });

    const assignedRole = await roleService.assignRole(
      firstKaurLabUserId,
      'kaur_lab',
      'system' // assigned_by = 'system' untuk bootstrap
    );

    logger.info('✓ Role kaur_lab berhasil di-assign', {
      userId: firstKaurLabUserId,
      roleId: assignedRole.id,
    });

    return {
      success: true,
      message: 'Role kaur_lab berhasil di-assign',
      userId: firstKaurLabUserId,
      roleId: assignedRole.id,
    };
  } catch (error) {
    logger.error('Error dalam bootstrap kaur_lab:', error);
    throw error;
  }
}

/**
 * Main function untuk run script standalone
 */
async function main() {
  try {
    // Test database connection
    await userManagementDb.query('SELECT 1');
    logger.info('✓ Database connected');

    // Run bootstrap
    const result = await bootstrapKaurLab();
    
    if (result.success) {
      logger.info('Bootstrap completed:', result);
      process.exit(0);
    } else {
      logger.warn('Bootstrap skipped:', result);
      process.exit(0); // Exit dengan success karena skip adalah expected behavior
    }
  } catch (error) {
    logger.error('Bootstrap failed:', error);
    process.exit(1);
  } finally {
    await userManagementDb.end();
  }
}

// Run jika dipanggil langsung (bukan sebagai module)
// Check jika script ini yang dijalankan langsung via node
if (process.argv[1] && process.argv[1].endsWith('bootstrap-kaur-lab.js')) {
  main();
}

