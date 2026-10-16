import type { Chore, ChoreEvent, Member } from '../types';
import { TIMEZONE } from '../config';

/** "YYYY-MM-DD" for the household's timezone (the whole family shares it). */
export function localDate(now: Date = new Date(), timeZone: string = TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(now);
}

export function addDays(dateStr: string, n: number): string {
  return new Date(Date.parse(dateStr + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
}

/** Days since epoch. Must stay in lockstep with SQL rotation_assignment(). */
export function dayNumber(dateStr: string): number {
  return Math.floor(Date.parse(dateStr + 'T00:00:00Z') / 86400000);
}

export function activeMembersSorted(members: Member[]): Member[] {
  return members.filter((m) => m.active).sort((a, b) => a.rotation_order - b.rotation_order);
}

/** "HH:MM:SS" -> { hour, minute } */
export function parseTimeOfDay(t: string): { hour: number; minute: number } {
  const [h, m] = t.split(':');
  return { hour: Number(h), minute: Number(m) };
}

/** Karachi date of an ISO timestamp ("2026-10-16T18:00:00+05:00" -> "2026-10-16"). */
export function localDateOf(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date(iso));
}

/** Whether a chore is due on a date. Mirrors SQL occurs_on() exactly:
 *  one-offs on their due date, interval chores from their creation anchor,
 *  monthly chores on their day of month. */
export function occursOn(chore: Chore, dateStr: string): boolean {
  if (!chore.active) return false;
  if (chore.due_at) return localDateOf(chore.due_at) === dateStr;
  if (chore.repeat_days != null) {
    const anchor = dayNumber(localDateOf(chore.created_at));
    const day = dayNumber(dateStr);
    return day >= anchor && (day - anchor) % chore.repeat_days === 0;
  }
  if (chore.repeat_monthly_day != null) return Number(dateStr.slice(8, 10)) === chore.repeat_monthly_day;
  return false;
}

/** The occurrence after fromDateStr (exclusive), up to maxDays out. */
export function nextOccurrence(chore: Chore, fromDateStr: string, maxDays = 40): string | null {
  for (let i = 1; i <= maxDays; i++) {
    const d = addDays(fromDateStr, i);
    if (occursOn(chore, d)) return d;
  }
  return null;
}

export type ChoreOverrides = Record<string, string>;  // `${choreId}|${date}` -> member_id

export const overrideKey = (choreId: string, dateStr: string) => `${choreId}|${dateStr}`;

/** Who owes a chore on a date: per-occurrence override first, then rotation
 *  (per-chore offset so two rotating chores spread across members), then the
 *  fixed assignee. Mirrors SQL assignee_for(). */
export function assigneeFor(
  chore: Chore,
  dateStr: string,
  members: Member[],
  overrides: ChoreOverrides
): Member | null {
  const overridden = overrides[overrideKey(chore.id, dateStr)];
  if (overridden) {
    const m = members.find((x) => x.id === overridden);
    if (m) return m;
  }
  if (chore.rotate) {
    const active = activeMembersSorted(members);
    if (active.length === 0) return null;
    const idx = ((dayNumber(dateStr) + chore.rotation_offset) % active.length + active.length) % active.length;
    return active[idx] ?? null;
  }
  return members.find((x) => x.id === chore.assignee_member_id) ?? null;
}

/** The event for a chore occurrence, if any. */
export function eventFor(events: ChoreEvent[], choreId: string, dateStr: string): ChoreEvent | undefined {
  return events.find((e) => e.chore_id === choreId && e.on_date === dateStr);
}
