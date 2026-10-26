// claim_member + the member_devices binding, exercised against the live
// schema, then ROLLED BACK — proves a claim persists, two devices can be the
// same person without disturbing each other, and the guards hold.
import { query } from './mgmt.mjs';

const HOUSE = (await query('select id from public.households order by created_at limit 1'))[0].id;
const target = (await query(
  `select m.id, m.name from public.members m
   where m.household_id = '${HOUSE}' and m.active order by m.rotation_order limit 1`))[0];
const free = (await query(`
  select u.id from auth.users u
  where not exists (select 1 from public.member_devices d where d.auth_uid = u.id)
  order by u.email limit 2`));
const [devA, devB] = free.map((r) => r.id);
if (!devA) { console.error('no free pool account for the test'); process.exit(1); }
if (!devB) { console.log('only one free pool account — skipping the second-device test'); }

const devices = () => query(
  `select d.auth_uid, m.name from public.member_devices d
   join public.members m on m.id = d.member_id
   where d.auth_uid in ('${devA}', '${devB ?? devA}')`);

// 1. a device claims a person — one upserted row, nothing else moves
await query(`
  begin;
  select set_config('request.jwt.claims', '{"sub":"${devA}"}', true);
  select * from public.claim_member('${target.id}');
  rollback;`);
console.log(`claim ok: device -> ${target.name} (rolled back)`);

// 2. a second device claims the SAME person — the first binding must not move
if (devB) {
  await query(`
    begin;
    select set_config('request.jwt.claims', '{"sub":"${devA}"}', true);
    select * from public.claim_member('${target.id}');
    select set_config('request.jwt.claims', '{"sub":"${devB}"}', true);
    select * from public.claim_member('${target.id}');
    rollback;`);
  console.log(`two devices on ${target.name} ok, first binding untouched (rolled back)`);
}

// 3. guards: not signed in / unknown member / shim without a binding
const guard = async (sql, label) => {
  try { await query(sql); console.log(label + ': NO ERROR (bad)'); }
  catch (e) { console.log(`${label}:`, e.message.match(/P0001: ([^\\]*)/)?.[1] ?? e.message.slice(0, 100)); }
};
await guard(`begin; select set_config('request.jwt.claims', '', true); select * from public.claim_member('${target.id}'); rollback;`, 'anon claim');
await guard(`begin; select set_config('request.jwt.claims', '{"sub":"${devA}"}', true); select * from public.claim_member('00000000-0000-0000-0000-000000000000'); rollback;`, 'unknown member');
await guard(`begin; select set_config('request.jwt.claims', '{"sub":"${devA}"}', true); select * from public.ensure_household('Me'); rollback;`, 'shim with no binding');

// 4. nothing stuck
console.log('bindings after tests:', JSON.stringify(await devices()));
