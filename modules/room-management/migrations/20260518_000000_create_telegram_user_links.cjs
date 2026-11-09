/**
 * Create Telegram user link table for direct room booking notifications.
 */

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS telegram_user_links (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR(255) NOT NULL UNIQUE,
      telegram_chat_id VARCHAR(255) UNIQUE,
      telegram_user_id VARCHAR(255),
      telegram_username VARCHAR(255),
      telegram_first_name VARCHAR(255),
      telegram_last_name VARCHAR(255),
      link_code VARCHAR(32) UNIQUE,
      link_code_expires_at TIMESTAMP WITH TIME ZONE,
      linked_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_telegram_user_links_link_code
      ON telegram_user_links(link_code);

    CREATE INDEX IF NOT EXISTS idx_telegram_user_links_user_id
      ON telegram_user_links(user_id);

    COMMENT ON TABLE telegram_user_links IS
      'Telegram account links for direct room booking notifications';
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS telegram_user_links;
  `);
};
