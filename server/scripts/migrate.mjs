// Applies server/migrations/*.sql in order, once each, tracked in _migrations.
// Each file runs as one multi-statement session (so $$-bodied functions
// survive intact) wrapped in a transaction.
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query, sqlValue } from './mgmt.mjs';

const here = dirname(fileURLToPath(import.meta.url));

await query('create table if not exists _migrations (name text primary key, applied_at timestamptz default now())');
const applied = new Set((await query('select name from _migrations')).map((r) => r.name));
const files = (await readdir(join(here, '../migrations'))).filter((f) => f.endsWith('.sql')).sort();

for (const file of files) {
  if (applied.has(file)) {
    console.log(`skip  ${file}`);
    continue;
  }
  const sql = await readFile(join(here, '../migrations', file), 'utf8');
  try {
    await query(`begin;\n${sql}\ninsert into _migrations (name) values (${sqlValue(file)});\ncommit;`);
    console.log(`ok    ${file}`);
  } catch (err) {
    await query('rollback').catch(() => {});  // the session ended with the error
    console.error(`FAIL  ${file}: ${err.message}`);
    process.exitCode = 1;
    break;
  }
}
