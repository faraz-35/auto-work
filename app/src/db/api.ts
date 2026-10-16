import type { Chore, ChoreEvent, Household, Member, Profile, Purchase, Swap } from '../types';
import { addDays, localDate, overrideKey, ChoreOverrides } from '../logic/rotation';
import { db } from './client';

export type HouseholdData = {
  household: Household;
  members: Member[];
  chores: Chore[];
  events: ChoreEvent[];
  overrides: ChoreOverrides;
  swaps: Swap[];
};

const WINDOW_PAST = 35;
const WINDOW_FUTURE = 35;

export async function fetchHouseholdData(householdId: string): Promise<HouseholdData> {
  const from = addDays(localDate(), -WINDOW_PAST);
  const to = addDays(localDate(), WINDOW_FUTURE);
  const [household, members, chores, events, assignments, swaps] = await Promise.all([
    db.from('households').select('*').eq('id', householdId).single(),
    db.from('members').select('*').eq('household_id', householdId).order('rotation_order'),
    db.from('chores').select('*').eq('household_id', householdId).eq('active', true),
    db.from('chore_events').select('*').eq('household_id', householdId)
      .gte('on_date', from).lte('on_date', to),
    db.from('chore_assignments').select('chore_id, on_date, member_id')
      .gte('on_date', from).lte('on_date', to),
    db.from('swap_requests').select('*').eq('household_id', householdId)
      .order('created_at', { ascending: false }).limit(50),
  ]);
  const firstError = household.error ?? members.error ?? chores.error ?? events.error ?? assignments.error ?? swaps.error;
  if (firstError) throw firstError;

  const overrides: ChoreOverrides = {};
  for (const a of assignments.data ?? []) overrides[overrideKey(a.chore_id, a.on_date)] = a.member_id;
  return {
    household: household.data,
    members: members.data ?? [],
    chores: chores.data ?? [],
    events: events.data ?? [],
    overrides,
    swaps: swaps.data ?? [],
  };
}

// ---- the no-login flow: claim device silently, get or create the household ----

export async function ensureHousehold(name: string): Promise<Profile> {
  const { data, error } = await db.rpc('ensure_household', { p_name: name });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return { householdId: row.out_household, memberId: row.out_member };
}

// ---- chores ----

export type ChoreDraft = {
  title: string;
  note?: string | null;
  assigneeMemberId?: string | null;
  rotate?: boolean;
  strict?: boolean;
  dueAt?: string | null;
  repeatDays?: number | null;
  repeatMonthlyDay?: number | null;
  timeOfDay?: string | null;
  durationMinutes?: number | null;
  amount?: number | null;
};

export async function createChore(draft: ChoreDraft): Promise<string> {
  const { data, error } = await db.rpc('create_chore', {
    p_title: draft.title,
    p_note: draft.note ?? null,
    p_assignee: draft.assigneeMemberId ?? null,
    p_rotate: draft.rotate ?? false,
    p_strict: draft.strict ?? false,
    p_due_at: draft.dueAt ?? null,
    p_repeat_days: draft.repeatDays ?? null,
    p_repeat_monthly_day: draft.repeatMonthlyDay ?? null,
    p_time_of_day: draft.timeOfDay ?? null,
    p_duration_minutes: draft.durationMinutes ?? null,
    p_amount: draft.amount ?? null,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row.create_chore;
}

export async function updateChore(choreId: string, patch: Partial<Chore>): Promise<void> {
  const { error } = await db.from('chores').update(patch).eq('id', choreId);
  if (error) throw error;
}

export async function startChore(choreId: string, date: string): Promise<string | null> {
  const { data, error } = await db.rpc('start_chore', { p_chore: choreId, p_on_date: date });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row?.start_chore ?? null;
}

export async function completeChore(choreId: string, date: string): Promise<void> {
  const { error } = await db.rpc('complete_chore', { p_chore: choreId, p_on_date: date });
  if (error) throw error;
}

export async function skipChore(choreId: string, date: string): Promise<void> {
  const { error } = await db.rpc('skip_chore', { p_chore: choreId, p_on_date: date });
  if (error) throw error;
}

// ---- swaps ----

export async function requestSwap(
  householdId: string, choreId: string, date: string, fromMemberId: string, toMemberId: string | null
): Promise<void> {
  const { error } = await db.from('swap_requests').insert({
    household_id: householdId,
    chore_id: choreId,
    on_date: date,
    from_member_id: fromMemberId,
    to_member_id: toMemberId,
    status: 'pending',
  });
  if (error) throw error;
}

export async function acceptSwap(requestId: string): Promise<void> {
  const { error } = await db.rpc('accept_swap', { p_request_id: requestId });
  if (error) throw error;
}

export async function cancelSwap(requestId: string): Promise<void> {
  const { error } = await db.rpc('cancel_swap', { p_request_id: requestId });
  if (error) throw error;
}

// ---- household + membership ----

export async function saveHouseholdSettings(
  householdId: string, patch: Partial<Pick<Household, 'snooze_minutes'>>
): Promise<void> {
  const { error } = await db.from('households').update(patch).eq('id', householdId);
  if (error) throw error;
}

export async function leaveHousehold(memberId: string): Promise<void> {
  const { error } = await db.from('members').update({ active: false }).eq('id', memberId);
  if (error) throw error;
}

// ---- the ledger ----

export async function fetchPurchases(householdId: string): Promise<Purchase[]> {
  const { data, error } = await db.from('purchases').select('*')
    .eq('household_id', householdId)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return data ?? [];
}

export async function addPurchase(
  householdId: string, memberId: string, item: string, amount: number
): Promise<Purchase> {
  const { data, error } = await db.from('purchases')
    .insert({ household_id: householdId, member_id: memberId, item, amount })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deletePurchase(purchaseId: string): Promise<void> {
  const { error } = await db.from('purchases').delete().eq('id', purchaseId);
  if (error) throw error;
}
