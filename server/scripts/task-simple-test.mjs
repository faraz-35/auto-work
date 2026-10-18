// Scoped check for migration 0006 (chores lose money + duration):
// create_chore works WITHOUT p_amount/p_duration_minutes (new clients)
// and WITH them (old clients still in the wild). Creates its own test
// household and deletes exactly that household afterwards.
import { query, sqlValue } from './mgmt.mjs';

let passed = 0, failed = 0;
const ok = (name, cond, detail = '') => cond ? (passed++, console.log(`  PASS ${name}`))
  : (failed++, console.error(`  FAIL ${name} ${detail}`));
const claims = (uuid) => sqlValue(JSON.stringify({ sub: uuid, role: 'authenticated' }));
const as = (uid, call) => `select set_config('request.jwt.claims', ${claims(uid)}, false);\n${call}`;
const q = (sql) => query(sql);

const uid = crypto.randomUUID();
try {
  await q(`insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
           values (${sqlValue(uid)}, 'authenticated', 'authenticated', 'simpletask-test@motor.test', now(), '{}', '{}')`);
  const H = (await q(`insert into public.households (id) values (default) returning id`))[0].id;
  const M = (await q(`insert into public.members (household_id, auth_uid, name, rotation_order)
    values (${sqlValue(H)}, ${sqlValue(uid)}, 'SimpleTask-Test', 0) returning id`))[0].id;

  // new-client shape: stops at p_time_of_day — no money, duration, pool, weekdays
  const c1 = (await q(as(uid, `select public.create_chore('Simple test once', null, ${sqlValue(M)}, false, true, now() + interval '1 day', null, null, '18:00')`)))[0].create_chore;
  const row1 = (await q(`select duration_minutes, amount, strict from public.chores where id = ${sqlValue(c1)}`))[0];
  ok('new-style create (no money/duration) works', true);
  ok('duration + amount default null', row1.duration_minutes === null && row1.amount === null, JSON.stringify(row1));

  // old-client shape: all 13 positional args, money + duration set
  const c2 = (await q(as(uid, `select public.create_chore('Simple test bill', null, ${sqlValue(M)}, false, true, now() + interval '1 day', null, null, '09:00', 30, 4500)`)))[0].create_chore;
  const row2 = (await q(`select duration_minutes, amount from public.chores where id = ${sqlValue(c2)}`))[0];
  ok('old-style create still works', row2.duration_minutes === 30 && Number(row2.amount) === 4500, JSON.stringify(row2));

  console.log(failed === 0 ? `\n${passed}/${passed + failed} green` : `\n${failed} FAILED`);
  if (failed > 0) process.exitCode = 1;
} finally {
  await q(`delete from public.households h where h.id in (select m.household_id from public.members m where m.auth_uid = ${sqlValue(uid)})`);
  await q(`delete from auth.users where id = ${sqlValue(uid)}`);
}
