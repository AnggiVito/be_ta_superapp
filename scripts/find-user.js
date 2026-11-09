/**
 * Cari user di user_profiles berdasarkan identifier
 * Usage:
 *   node scripts/find-user.js <identifier>
 * Contoh:
 *   node scripts/find-user.js tpa001
 */

import { userManagementDb } from '../config/databases.js';
import { loadEnvSafe } from '../core/utils/envLoader.js';
import { logger } from '../core/utils/logger.js';

loadEnvSafe();

async function findUser() {
  try {
    const identifier = process.argv[2];
    if (!identifier) {
      console.error('Usage: node scripts/find-user.js <identifier>');
      process.exit(1);
    }

    await userManagementDb.query('SELECT 1');
    logger.info('✓ Database connected');

    const like = `%${identifier.toLowerCase()}%`;
    const query = `
      SELECT user_id, name, nipnim
      FROM user_profiles
      WHERE deleted_at IS NULL
        AND (
          lower(user_id) = $1
          OR lower(nipnim) = $1
          OR lower(name) LIKE $2
          OR lower(nipnim) LIKE $2
        )
      LIMIT 50
    `;

    const res = await userManagementDb.query(query, [identifier.toLowerCase(), like]);

    if (res.rows.length === 0) {
      console.log('\n🔎 Tidak ditemukan user dengan identifier:', identifier);
      process.exit(0);
    }

    console.log('\n🔎 Hasil pencarian:');
    for (const row of res.rows) {
      console.log(`- user_id: ${row.user_id}, name: ${row.name || '-'}, nipnim: ${row.nipnim || '-'} `);
    }

    process.exit(0);
  } catch (error) {
    logger.error('Error finding user:', error);
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  } finally {
    await userManagementDb.end();
  }
}

findUser();
