import type { Chore, ChoreEvent, Member } from '../types';
import { deadlineMs } from '../logic/alarms';
import { formatDay, formatTime12, formatTimeOf } from '../logic/human';
import {
  assigneeFor, eventFor, localDate, localDateOf, nextOccurrence, occursOn,
  type ChoreOverrides,
} from '../logic/rotation';

const MINUTE = 60_000;

export type ReminderSpec = { id: string; atMs: number; title: string; body: string };

/** Quiet nudge points around a deadline: 30 and 10 minutes before, and an
 *  hour after (when it's still open). */
const SOON = [
  { kind: 'm30', minutes: 30, left: '30 min left' },
  { kind: 'm10', minutes: 10, left: '10 min left' },
] as const;
const LATE_KIND = 'late';

/** "6:00 PM" — the chore's deadline time of day. */
export function dueLabel(chore: Chore): string {
  return chore.due_at ? formatTimeOf(chore.due_at) : formatTime12(chore.time_of_day);
}

/**
 * The quiet reminders this phone should hold for chores assigned to me:
 * today's occurrences plus each recurring chore's next one. Done, skipped and
 * other people's occurrences get nothing.
 */
export function computeReminders(
  me: Member | null,
  members: Member[],
  chores: Chore[],
  events: ChoreEvent[],
  overrides: ChoreOverrides,
  now: number = Date.now()
): ReminderSpec[] {
  if (!me) return [];
  const today = localDate(new Date(now));
  const out: ReminderSpec[] = [];

  const push = (chore: Chore, dateStr: string) => {
    const atMs = deadlineMs(chore, dateStr);
    const due = dueLabel(chore);
    for (const s of SOON) {
      const at = atMs - s.minutes * MINUTE;
      if (at > now) {
        out.push({ id: `${chore.id}:${dateStr}:${s.kind}`, atMs: at, title: chore.title, body: `Due by ${due} · ${s.left}` });
      }
    }
    const late = atMs + 60 * MINUTE;
    if (late > now) {
      out.push({ id: `${chore.id}:${dateStr}:${LATE_KIND}`, atMs: late, title: chore.title, body: `Was due by ${due} · still open` });
    }
  };

  for (const chore of chores) {
    if (!chore.active) continue;
    const dates = chore.due_at
      ? [localDateOf(chore.due_at)]
      : [today, nextOccurrence(chore, today)].filter((d): d is string => d != null && occursOn(chore, d));
    for (const dateStr of dates) {
      if (eventFor(events, chore.id, dateStr)) continue;
      if (assigneeFor(chore, dateStr, members, overrides)?.id !== me.id) continue;
      push(chore, dateStr);
    }
  }

  return out.sort((a, b) => a.atMs - b.atMs).slice(0, 24);
}

/** The JSON contract of the native syncReminders call: {"<id>": {at, title, body}}. */
export function remindersToNativeJson(reminders: ReminderSpec[]): string {
  const root: Record<string, { at: number; title: string; body: string }> = {};
  for (const r of reminders) root[r.id] = { at: r.atMs, title: r.title, body: r.body };
  return JSON.stringify(root);
}

/** Chores handed to me by name (one row per person — rotate covers the rest). */
export function myFixedChores(chores: Chore[], me: Member): Chore[] {
  return chores.filter((c) => c.active && !c.rotate && c.assignee_member_id === me.id);
}

/** Of those, the ones this phone has never announced (never the ones I made). */
export function freshAssignments(chores: Chore[], me: Member, seen: Set<string>): Chore[] {
  return myFixedChores(chores, me).filter((c) => !seen.has(c.id) && c.created_by !== me.id);
}

/** Lockscreen copy for a chore that just landed on me. */
export function assignmentAlert(chore: Chore, creator: Member | null, today: string): { title: string; body: string } {
  const dueDate = chore.due_at ? localDateOf(chore.due_at) : today;
  const by = creator ? `${creator.name} added this for you` : 'Added for you';
  return { title: chore.title, body: `${by} · due ${formatDay(dueDate, today)}, ${dueLabel(chore)}` };
}
