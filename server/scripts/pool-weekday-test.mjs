// Scoped logic test for the v2 when-model: rotation pools and weekly
// (repeat_weekdays) schedules. Unlike sql-test.mjs, which owns an empty dev
// DB, this one is safe against the live household — it creates its own test
// household directly and deletes exactly that household afterwards.
import { query, sqlValue } from './mgmt.mjs';

let passed = 0, failed = 0;
const ok = (name, cond, detail = '') => cond ? (passed++, console.log(`  PASS ${name}`))
  : (failed++, console.error(`  FAIL ${name} ${detail}`));
const claims = (uuid) => sqlValue(JSON.stringify({ sub: uuid, role: 'authenticated' }));
const as = (uid, call) => `select set_config('request.jwt.claims', ${claims(uid)}, false);\n${call}`;
const q = async (sql) => query(sql);

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());
const addDays = (ds, n) => new Date(Date.parse(ds + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const dow = (ds) => new Date(ds + 'T00:00:00Z').getUTCDay();

const uids = [1, 2, 3].map((i) => crypto.randomUUID());
const names = ['PoolTest-Faraz', 'PoolTest-Ayesha', 'PoolTest-Bilal'];
try {
  for (let i = 0; i < uids.length; i++) {
    await q(`insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
             values (${sqlValue(uids[i])}, 'authenticated', 'authenticated', ${sqlValue(`pooltest-${i}@motor.test`)}, now(), '{}', '{}')`);
  }
  const H = (await q(`insert into public.households (id) values (default) returning id`))[0].id;
  for (let i = 0; i < uids.length; i++) {
    await q(`insert into public.members (household_id, auth_uid, name, rotation_order)
             values (${sqlValue(H)}, ${sqlValue(uids[i])}, ${sqlValue(names[i])}, ${i})`);
  }
  const members = await q(`select id, name from public.members where household_id = ${sqlValue(H)} order by rotation_order`);
  const uidOf = (i) => uids[i];
  const idOf = (i) => members[i].id;
  const assigneeFor = async (choreId, ds) =>
    (await q(`select public.assignee_for(${sqlValue(choreId)}, ${sqlValue(ds)}::date) as a`))[0].a;
  const occursOn = async (choreId, ds) =>
    (await q(`select public.occurs_on(${sqlValue(choreId)}, ${sqlValue(ds)}::date) as o`))[0].o;
  const createChore = async (uidx, call) =>
    (await q(as(uidOf(uidx), `select * from public.create_chore(${call})`)))[0].create_chore;

  console.log('rotation pool: rotate among chosen people only');
  // pool = members 0 and 2; over 7 days only they own the chore, member 1 never
  const poolChore = await createChore(0,
    `'Water the ferns', null, null, true, false, null, 1, null, '18:00', null, null, array[${sqlValue(idOf(0))}, ${sqlValue(idOf(2))}]::uuid[]`);
  const owners = new Set();
  for (let i = 0; i < 7; i++) owners.add(await assigneeFor(poolChore, addDays(today, i)));
  ok('only pool members take turns', owners.size <= 2 && owners.has(idOf(0)) && owners.has(idOf(2)) && !owners.has(idOf(1)),
    [...owners].join(','));
  ok('pool alternates day to day', await assigneeFor(poolChore, today) !== await assigneeFor(poolChore, addDays(today, 1)));

  console.log('rotation pool: create_chore validation');
  await q(`delete from public.chores where id = ${sqlValue(poolChore)}`);
  let threw = false;
  try {
    await createChore(0, `'X', null, null, false, false, now(), 1, null, null, null, null, array[${sqlValue(idOf(0))}]::uuid[]`);
  } catch { threw = true; }
  ok('pool without rotate rejected', threw);
  threw = false;
  try {
    await createChore(0, `'X', null, null, true, false, null, 1, null, null, null, null, array['00000000-0000-0000-0000-000000000000']::uuid[]`);
  } catch { threw = true; }
  ok('pool with an outsider rejected', threw);

  console.log('weekly schedule: repeat_weekdays bitmask (bit 0 = Sunday)');
  // every Sunday and Tuesday
  const mask = (1 << 0) | (1 << 2);
  const weeklyChore = await createChore(1,
    `'Clean the porch', null, ${sqlValue(idOf(1))}, false, false, null, null, null, '09:00', null, null, null, ${sqlValue(mask)}::smallint`);
  const sunday = addDays(today, (7 - dow(today)) % 7 || 7);   // next Sunday
  const monday = addDays(sunday, 1);
  const tuesday = addDays(sunday, 2);
  ok('occurs on the picked weekdays', (await occursOn(weeklyChore, sunday)) === true && (await occursOn(weeklyChore, tuesday)) === true);
  ok('skips the other days', (await occursOn(weeklyChore, monday)) === false && (await occursOn(weeklyChore, today)) === (dow(today) === 0 || dow(today) === 2));

  console.log('schedule exclusivity');
  threw = false;
  try {
    await createChore(0, `'X', null, ${sqlValue(idOf(0))}, false, false, null, 1, null, null, null, null, null, ${mask}`);
  } catch { threw = true; }
  ok('two schedule fields rejected', threw);

  console.log('cleanup (scoped to the test household)');
  await q(`delete from public.households where id = ${sqlValue(H)}`);
  const left = (await q(`select count(*)::int as n from public.members where household_id = ${sqlValue(H)}`))[0].n;
  ok('household + members cascade-deleted', left === 0);
  await q(`delete from auth.users where email like 'pooltest-%@motor.test'`);
  const family = (await q(`select count(*)::int as n from public.households`))[0].n;
  ok('live household untouched', family >= 1);
} finally {
  for (const u of uids) await q(`delete from auth.users where id = ${sqlValue(u)}`).catch(() => {});
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
