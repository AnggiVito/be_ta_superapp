import { roomManagementDb } from '../../../config/databases.js';

export async function upsertLinkCode(userId, code, expiresAt) {
  const result = await roomManagementDb.query(
    `INSERT INTO telegram_user_links
       (user_id, link_code, link_code_expires_at, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       link_code = EXCLUDED.link_code,
       link_code_expires_at = EXCLUDED.link_code_expires_at,
       updated_at = NOW()
     RETURNING *`,
    [userId, code, expiresAt]
  );
  return result.rows[0];
}

export async function getByUserId(userId) {
  const result = await roomManagementDb.query(
    `SELECT * FROM telegram_user_links WHERE user_id = $1`,
    [userId]
  );
  return result.rows[0] || null;
}

export async function getLinkedByUserId(userId) {
  const result = await roomManagementDb.query(
    `SELECT * FROM telegram_user_links
     WHERE user_id = $1
       AND telegram_chat_id IS NOT NULL
       AND linked_at IS NOT NULL`,
    [userId]
  );
  return result.rows[0] || null;
}

export async function linkByCode(code, telegramUser, chatId) {
  await roomManagementDb.query(
    `UPDATE telegram_user_links
     SET telegram_chat_id = NULL,
         telegram_user_id = NULL,
         telegram_username = NULL,
         telegram_first_name = NULL,
         telegram_last_name = NULL,
         linked_at = NULL,
         updated_at = NOW()
     WHERE telegram_chat_id = $1`,
    [String(chatId)]
  );

  const result = await roomManagementDb.query(
    `UPDATE telegram_user_links
     SET telegram_chat_id = $2,
         telegram_user_id = $3,
         telegram_username = $4,
         telegram_first_name = $5,
         telegram_last_name = $6,
         link_code = NULL,
         link_code_expires_at = NULL,
         linked_at = NOW(),
         updated_at = NOW()
     WHERE link_code = $1
       AND link_code_expires_at > NOW()
     RETURNING *`,
    [
      code,
      String(chatId),
      telegramUser?.id ? String(telegramUser.id) : null,
      telegramUser?.username || null,
      telegramUser?.first_name || null,
      telegramUser?.last_name || null,
    ]
  );
  return result.rows[0] || null;
}

export async function linkLatestPendingCode(telegramUser, chatId) {
  const pendingResult = await roomManagementDb.query(
    `SELECT id
     FROM telegram_user_links
     WHERE telegram_chat_id IS NULL
       AND link_code IS NOT NULL
       AND link_code_expires_at > NOW()
     ORDER BY updated_at DESC
     LIMIT 2`
  );

  if (pendingResult.rowCount !== 1) {
    return null;
  }

  await roomManagementDb.query(
    `UPDATE telegram_user_links
     SET telegram_chat_id = NULL,
         telegram_user_id = NULL,
         telegram_username = NULL,
         telegram_first_name = NULL,
         telegram_last_name = NULL,
         linked_at = NULL,
         updated_at = NOW()
     WHERE telegram_chat_id = $1`,
    [String(chatId)]
  );

  const result = await roomManagementDb.query(
    `UPDATE telegram_user_links
     SET telegram_chat_id = $2,
         telegram_user_id = $3,
         telegram_username = $4,
         telegram_first_name = $5,
         telegram_last_name = $6,
         link_code = NULL,
         link_code_expires_at = NULL,
         linked_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      pendingResult.rows[0].id,
      String(chatId),
      telegramUser?.id ? String(telegramUser.id) : null,
      telegramUser?.username || null,
      telegramUser?.first_name || null,
      telegramUser?.last_name || null,
    ]
  );

  return result.rows[0] || null;
}

export async function unlinkByUserId(userId) {
  const result = await roomManagementDb.query(
    `UPDATE telegram_user_links
     SET telegram_chat_id = NULL,
         telegram_user_id = NULL,
         telegram_username = NULL,
         telegram_first_name = NULL,
         telegram_last_name = NULL,
         link_code = NULL,
         link_code_expires_at = NULL,
         linked_at = NULL,
         updated_at = NOW()
     WHERE user_id = $1
     RETURNING *`,
    [userId]
  );
  return result.rows[0] || null;
}
