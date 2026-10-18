import type { Chore, ChoreEvent, Member } from '../types';
import { TZ_OFFSET } from '../config';
import { assigneeFor, eventFor, localDate, nextOccurrence, occursOn, parseTimeOfDay, ChoreOverrides } from './rotation';

export type AlarmSpec = {
  id: string;          // `${choreId}:${date}` — stable across phones and reboots
  atMs: number;
  title: string;
  body: string;
  rechain: boolean;    // recurring: native re-arms +24h after firing until JS corrects
};

/** Epoch ms of a chore's deadline on a date (Karachi, UTC+5, no DST). */
export function deadlineMs(chore: Chore, dateStr: string): number {
  if (chore.due_at) return Date.parse(chore.due_at);
  const { hour, minute } = parseTimeOfDay(chore.time_of_day);
  return Date.parse(`${dateStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00${TZ_OFFSET}`);
}

function alarmBody(chore: Chore, member: Member): string {
  const when = chore.due_at != null
    ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit' }).format(new Date(chore.due_at))
    : chore.time_of_day.slice(0, 5);
  return `Due by ${when} · ${member.name}`;
}

/**
 * Pure derivation of the alarms this phone should be armed with: strict
 * deadlines of chores assigned to me (today, plus the next occurrence of
 * recurring ones so they survive unopened apps). Every phone computes this
 * from shared state, so exactly the assignee's phone rings.
 */
export function computeDesiredAlarms(
  me: Member | null,
  members: Member[],
  chores: Chore[],
  events: ChoreEvent[],
  overrides: ChoreOverrides,
  now: number = Date.now()
): AlarmSpec[] {
  if (!me) return [];
  const today = localDate(new Date(now));
  const out: AlarmSpec[] = [];

  const push = (chore: Chore, dateStr: string, member: Member) => {
    const atMs = deadlineMs(chore, dateStr);
    if (atMs <= now) return;  // never ring for the past
    out.push({
      id: `${chore.id}:${dateStr}`,
      atMs,
      title: chore.title,
      body: alarmBody(chore, member),
      rechain: chore.due_at == null,
    });
  };

  for (const chore of chores) {
    if (!chore.strict || !chore.active) continue;

    if (occursOn(chore, today)) {
      if (eventFor(events, chore.id, today)) continue;  // started/done/skipped — already handled
      const member = assigneeFor(chore, today, members, overrides);
      if (member?.id === me.id) push(chore, today, member);
    }

    if (chore.due_at == null) {
      // arm the next occurrence too (it may belong to someone else; then only
      // their phone arms it) so daily strict chores ring even if the app is
      // never opened again
      const next = nextOccurrence(chore, today);
      if (next && !eventFor(events, chore.id, next)) {
        const member = assigneeFor(chore, next, members, overrides);
        if (member?.id === me.id) push(chore, next, member);
      }
    }
  }

  return out.sort((a, b) => a.atMs - b.atMs).slice(0, 8);
}

export function formatRemaining(ms: number): string {
  const s = Math.round(ms / 1000);
  const abs = Math.abs(s);
  const m = Math.floor(abs / 60);
  const r = abs % 60;
  const body = `${m}:${String(r).padStart(2, '0')}`;
  return s < 0 ? `+${body}` : body;
}

/** The JSON contract of the native syncAlarms call: {"<id>": {at, title, body, rechain}}. */
export function alarmsToNativeJson(alarms: AlarmSpec[]): string {
  const root: Record<string, { at: number; title: string; body: string; rechain: boolean }> = {};
  for (const a of alarms) root[a.id] = { at: a.atMs, title: a.title, body: a.body, rechain: a.rechain };
  return JSON.stringify(root);
}
