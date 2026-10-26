// (Re)seeds the device account pool: creates auth users through GoTrue's
// admin API (correct hash format + row shape) and mirrors credentials into
// public.device_accounts for the claim RPC. Idempotent per email.
import crypto from 'node:crypto';
import { query, sqlValue, env } from './mgmt.mjs';

const URL_ = env.SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_KEY;
if (!SERVICE) { console.error('SUPABASE_SERVICE_KEY missing from server/.env'); process.exit(1); }

const POOL_SIZE = 24;

// drop the SQL-seeded users that predate admin-API seeding
await query(`delete from auth.users where email like 'devpool-%' and instance_id is null`);
await query(`delete from auth.users where email = 'devpool-99@devices.motor.app'`);

const existing = new Set((await query('select email from public.device_accounts')).map((r) => r.email));
let created = 0;
for (let i = 1; i <= POOL_SIZE; i++) {
  const email = `devpool-${String(i).padStart(2, '0')}@devices.motor.app`;
  if (existing.has(email)) continue;
  const password = 'motor-' + crypto.randomBytes(8).toString('hex');
  let res = await fetch(`${URL_}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (res.status === 201) {
    // fresh create, password as requested
  } else if (res.status === 200 || res.status === 422) {
    const rows = await query(`select id from auth.users where email = ${sqlValue(email)}`);
    if (!rows.length) { console.error(`skip ${email}: exists per API, absent in DB`); continue; }
    res = await fetch(`${URL_}/auth/v1/admin/users/${rows[0].id}`, {
      method: 'PUT',
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, email_confirm: true }),
    });
    if (res.status >= 300) { console.error(`skip ${email}: reset failed ${res.status}`); continue; }
  } else {
    console.error(`skip ${email}: ${res.status} ${(await res.text()).slice(0, 120)}`);
    continue;
  }
  await query(`insert into public.device_accounts (email, password) values (${sqlValue(email)}, ${sqlValue(password)})`);
  created++;
}
console.log(`pool seeded: ${created} new, ${existing.size} existing`);
