// Scoped test for the creator lock: only a chore's creator may update or stop
// it. Like pool-weekday-test.mjs, this owns a throwaway household on the live
// project and deletes exactly itself afterwards. The family household is only
// read for the backfill check, never written.
import { query, sqlValue } from './mgmt.mjs';

let passed = 0, failed = 0;
const ok = (name, cond, detail = '') => cond ? (passed++, console.log(`  PASS ${name}`))
  : (failed++, console.error(`  FAIL ${name} ${detail}`));
const claims = (uuid) => sqlValue(JSON.stringify({ sub: uuid, role: 'authenticated' }));
// run a statement as one of the test members: RLS applies (role = authenticated)
const as = (uid, call) =>
  `select set_config('role', 'authenticated', false);\nselect set_config('request.jwt.claims', ${claims(uid)}, false);\n${call}`;
const q = async (sql) => query(sql);

const uids = [0, 1].map((i) => crypto.randomUUID());
const names = ['LockTest-Faraz', 'LockTest-Ayesha'];
try {
  for (let i = 0; i < uids.length; i++) {
    await q(`insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
             values (${sqlValue(uids[i])}, 'authenticated', 'authenticated', ${sqlValue(`locktest-${i}@motor.test`)}, now(), '{}', '{}')`);
  }
  const H = (await q(`insert into public.households (id) values (default) returning id`))[0].id;
  for (let i = 0; i < uids.length; i++) {
    await q(`insert into public.members (household_id, auth_uid, name, rotation_order)
             values (${sqlValue(H)}, ${sqlValue(uids[i])}, ${sqlValue(names[i])}, ${i})`);
  }
  const members = await q(`select id from public.members where household_id = ${sqlValue(H)} order by rotation_order`);
  const idOf = (i) => members[i].id;

  const createChore = async (uidx, title, assignee) =>
    // full 13-arg call so the overload can't be ambiguous
    (await q(as(uids[uidx], `select public.create_chore(${sqlValue(title)}::text, null::text, ${sqlValue(assignee)}::uuid,
      false::boolean, false::boolean, now(), null::int, null::int, '18:00'::time, null::int, null::numeric,
      null::uuid[], null::smallint)`)))[0].create_chore;
  // attempt a patch as one member, then read the row back as admin — the
  // mgmt API's returned rows can't tell a blocked update (0 rows) from the
  // set_config noise, so the read-back is the verdict
  const patchChore = async (uidx, choreId, set) => {
    await q(as(uids[uidx], `update public.chores set ${set} where id = ${sqlValue(choreId)}`));
    return (await q(`select * from public.chores where id = ${sqlValue(choreId)}`))[0];
  };

  const aChore = await createChore(0, 'LockTest A chore', idOf(1));
  const bChore = await createChore(1, 'LockTest B chore', idOf(0));

  console.log('creator lock on chores');
  ok('creator edits own chore',
    (await patchChore(0, aChore, `title = 'LockTest A renamed'`)).title === 'LockTest A renamed');
  ok('other member cannot edit it',
    (await patchChore(1, aChore, `title = 'hijacked'`)).title === 'LockTest A renamed');
  ok('other member cannot stop it',
    (await patchChore(1, aChore, `active = false`)).active === true);
  ok('creator stops own chore',
    (await patchChore(0, aChore, `active = false`)).active === false);
  let threw = false;
  try { await patchChore(0, aChore, `created_by = ${sqlValue(idOf(1))}`); }
  catch { threw = true; }
  ok('creator cannot hand the chore over', threw);

  console.log('a member who left loses the pen');
  await q(`update public.members set active = false where id = ${sqlValue(idOf(1))}`);
  ok('inactive member cannot edit own chore',
    (await patchChore(1, bChore, `title = 'x'`)).title === 'LockTest B chore');
  await q(`update public.members set active = true where id = ${sqlValue(idOf(1))}`);

  console.log('backfill: no chore without an owner');
  const orphaned = (await q(`select count(*)::int as n from public.chores where created_by is null`))[0].n;
  ok('every chore has created_by', orphaned === 0, `${orphaned} orphans`);

  console.log('cleanup (scoped to the test household)');
  await q(`delete from public.households where id = ${sqlValue(H)}`);
  const left = (await q(`select count(*)::int as n from public.chores where id in (${sqlValue(aChore)}, ${sqlValue(bChore)})`))[0].n;
  ok('household + chores cascade-deleted', left === 0);
  const family = (await q(`select count(*)::int as n from public.households`))[0].n;
  ok('live household untouched', family >= 1);
} finally {
  for (const u of uids) await q(`delete from auth.users where id = ${sqlValue(u)}`).catch(() => {});
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
