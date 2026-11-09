/**
 * Bootstrap periode aktif untuk development.
 *
 * Saat gateway GET /periodes tidak tersedia, seed registration_settings.active_periode
 * agar fitur yang memakai periode aktif (praktikum, jadwal, asisten aktif, dll.) tetap jalan.
 *
 * Hanya berjalan jika NODE_ENV=development dan belum ada nilai active_periode.
 *
 * Usage:
 *   node scripts/bootstrap-active-periode.js
 *
 * Atau otomatis saat startup jika RUN_BOOTSTRAP=true
 */

import { registrationDb } from '../config/databases.js';
import { logger } from '../core/utils/logger.js';
import * as activePeriodeService from '../modules/registration/services/activePeriodeService.js';

const DEFAULT_DEV_ACTIVE_PERIODE = '2526-2';

function isDevelopment() {
  return (process.env.NODE_ENV || '').toLowerCase() === 'development';
}

function resolveDevActivePeriode() {
  const fromEnv = process.env.DEV_ACTIVE_PERIODE?.trim();
  return fromEnv || DEFAULT_DEV_ACTIVE_PERIODE;
}

export async function bootstrapActivePeriode() {
  try {
    if (!isDevelopment()) {
      return {
        success: true,
        message: 'Skip bootstrap active_periode (bukan development)',
        skipped: true,
      };
    }

    const existing = await activePeriodeService.getActivePeriode();
    if (existing.active_periode) {
      logger.info('Active periode sudah dikonfigurasi. Skip bootstrap.', {
        active_periode: existing.active_periode,
      });
      return {
        success: true,
        message: 'Active periode sudah ada, skip bootstrap',
        skipped: true,
        active_periode: existing.active_periode,
      };
    }

    const periodeLabel = resolveDevActivePeriode();
    const row = await activePeriodeService.setActivePeriode(
      { id: periodeLabel, label: periodeLabel, periode: periodeLabel },
      'system'
    );

    logger.info('✓ Active periode dev bootstrap selesai', {
      active_periode: row.active_periode,
    });

    return {
      success: true,
      message: 'Active periode dev bootstrap selesai',
      skipped: false,
      active_periode: row.active_periode,
    };
  } catch (error) {
    logger.error('Error dalam bootstrap active_periode:', error);
    throw error;
  }
}

async function main() {
  try {
    await registrationDb.query('SELECT 1');
    logger.info('✓ Registration database connected');

    const result = await bootstrapActivePeriode();
    if (result.success) {
      logger.info('Bootstrap active_periode completed:', result);
      process.exit(0);
    }
    process.exit(1);
  } catch (error) {
    logger.error('Bootstrap active_periode failed:', error);
    process.exit(1);
  } finally {
    await registrationDb.end();
  }
}

if (process.argv[1] && process.argv[1].endsWith('bootstrap-active-periode.js')) {
  main();
}
