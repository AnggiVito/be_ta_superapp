const DEFAULT_LABORAN_WALLET = '0x24dd09681D0545C84AEc89D42CF645f6c1694939';

exports.up = (pgm) => {
  pgm.sql(`
    INSERT INTO procurement_handover_authorized_laborans (
      wallet_address, is_active, created_at, updated_at
    ) VALUES (
      '${DEFAULT_LABORAN_WALLET}', TRUE, NOW(), NOW()
    )
    ON CONFLICT (wallet_address)
    DO UPDATE SET
      is_active = TRUE,
      revoked_at = NULL,
      revoked_by = NULL,
      updated_at = NOW();
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DELETE FROM procurement_handover_authorized_laborans
    WHERE lower(wallet_address) = lower('${DEFAULT_LABORAN_WALLET}');
  `);
};
