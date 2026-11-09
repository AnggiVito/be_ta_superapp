#!/usr/bin/env node
// Simple single-file migration runner. Use only when you want to apply
// one specific SQL migration file without running the full pipeline.

import fs from 'fs';
import path from 'path';
import { procurementDb } from '../config/databases.js';

function splitSQLStatements(sql) {
  const statements = [];
  let current = '';
  let inDollar = false;
  let tag = '';
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (ch === '$' && !inDollar) {
      let j = i + 1;
      while (j < sql.length && sql[j] !== '$') j++;
      if (j < sql.length) {
        tag = sql.substring(i, j + 1);
        inDollar = true;
        current += tag;
        i = j + 1;
        continue;
      }
    }
    if (inDollar) {
      if (i + tag.length <= sql.length && sql.substring(i, i + tag.length) === tag) {
        current += tag;
        i += tag.length;
        inDollar = false;
        tag = '';
        continue;
      }
    }
    if (!inDollar && ch === ';') {
      if (current.trim()) statements.push(current.trim());
      current = '';
      i++;
      continue;
    }
    current += ch;
    i++;
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: node scripts/run-single-migration.js <relative-path-to-sql>');
    process.exit(1);
  }
  const filePath = path.resolve(process.cwd(), arg);
  if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const statements = splitSQLStatements(content);
  console.log(`Running ${statements.length} statement(s) from ${arg}`);

  try {
    for (let i = 0; i < statements.length; i++) {
      const s = statements[i];
      try {
        await procurementDb.query(s);
        console.log(`  ✓ Statement ${i + 1}/${statements.length} executed`);
      } catch (e) {
        // If already exists, skip
        const msg = e?.message || '';
        if (msg.includes('already exists') || msg.includes('duplicate column') || msg.includes('relation already exists')) {
          console.log(`  ⚠ Statement ${i + 1} skipped (already exists)`);
          continue;
        }
        throw e;
      }
    }
    console.log('Migration file applied successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(2);
  }
}

main();
