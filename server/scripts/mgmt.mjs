// SQL over the Supabase Management API. The project's Postgres is reachable
// only via its in-project pgbouncer on an IPv6-only host (no IPv4 route from
// this network) and its shared-pooler tenant was retired when the project was
// restored from pause in Oct 2026 — so the server scripts run their SQL over
// HTTPS with the Supabase CLI's access token instead of a direct connection.
//
// Token resolution: SUPABASE_ACCESS_TOKEN env var first, else the CLI's
// keychain entry (wrapped by go-keyring as "go-keyring-base64:<b64>").
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));

export const env = {};
for (const line of (await readFile(join(here, '../.env'), 'utf8')).split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

const PROJECT_REF = new URL(env.SUPABASE_URL).hostname.split('.')[0];

let cachedToken;
async function accessToken() {
  if (cachedToken) return cachedToken;
  if (process.env.SUPABASE_ACCESS_TOKEN) {
    cachedToken = process.env.SUPABASE_ACCESS_TOKEN;
    return cachedToken;
  }
  const { stdout } = await exec('security', ['find-generic-password', '-s', 'Supabase CLI', '-a', 'supabase', '-w']);
  const raw = stdout.trim();
  cachedToken = raw.startsWith('go-keyring-base64:')
    ? Buffer.from(raw.slice('go-keyring-base64:'.length), 'base64').toString('utf8')
    : raw;
  return cachedToken;
}

/** Run SQL (multi-statement strings run in one session; the last statement's
 *  rows are returned). Throws with the API's message on failure. */
export async function query(sql) {
  const token = await accessToken();
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`mgmt query ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : [];
}

/** SQL literal quoting for the interpolated queries the tests build. */
export const sqlValue = (v) =>
  v == null ? 'null'
  : typeof v === 'number' ? String(v)
  : `'${String(v).replace(/'/g, "''")}'`;
