// Drops the app schema + functions wholesale. Dev tool: pairs with `npm run migrate`
// to reapply migrations from scratch (all data is destroyed; run seed-pool after).
import { query } from './mgmt.mjs';

for (const sql of [
  'drop table if exists _migrations',
  'drop table if exists public.chores, public.chore_events, public.chore_assignments, public.assignments, public.runs, public.swap_requests, public.purchases, public.households, public.members, public.device_accounts cascade',
  'drop function if exists public.ensure_household(text), public.create_chore(text, text, uuid, boolean, boolean, timestamptz, int, int, time, int, numeric), public.start_chore(uuid, date), public.complete_chore(uuid, date), public.skip_chore(uuid, date), public.accept_swap(uuid), public.cancel_swap(uuid) cascade',
  'drop function if exists public.occurs_on(uuid, date), public.rotation_assignment(uuid, date), public.effective_assignment(uuid, date), public.assignee_for(uuid, date), public.ping(), public.claim_device_account(), public.release_device_pool() cascade',
  'drop function if exists public.is_member(uuid) cascade',
]) await query(sql);
console.log('reset done');
