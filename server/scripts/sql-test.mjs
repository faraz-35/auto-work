// SQL-level logic test: runs the RPCs against the live database with faked
// request.jwt.claims (auth.uid() reads that GUC), so ensure/create/start/
// complete/swap behavior is verified independent of the auth provider. RLS
// itself is verified by api-test.mjs over REST. SQL goes over the Management
// API (one session per call), so the claims GUC is set in the same statement
// batch as every call that reads it.
import { query, sqlValue } from './mgmt.mjs';

let passed = 0, failed = 0;
const ok = (name, cond, detail = '') => cond ? (passed++, console.log(`  PASS ${name}`))
  : (failed++, console.error(`  FAIL ${name} ${detail}`));
const claims = (uuid) => sqlValue(JSON.stringify({ sub: uuid, role: 'authenticated' }));
const as = (uid, call) => `select set_config('request.jwt.claims', ${claims(uid)}, false);\n${call}`;
const q = async (sql) => query(sql);
const rpc = async (uid, call) => (await q(as(uid, call)))[0] ?? {};
const fails = async (name, sql) => {
  const r = await q(sql).then(() => true, () => false);
  ok(name, !r);
};

const uids = [1, 2, 3, 4].map(() => crypto.randomUUID());
const occupied = (await q('select count(*)::int as n from public.households'))[0].n;
if (occupied > 0) {
  console.error(`refusing: ${occupied} household(s) already exist — this test owns an empty dev DB only (it truncates households). Real data lives in the shared project now.`);
  process.exit(1);
}
await q('delete from public.households');  // dev DB: tests own the whole schema
await q(`delete from auth.users where email like 'sqltest-%@motor.test'`);
for (let i = 0; i < uids.length; i++) {
  await q(`insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
           values (${sqlValue(uids[i])}, 'authenticated', 'authenticated', ${sqlValue(`sqltest-${i}@motor.test`)}, now(), '{}', '{}')`);
}
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());
const addDays = (ds, n) => new Date(Date.parse(ds + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const dayNum = (ds) => Math.floor(Date.parse(ds + 'T00:00:00Z') / 86400000);

console.log('ensure_household: create + seed + join');
const h1 = await rpc(uids[0], `select * from public.ensure_household('Faraz')`);
ok('first device creates household', !!h1?.out_household && h1.out_created === true);
ok('creator is a member', !!h1?.out_member);
const seeded = await q(`select * from public.chores where household_id = ${sqlValue(h1.out_household)}`);
ok('motor chore seeded', seeded.length === 1 && seeded[0].title === 'Turn on the motor'
  && seeded[0].rotate && seeded[0].strict && seeded[0].repeat_days === 1
  && seeded[0].duration_minutes === 10 && seeded[0].rotation_offset === 0, JSON.stringify(seeded[0]));
const motorChore = seeded[0];

const joins = [];
for (let i = 1; i < 4; i++) {
  joins.push(await rpc(uids[i], `select * from public.ensure_household('${['Ayesha', 'Bilal', 'Usman'][i - 1]}')`));
}
ok('join x3 same household, not created', joins.every((j) => j.out_household === h1.out_household && j.out_created === false));
const H = h1.out_household;

console.log('ensure_household: idempotent + rejoin');
const again = await rpc(uids[1], `select * from public.ensure_household('Ayesha')`);
ok('second call returns same member', again.out_member === joins[0].out_member && again.out_created === false);
await q(`update public.members set active = false where id = ${sqlValue(joins[0].out_member)}`);
const rejoined = await rpc(uids[1], `select * from public.ensure_household('Ayesha K')`);
const renamed = await q(`select name from public.members where id = ${sqlValue(joins[0].out_member)}`);
ok('inactive member reactivated with new name', rejoined.out_member === joins[0].out_member && renamed[0].name === 'Ayesha K');
await q(`update public.members set active = true, name = 'Ayesha' where id = ${sqlValue(joins[0].out_member)}`);

const members = await q(`select id, name from public.members where household_id = ${sqlValue(H)} order by rotation_order`);
ok('4 members in join order', members.length === 4 && members[0].name === 'Faraz' && members[3].name === 'Usman');

console.log('rotation: per-chore offset');
// JS mirror of occurs_on + assignee_for (daily chores anchored today)
const jsAssignee = (offset, ds) => members[(((dayNum(ds) + offset) % members.length) + members.length) % members.length].id;
const motorToday = (await q(`select public.assignee_for(${sqlValue(motorChore.id)}, ${sqlValue(today)}::date) as a`))[0].a;
ok('motor rotation matches day-number formula', motorToday === jsAssignee(0, today));

const dishesId = (await rpc(uids[0],
  `select * from public.create_chore('Wash dishes', null, null, true, false, null, 1, null, '20:00', null, null)`)).create_chore;
const dishes = (await q(`select * from public.chores where id = ${sqlValue(dishesId)}`))[0];
ok('second rotating chore got offset 1', dishes.rotation_offset === 1);
const dishesToday = (await q(`select public.assignee_for(${sqlValue(dishesId)}, ${sqlValue(today)}::date) as a`))[0].a;
ok('offset splits duties across members', dishesToday !== motorToday);
ok('occurs_on anchors to creation day',
  (await q(`select public.occurs_on(${sqlValue(dishesId)}, ${sqlValue(addDays(today, 1))}::date) as o`))[0].o === true
  && (await q(`select public.occurs_on(${sqlValue(dishesId)}, ${sqlValue(addDays(today, -1))}::date) as o`))[0].o === false);

console.log('create_chore: one-off (bill) + validation');
const dueAt = `${addDays(today, 2)}T18:00:00+05:00`;
const billId = (await rpc(uids[0],
  `select * from public.create_chore('Pay electricity', 'KE bill', ${sqlValue(members[0].id)}, false, true, ${sqlValue(dueAt)}, null, null, null, null, 4500)`)).create_chore;
const bill = (await q(`select * from public.chores where id = ${sqlValue(billId)}`))[0];
ok('bill chore stored with amount + strict', bill.amount == 4500 && bill.strict && bill.assignee_member_id === members[0].id);
ok('bill occurs on its due date only',
  (await q(`select public.occurs_on(${sqlValue(billId)}, ${sqlValue(addDays(today, 2))}::date) as o`))[0].o === true
  && (await q(`select public.occurs_on(${sqlValue(billId)}, ${sqlValue(addDays(today, 3))}::date) as o`))[0].o === false);
await fails('unassigned non-rotating rejected',
  as(uids[0], `select public.create_chore('X', null, null, false, false, now(), null, null, null, null, null)`));
await fails('two schedule fields rejected',
  as(uids[0], `select public.create_chore('X', null, ${sqlValue(members[0].id)}, false, false, now(), 7, 3, null, null, null)`));
await fails('foreign assignee rejected',
  as(uids[0], `select public.create_chore('X', null, ${sqlValue(crypto.randomUUID())}, false, false, now(), null, null, null, null, null)`));
const monthlyId = (await rpc(uids[1],
  `select * from public.create_chore('Pay internet', null, ${sqlValue(members[1].id)}, false, true, null, null, 25, '09:00', null, null)`)).create_chore;
let day25 = null;
for (let i = 1; i <= 40 && !day25; i++) { const d = addDays(today, i); if (Number(d.slice(8)) === 25) day25 = d; }
ok('monthly chore occurs on day 25',
  (await q(`select public.occurs_on(${sqlValue(monthlyId)}, ${sqlValue(day25)}::date) as o`))[0].o === true
  && (await q(`select public.occurs_on(${sqlValue(monthlyId)}, ${sqlValue(addDays(day25, 1))}::date) as o`))[0].o === false);

console.log('start_chore: spawns close chore');
const starterUidx = members.findIndex((m) => m.id === motorToday);
const spawnId = (await rpc(uids[starterUidx],
  `select * from public.start_chore(${sqlValue(motorChore.id)}, ${sqlValue(today)}::date)`)).start_chore;
ok('close chore spawned', !!spawnId);
const spawn = (await q(`select * from public.chores where id = ${sqlValue(spawnId)}`))[0];
const evt = (await q(`select * from public.chore_events where chore_id = ${sqlValue(motorChore.id)} and on_date = ${sqlValue(today)}`))[0];
ok('event started with attribution', evt.status === 'started' && evt.started_by === motorToday && evt.started_at);
ok('spawn is strict one-off for starter', spawn.title === 'Close: Turn on the motor' && spawn.strict
  && spawn.assignee_member_id === motorToday && spawn.spawned_from === evt.id && spawn.due_at && !spawn.repeat_days);
ok('spawn deadline ~ now + duration', Math.abs(Date.parse(spawn.due_at) - Date.now() - 10 * 60000) < 120000, spawn.due_at);

console.log('complete_chore: parent stamped');
await q(as(uids[starterUidx], `select public.complete_chore(${sqlValue(spawnId)}, ${sqlValue(today)}::date)`));
const evtAfter = (await q(`select * from public.chore_events where id = ${sqlValue(evt.id)}`))[0];
ok('close completion done', (await q(`select status from public.chore_events where chore_id = ${sqlValue(spawnId)}`))[0].status === 'done');
ok('parent occurrence stamped done', evtAfter.status === 'done' && evtAfter.done_by === motorToday);

console.log('skip_chore');
await q(as(uids[0], `select public.skip_chore(${sqlValue(dishesId)}, ${sqlValue(today)}::date)`));
ok('occurrence skipped', (await q(`select status from public.chore_events where chore_id = ${sqlValue(dishesId)} and on_date = ${sqlValue(today)}`))[0].status === 'skipped');

console.log('swap two-way on rotating chore');
// find an upcoming date where dishes belong to member[1]; member[2] accepts
let swapDay = null;
for (let i = 1; i <= 10; i++) {
  const d = addDays(today, i);
  const owner = (await q(`select public.assignee_for(${sqlValue(dishesId)}, ${sqlValue(d)}::date) as a`))[0].a;
  if (owner === members[1].id) { swapDay = d; break; }
}
ok('found upcoming dishes date for member 2', !!swapDay);
await q(as(uids[1], `insert into public.swap_requests (household_id, chore_id, on_date, from_member_id, status)
                    values (${sqlValue(H)}, ${sqlValue(dishesId)}, ${sqlValue(swapDay)}, ${sqlValue(members[1].id)}, 'pending')`));
const reqId = (await q(`select id from public.swap_requests order by created_at desc limit 1`))[0].id;
const acc = await rpc(uids[2], `select * from public.accept_swap(${sqlValue(reqId)})`);
ok('swap accepted', acc?.out_covered_by === members[2].id && !!acc?.out_payback_date);
ok('swap day reassigned to accepter',
  (await q(`select public.assignee_for(${sqlValue(dishesId)}, ${sqlValue(swapDay)}::date) as a`))[0].a === members[2].id);
ok('payback day assigned to requester',
  (await q(`select public.assignee_for(${sqlValue(dishesId)}, ${sqlValue(acc.out_payback_date)}::date) as a`))[0].a === members[1].id);
await fails('double accept rejected', as(uids[2], `select public.accept_swap(${sqlValue(reqId)})`));
await fails('cancel after resolution rejected', as(uids[1], `select public.cancel_swap(${sqlValue(reqId)})`));

console.log('purchases');
await q(`insert into public.purchases (household_id, member_id, item, amount) values (${sqlValue(H)}, ${sqlValue(members[0].id)}, 'Groceries', 3250.50)`);
await fails('non-positive amount rejected',
  `insert into public.purchases (household_id, member_id, item, amount) values (${sqlValue(H)}, ${sqlValue(members[0].id)}, 'X', 0)`);
ok('purchase stored', (await q(`select count(*)::int as n from public.purchases`))[0].n === 1);

console.log('ping + cleanup');
ok('ping() returns timestamp', !!(await q(`select public.ping() as p`))[0]?.p);
await q(`delete from public.households where id = ${sqlValue(H)}`);
let left = 0;
for (const t of ['chores', 'chore_events', 'chore_assignments', 'swap_requests', 'purchases', 'members']) {
  left += (await q(`select count(*)::int as n from public.${t}`))[0].n;
}
ok('cascade cleanup', left === 0, `left=${left}`);
await q(`delete from auth.users where email like 'sqltest-%@motor.test'`);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
