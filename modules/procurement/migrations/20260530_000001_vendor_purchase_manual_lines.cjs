/** Allow vendor purchase lines without a linked submission item (fully manual entry). */

exports.up = (pgm) => {

  pgm.sql(`

    ALTER TABLE procurement_submission_vendor_purchase_lines

      ADD COLUMN IF NOT EXISTS item_name VARCHAR(512);



    ALTER TABLE procurement_submission_vendor_purchase_lines

      ALTER COLUMN submission_item_id DROP NOT NULL;



    ALTER TABLE procurement_submission_vendor_purchase_lines

      DROP CONSTRAINT IF EXISTS procurement_submission_vendor_submission_id_submission_item_key;



    CREATE UNIQUE INDEX IF NOT EXISTS idx_vendor_purchase_lines_submission_item_unique

      ON procurement_submission_vendor_purchase_lines (submission_id, submission_item_id)

      WHERE submission_item_id IS NOT NULL;

  `);

};



exports.down = (pgm) => {

  pgm.sql(`

    DROP INDEX IF EXISTS idx_vendor_purchase_lines_submission_item_unique;



    DELETE FROM procurement_submission_vendor_purchase_lines

      WHERE submission_item_id IS NULL;



    ALTER TABLE procurement_submission_vendor_purchase_lines

      DROP COLUMN IF EXISTS item_name;



    ALTER TABLE procurement_submission_vendor_purchase_lines

      ALTER COLUMN submission_item_id SET NOT NULL;



    ALTER TABLE procurement_submission_vendor_purchase_lines

      ADD CONSTRAINT procurement_submission_vendor_submission_id_submission_item_key

      UNIQUE (submission_id, submission_item_id);

  `);

};

