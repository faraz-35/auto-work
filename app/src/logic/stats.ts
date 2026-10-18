import type { Chore, ChoreEvent, Member } from '../types';
import { ChoreOverrides, addDays, assigneeFor, eventFor, localDateOf, occursOn } from './rotation';

export type ChoreState = 'done' | 'missed' | 'skipped' | 'open';

export type FeedEntry = {
  id: string;
  date: string;
  status: ChoreState | 'started';
  at: string | null;
  by: string | null;
  choreId: string;
};

export type MemberScore = {
  member: Member;
  assigned: number;
  done: number;
  missed: number;
};

export type HouseStats = {
  assigned: number;
  done: number;
  missed: number;     // past occurrence with nothing recorded
  skipped: number;
  left: number;       // open on the `to` day (still doable)
  byDay: { date: string; done: number }[];
  byMember: MemberScore[];
  feed: FeedEntry[];
};

/** Whole-house aggregation over an inclusive date range — the one source for
 *  the Today and Analytics screens. Scores only count chores that are active
 *  now; done/skipped events on since-stopped chores still show in totals and
 *  the feed, but never charge anyone a miss. `status` narrows everything to
 *  one chore state (missed occurrences get feed entries too — they have no
 *  event of their own). */
export function houseStats(input: {
  chores: Chore[];
  events: ChoreEvent[];
  members: Member[];
  overrides: ChoreOverrides;
  from: string;
  to: string;
  memberId?: string | null;
  choreId?: string | null;
  status?: ChoreState | null;
}): HouseStats {
  const { chores, events, members, overrides, from, to, memberId, choreId, status } = input;

  const doneByDay = new Map<string, number>();
  const allDays: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) allDays.push(d);

  const scores = new Map<string, MemberScore>();
  for (const m of members) {
    if (m.active) scores.set(m.id, { member: m, assigned: 0, done: 0, missed: 0 });
  }

  const totals = { assigned: 0, done: 0, missed: 0, skipped: 0, left: 0 };
  const feed: FeedEntry[] = [];

  for (const chore of chores) {
    if (choreId && chore.id !== choreId) continue;
    const createdDay = localDateOf(chore.created_at);

    for (const d of allDays) {
      if (d < createdDay) continue;
      const ev = eventFor(events, chore.id, d);

      if (!chore.active) {
        // stopped chores keep their history visible, nothing more
        if (ev && (ev.status === 'done' || ev.status === 'skipped')) {
          if (status && status !== ev.status) continue;
          if (memberId && ev.done_by !== memberId) continue;
          recordFinal(ev.status, ev, d, null);
        }
        continue;
      }
      if (!occursOn(chore, d)) continue;

      const assignee = assigneeFor(chore, d, members, overrides);
      if (!assignee) continue;
      if (memberId && assignee.id !== memberId) continue;

      const openDay = d === to;
      const state: ChoreState =
        ev?.status === 'done' ? 'done'
        : ev?.status === 'skipped' ? 'skipped'
        : openDay ? 'open'
        : 'missed';

      totals.assigned++;
      const score = scores.get(assignee.id);
      if (score) score.assigned++;

      if (status && state !== status) continue;
      if ((status ?? 'done') === state) doneByDay.set(d, (doneByDay.get(d) ?? 0) + 1);

      if (state === 'done' || state === 'skipped') {
        recordFinal(state, ev!, d, score);
      } else {
        if (state === 'missed') {
          totals.missed++;
          if (score) score.missed++;
        } else {
          totals.left++;
        }

        if (ev?.status === 'started') {
          // in-progress work speaks for itself in the feed
          if (!status || status === 'open') {
            feed.push({ id: ev.id, date: d, status: 'started', at: ev.started_at, by: ev.started_by, choreId: chore.id });
          }
        } else if (status != null) {
          // filtered to a state that has no event of its own: the occurrence
          // speaks through the assignee
          feed.push({ id: `${chore.id}|${d}`, date: d, status: state, at: null, by: assignee.id, choreId: chore.id });
        }
      }
    }
  }

  function recordFinal(
    state: 'done' | 'skipped',
    ev: ChoreEvent,
    d: string,
    score: MemberScore | null | undefined
  ) {
    if (state === 'done') {
      totals.done++;
      if (score) score.done++;
    } else {
      totals.skipped++;
    }
    feed.push({ id: ev.id, date: d, status: state, at: ev.done_at, by: ev.done_by, choreId: ev.chore_id });
  }

  return {
    ...totals,
    byDay: allDays.map((date) => ({ date, done: doneByDay.get(date) ?? 0 })),
    byMember: [...scores.values()]
      .filter((s) => !memberId || s.member.id === memberId)
      .sort((a, b) => b.done - a.done || a.member.rotation_order - b.member.rotation_order),
    feed: feed.sort((a, b) => tsOf(b.at) - tsOf(a.at)),
  };
}

const tsOf = (iso: string | null) => (iso ? Date.parse(iso) : 0);
