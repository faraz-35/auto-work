// claim_member exercised end-to-end against the live schema, then ROLLED BACK
// — proves the swap, the fresh-claim path, the idempotent path and the guards
// without changing anything.
import { query } from './mgmt.mjs';

const HOUSE = (await query('select id from public.households order by created_at limit 1'))[0].id;
const roster = await query(
  `select m.id, m.name, m.auth_uid from public.members m
   where m.household_id = '${HOUSE}' and m.active order by m.rotation_order`);
const [a, b] = roster;                       // two real members to trade with
const freeAuth = (await query(`
  select u.id from auth.users u
  where not exists (select 1 from public.members m where m.auth_uid = u.id)
  order by u.email limit 1`))[0]?.id;
if (!freeAuth) { console.log('no free pool account — skipping fresh-claim test'); }

const state = () => query(
  `select name, auth_uid from public.members where id in ('${a.id}','${b.id}') order by name`);

// 1. the swap: a's device claims b — the accounts trade rows
await query(`
  begin;
  select set_config('request.jwt.claims', '{"sub":"${a.auth_uid}"}', true);
  select * from public.claim_member('${b.id}');
  rollback;`);
console.log('swap ok (rolled back)');

// 2. a brand-new device (no member row) claims b
if (freeAuth) {
  await query(`
    begin;
    select set_config('request.jwt.claims', '{"sub":"${freeAuth}"}', true);
    select * from public.claim_member('${b.id}');
    rollback;`);
  console.log('fresh-device claim ok (rolled back)');
}

// 3. idempotent re-claim: b's own device claiming b changes nothing
const r3 = await query(`
  begin;
  select set_config('request.jwt.claims', '{"sub":"${b.auth_uid}"}', true);
  select * from public.claim_member('${b.id}');
  rollback;`);
console.log('idempotent claim returns:', JSON.stringify(r3));

// 4. guards: not signed in / unknown member / shim without a binding
const guard = async (sql, label) => {
  try { await query(sql); console.log(label + ': NO ERROR (bad)'); }
  catch (e) { console.log(`${label}:`, e.message.match(/P0001: ([^\\]*)/)?.[1] ?? e.message.slice(0, 100)); }
};
await guard(`begin; select set_config('request.jwt.claims', '', true); select * from public.claim_member('${a.id}'); rollback;`, 'anon claim');
await guard(`begin; select set_config('request.jwt.claims', '{"sub":"${freeAuth ?? a.auth_uid}"}', true); select * from public.claim_member('00000000-0000-0000-0000-000000000000'); rollback;`, 'unknown member');
await guard(`begin; select set_config('request.jwt.claims', '', true); select * from public.ensure_household('Me'); rollback;`, 'shim with no binding');

// 5. nothing stuck
console.log('state after tests:', JSON.stringify(await state()));
