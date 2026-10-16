// End-to-end backend test against the live Supabase project, over the same
// surfaces the app uses: device-pool auth -> RPCs -> REST reads/writes under
// RLS. Wipes throwaway households and releases pool claims first (dev DB only).
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const env = {};
for (const line of (await readFile(join(here, '../.env'), 'utf8')).split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const URL_ = process.env.SUPABASE_URL ?? env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY ?? env.SUPABASE_ANON_KEY;

let passed = 0, failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  PASS ${name}`); }
  else { failed++; console.error(`  FAIL ${name} ${detail}`); }
};

async function sb(path, { method = 'GET', token, body, query } = {}) {
  const qs = query ? '?' + new URLSearchParams(query).toString() : '';
  const res = await fetch(`${URL_}/rest/v1/${path}${qs}`, {
    method,
    headers: {
      apikey: ANON,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* error payloads are plain text sometimes */ }
  return { status: res.status, json, text };
}

const rpc = async (fn, token, params) => {
  const r = await sb(`rpc/${fn}`, { method: 'POST', token, body: params });
  return { ...r, row: Array.isArray(r.json) ? r.json[0] ?? null : r.json };
};

/** Scalar-returning RPCs arrive as bare JSON values (or array-wrapped rows). */
const scalarOf = (r, key) => (Array.isArray(r.json) ? r.json[0]?.[key] : r.json);

async function anonDevice() {
  const claim = await sb('rpc/claim_device_account', { method: 'POST', token: null, body: {} });
  const account = Array.isArray(claim.json) ? claim.json[0] : claim.json;
  if (claim.status !== 200 || !account?.email) throw new Error(`pool claim failed (${claim.status}): ${claim.text}`);
  const res = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: account.email, password: account.password }),
  });
  if (!res.ok) throw new Error(`password grant failed (${res.status}): ${await res.text()}`);
  const { access_token } = await res.json();
  return access_token;
}

// Karachi-day helpers mirroring app/src/logic/rotation.ts and the SQL.
const karachiToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());
const addDays = (ds, n) => new Date(Date.parse(ds + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const dayNumber = (ds) => Math.floor(Date.parse(ds + 'T00:00:00Z') / 86400);
const rotAssign = (offset, ds, members) => members[((dayNumber(ds) + offset) % members.length + members.length) % members.length];

// ---- fixtures: wipe throwaway households + release pool claims (dev DB only) ----
{
  const { query } = await import('./mgmt.mjs');
  await query('delete from public.households');
  await query('select public.release_device_pool()');
}

// ---- run ----
console.log('devices: pool claim x5');
const tokens = [];
for (let i = 0; i < 5; i++) tokens.push(await anonDevice());
ok('five pool devices', tokens.length === 5 && tokens.every(Boolean));

console.log('ensure_household: no-login flow');
const names = ['Faraz', 'Ayesha', 'Bilal', 'Usman'];
const first = await rpc('ensure_household', tokens[0], { p_name: names[0] });
ok('first device creates + seeds', first.status === 200 && first.row?.out_created === true && !!first.row?.out_household, first.text);
const H = first.row.out_household;
const joins = [];
for (let i = 1; i <= 3; i++) joins.push(await rpc('ensure_household', tokens[i], { p_name: names[i] }));
ok('next devices join silently', joins.every((j) => j.status === 200 && j.row?.out_household === H && j.row?.out_created === false),
  joins.map((j) => j.text).join(' | '));
const outsider = tokens[4];

const membersRes = await sb('members', { token: tokens[1], query: { select: '*', order: 'rotation_order.asc' } });
ok('members readable, 4, ordered by join', membersRes.status === 200 && membersRes.json.length === 4
  && membersRes.json.every((m, i) => m.rotation_order === i), membersRes.text);
const members = membersRes.json;
const tokenByMember = new Map(members.map((m, i) => [m.id, tokens[i]]));

console.log('chores: seed visible, create one-off bill');
const choresRes = await sb('chores', { token: tokens[0], query: { select: '*' } });
const motor = choresRes.json.find((ch) => ch.title === 'Turn on the motor');
ok('motor chore seeded + visible', choresRes.status === 200 && !!motor && motor.rotate && motor.strict, choresRes.text);

const billRes = await rpc('create_chore', tokens[0], {
  p_title: 'Pay electricity', p_note: 'KE bill', p_assignee: members[1].id, p_rotate: false, p_strict: true,
  p_due_at: `${addDays(karachiToday(), 2)}T18:00:00+05:00`, p_repeat_days: null, p_repeat_monthly_day: null,
  p_time_of_day: null, p_duration_minutes: null, p_amount: 4500,
});
const billId = scalarOf(billRes, 'create_chore');
ok('bill chore created', billRes.status === 200 && !!billId, billRes.text);

console.log('motor lifecycle: start spawns close chore, complete stamps parent');
const today = karachiToday();
const todays = rotAssign(0, today, members);
const startRes = await rpc('start_chore', tokenByMember.get(todays.id), { p_chore: motor.id, p_on_date: today });
const spawnId = scalarOf(startRes, 'start_chore');
ok('start_chore returns spawn id', startRes.status === 200 && !!spawnId, startRes.text);
const spawnRes = await sb('chores', { token: tokens[2], query: { select: '*', id: `eq.${spawnId}` } });
const spawn = spawnRes.json[0];
ok('close chore spawned strict for starter', spawnRes.status === 200 && spawn?.strict === true
  && spawn.assignee_member_id === todays.id && spawn.spawned_from !== null, spawnRes.text);

const doneRes = await rpc('complete_chore', tokenByMember.get(todays.id), { p_chore: spawn.id, p_on_date: today });
ok('close chore completed', doneRes.status >= 200 && doneRes.status < 300, doneRes.text);
const evts = await sb('chore_events', { token: tokens[0], query: { select: '*', chore_id: `eq.${motor.id}`, on_date: `eq.${today}` } });
ok('parent occurrence stamped done', evts.json[0]?.status === 'done' && evts.json[0]?.done_by === todays.id, evts.text);

console.log('swap flow (two-way, per-chore)');
const plantsRes = await rpc('create_chore', tokens[0], {
  p_title: 'Water the plants', p_note: null, p_assignee: null, p_rotate: true, p_strict: false,
  p_due_at: null, p_repeat_days: 1, p_repeat_monthly_day: null, p_time_of_day: '18:00',
  p_duration_minutes: null, p_amount: null,
});
const plants = scalarOf(plantsRes, 'create_chore');
const plantsChore = (await sb('chores', { token: tokens[0], query: { select: '*', id: `eq.${plants}` } })).json[0];
ok('second rotating chore offset 1', plantsChore?.rotation_offset === 1, JSON.stringify(plantsChore));

let swapDay = null;
for (let i = 1; i <= 10 && !swapDay; i++) {
  const d = addDays(today, i);
  if (rotAssign(1, d, members).id === members[1].id) swapDay = d;
}
const reqRes = await sb('swap_requests', {
  method: 'POST', token: tokenByMember.get(members[1].id),
  body: [{ household_id: H, chore_id: plants, on_date: swapDay, from_member_id: members[1].id, status: 'pending' }],
});
ok('swap request created via REST', reqRes.status === 201, reqRes.text);
const accRes = await rpc('accept_swap', tokenByMember.get(members[2].id), { p_request_id: reqRes.json[0].id });
ok('swap accepted with payback', accRes.status === 200 && !!accRes.row?.out_payback_date, accRes.text);
const assigns = await sb('chore_assignments', { token: tokens[0], query: { select: '*', chore_id: `eq.${plants}` } });
const byDate = Object.fromEntries(assigns.json.map((a) => [a.on_date, a.member_id]));
ok('cover day reassigned to accepter', byDate[swapDay] === members[2].id, JSON.stringify(byDate));
ok('payback day assigned to requester', byDate[accRes.row.out_payback_date] === members[1].id);
const dupAccept = await rpc('accept_swap', tokenByMember.get(members[2].id), { p_request_id: reqRes.json[0].id });
ok('double-accept rejected', dupAccept.status >= 400, dupAccept.text);

console.log('ledger: purchases');
const postRes = await sb('purchases', {
  method: 'POST', token: tokenByMember.get(members[3].id),
  body: [{ household_id: H, member_id: members[3].id, item: 'Groceries', amount: 3250.5 }],
});
ok('purchase logged', postRes.status === 201 && postRes.json[0].amount == 3250.5, postRes.text);
const delRes = await sb('purchases', { method: 'DELETE', token: tokens[0], query: { id: `eq.${postRes.json[0].id}` } });
ok('any member can delete a purchase', delRes.status === 204, delRes.text);

console.log('settings');
const setRes = await sb('households', { method: 'PATCH', token: tokens[2], query: { id: `eq.${H}` }, body: { snooze_minutes: 7 } });
ok('snooze updatable by any member', setRes.status === 200 && setRes.json[0].snooze_minutes === 7, setRes.text);
await sb('households', { method: 'PATCH', token: tokens[0], query: { id: `eq.${H}` }, body: { snooze_minutes: 5 } });

console.log('RLS isolation + anon ping');
const outChores = await sb('chores', { token: outsider, query: { select: '*' } });
ok('outsider sees no chores', outChores.status === 200 && outChores.json.length === 0);
const outMembers = await sb('members', { token: outsider, query: { select: '*' } });
ok('outsider sees no members', outMembers.status === 200 && outMembers.json.length === 0);
const outWrite = await sb('chores', { method: 'POST', token: outsider,
  body: [{ household_id: H, title: 'Evil', rotate: false, assignee_member_id: members[0].id, due_at: '2027-01-01T00:00:00Z' }] });
ok('outsider cannot write chores', outWrite.status >= 400);
const outPurchase = await sb('purchases', { method: 'POST', token: outsider,
  body: [{ household_id: H, member_id: members[0].id, item: 'Evil', amount: 1 }] });
ok('outsider cannot write purchases', outPurchase.status >= 400);
const anonPing = await sb('rpc/ping', { method: 'POST', token: null, body: {} });
ok('ping() reachable anonymously (keep-alive target)', anonPing.status === 200 && !!anonPing.json, anonPing.text);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
