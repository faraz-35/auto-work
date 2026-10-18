import { houseStats } from '../stats';
import { addDays, assigneeFor, dayNumber, nextForMe } from '../rotation';
import type { Chore, ChoreEvent, Member } from '../../types';

const member = (id: string, order: number, active = true): Member => ({
  id, household_id: 'h', name: id, rotation_order: order, active, joined_at: '',
});

const members = [member('a', 0), member('b', 1), member('c', 2)];

const baseChore = {
  household_id: 'h', note: null, assignee_member_id: null, rotate: false, rotation_offset: 0,
  strict: false, due_at: null, repeat_days: null, repeat_weekdays: null, repeat_monthly_day: null,
  time_of_day: '10:00:00', rotation_members: null,
  active: true, created_by: null, created_at: '2026-09-01T00:00:00Z',
};

const chore = (id: string, patch: Partial<Chore> = {}): Chore => ({ id, title: id, ...baseChore, ...patch } as Chore);

const evt = (choreId: string, date: string, status: ChoreEvent['status'], by = 'a'): ChoreEvent => ({
  id: `e-${choreId}-${date}`, household_id: 'h', chore_id: choreId, on_date: date, status,
  started_at: status === 'started' ? `${date}T05:00:00Z` : null, started_by: status === 'started' ? by : null,
  done_at: status !== 'started' ? `${date}T05:00:00Z` : null, done_by: status !== 'started' ? by : null,
  created_at: `${date}T05:00:00Z`,
});

const stats = (over: Partial<Parameters<typeof houseStats>[0]> = {}) =>
  houseStats({
    chores: [], events: [], members, overrides: {},
    from: '2026-10-14', to: '2026-10-16', ...over,
  });

describe('houseStats', () => {
  test('a daily rotation over three days: one done, one missed, one left', () => {
    const rot = chore('rot', { rotate: true, repeat_days: 1 });
    const day1Owner = members[dayNumber('2026-10-14') % 3].id;
    const day2Owner = members[dayNumber('2026-10-15') % 3].id;
    const s = stats({ chores: [rot], events: [evt('rot', '2026-10-14', 'done', day1Owner)] });

    expect(s.assigned).toBe(3);
    expect(s.done).toBe(1);
    expect(s.missed).toBe(1);
    expect(s.left).toBe(1);
    expect(s.byDay.map((d) => d.done)).toEqual([1, 0, 0]);
    expect(s.byMember.find((m) => m.member.id === day1Owner)).toMatchObject({ assigned: 1, done: 1, missed: 0 });
    expect(s.byMember.find((m) => m.member.id === day2Owner)).toMatchObject({ assigned: 1, done: 0, missed: 1 });
    expect(s.feed).toHaveLength(1);
    expect(s.feed[0]).toMatchObject({ status: 'done', date: '2026-10-14', by: day1Owner });
  });

  test('skipped counts separately, never as a miss', () => {
    const rot = chore('rot', { rotate: true, repeat_days: 1, rotation_offset: 1 });
    const owner = assigneeFor(rot, '2026-10-14', members, {})!.id;
    const s = stats({ chores: [rot], events: [evt('rot', '2026-10-14', 'skipped', owner)], from: '2026-10-14', to: '2026-10-14' });
    expect(s.skipped).toBe(1);
    expect(s.missed).toBe(0);
    expect(s.done).toBe(0);
    expect(s.feed[0].status).toBe('skipped');
  });

  test('started today stays open and shows in the feed', () => {
    const rot = chore('rot', { rotate: true, repeat_days: 1, rotation_offset: 2 });
    const owner = assigneeFor(rot, '2026-10-16', members, {})!.id;
    const s = stats({ chores: [rot], events: [evt('rot', '2026-10-16', 'started', owner)], from: '2026-10-16', to: '2026-10-16' });
    expect(s.left).toBe(1);
    expect(s.missed).toBe(0);
    expect(s.feed[0]).toMatchObject({ status: 'started', by: owner });
  });

  test('a started past day counts as missed', () => {
    const one = chore('one', { rotate: true, due_at: '2026-10-13T18:00:00+05:00' });
    const owner = assigneeFor(one, '2026-10-13', members, {})!.id;
    const s = stats({ chores: [one], events: [evt('one', '2026-10-13', 'started', owner)], from: '2026-10-13', to: '2026-10-14' });
    expect(s.left).toBe(0);
    expect(s.missed).toBe(1);
  });

  test('chores are not charged before they existed', () => {
    // 2026-10-07 and 2026-10-14 are both Wednesdays; the chore only starts Oct 10
    const weekly = chore('weekly', { rotate: true, repeat_weekdays: 1 << 3, created_at: '2026-10-10T00:00:00Z' });
    const s = stats({ chores: [weekly], from: '2026-10-07', to: '2026-10-16' });
    expect(s.assigned).toBe(1);   // only Wed Oct 14 counts
    expect(s.missed).toBe(1);     // and it is still open, so a miss, not a done
  });

  test('assignment filter narrows to one member', () => {
    const rot = chore('rot', { rotate: true, repeat_days: 1 });
    const owner = members[dayNumber('2026-10-14') % 3].id;
    const s = stats({ chores: [rot], events: [evt('rot', '2026-10-14', 'done', owner)], memberId: owner });
    expect(s.assigned).toBe(1);
    expect(s.byMember).toHaveLength(1);
    expect(s.byMember[0].member.id).toBe(owner);
  });

  test('chore filter narrows to one chore', () => {
    const r1 = chore('r1', { rotate: true, repeat_days: 1 });
    const r2 = chore('r2', { rotate: true, repeat_days: 1, rotation_offset: 1 });
    const s = stats({ chores: [r1, r2], choreId: 'r2' });
    expect(s.assigned).toBe(3);
  });

  test('past one-off with no record is missed; a done one counts', () => {
    const bill = chore('bill', { assignee_member_id: 'a', due_at: '2026-10-14T18:00:00+05:00' });
    const undone = stats({ chores: [bill] });
    expect(undone.missed).toBe(1);

    const done = stats({ chores: [bill], events: [evt('bill', '2026-10-14', 'done')] });
    expect(done.done).toBe(1);
    expect(done.missed).toBe(0);
  });

  test('stopped chores keep their history in totals and feed but charge nobody', () => {
    const stopped = chore('stopped', { repeat_days: 1, active: false });
    const s = stats({ chores: [stopped], events: [evt('stopped', '2026-10-14', 'done', 'b')] });
    expect(s.done).toBe(1);
    expect(s.assigned).toBe(0);
    expect(s.feed[0]).toMatchObject({ status: 'done', by: 'b' });
    expect(s.byMember.every((m) => m.done === 0 && m.missed === 0)).toBe(true);
  });

  test('byMember lists every active member, sorted by done then rotation order', () => {
    const r1 = chore('r1', { assignee_member_id: 'a', repeat_days: 1 });
    const s = stats({ chores: [r1], events: [evt('r1', '2026-10-14', 'done')] });
    expect(s.byMember.map((m) => m.member.id)).toEqual(['a', 'b', 'c']);
    expect(s.byMember.map((m) => m.done)).toEqual([1, 0, 0]);
  });

  test('status filter narrows to one state; assigned stays the full base', () => {
    const rot = chore('rot', { rotate: true, repeat_days: 1 });
    const day1 = assigneeFor(rot, '2026-10-14', members, {})!.id;
    const s = stats({
      chores: [rot],
      events: [evt('rot', '2026-10-14', 'done', day1)],
      status: 'missed',
    });
    // three occurrences: one done, one missed, one open
    expect(s.assigned).toBe(3);
    expect(s.missed).toBe(1);
    expect(s.done).toBe(0);
    expect(s.left).toBe(0);
    // missed occurrences have no event of their own: the assignee speaks
    expect(s.feed).toHaveLength(1);
    expect(s.feed[0]).toMatchObject({ status: 'missed' });
  });

  test('status done lists only done events; open lists the boundary day', () => {
    const rot = chore('rot', { rotate: true, repeat_days: 1 });
    const day1 = assigneeFor(rot, '2026-10-14', members, {})!.id;
    const done = stats({ chores: [rot], events: [evt('rot', '2026-10-14', 'done', day1)], status: 'done' });
    expect(done.done).toBe(1);
    expect(done.byDay.map((d) => d.done)).toEqual([1, 0, 0]);

    const open = stats({ chores: [rot], status: 'open' });
    expect(open.left).toBe(1);
    expect(open.feed[0]).toMatchObject({ status: 'open', date: '2026-10-16' });
  });

  test('byDay counts the filtered state, not just dones', () => {
    const rot = chore('rot', { rotate: true, repeat_days: 1 });
    const s = stats({ chores: [rot], status: 'missed' });
    expect(s.byDay.map((d) => d.done)).toEqual([1, 1, 0]);  // the 14th and 15th are missed
  });

  test('without a filter, misses stay out of the feed but started shows', () => {
    const rot = chore('rot', { rotate: true, repeat_days: 1 });
    const day1 = assigneeFor(rot, '2026-10-14', members, {})!.id;
    const day3 = assigneeFor(rot, '2026-10-16', members, {})!.id;
    const s = stats({
      chores: [rot],
      events: [evt('rot', '2026-10-14', 'done', day1), evt('rot', '2026-10-16', 'started', day3)],
    });
    expect(s.feed.map((f) => f.status)).toEqual(['started', 'done']);  // newest first
  });
});

describe('nextForMe', () => {
  test('finds my next turn of a rotating chore', () => {
    const rot = chore('rot', { rotate: true, repeat_days: 1 });
    const me = members[dayNumber(addDays('2026-10-16', 2)) % 3];
    const next = nextForMe(me, [rot], members, {}, '2026-10-16');
    expect(next).not.toBeNull();
    expect(assigneeFor(next!.chore, next!.date, members, {})!.id).toBe(me.id);
    expect(next!.date).toBe(addDays('2026-10-16', 2));
  });

  test('picks the earliest across chores and skips other people chores', () => {
    const mineTomorrow = chore('mine', { assignee_member_id: 'b', due_at: '2026-10-17T18:00:00+05:00' });
    const theirs = chore('theirs', { assignee_member_id: 'a', repeat_days: 1 });
    expect(nextForMe(members[1], [theirs, mineTomorrow], members, {}, '2026-10-16'))
      .toMatchObject({ chore: mineTomorrow, date: '2026-10-17' });
    expect(nextForMe(members[2], [theirs, mineTomorrow], members, {}, '2026-10-16')).toBeNull();
  });

  test('never points at stopped chores', () => {
    const stopped = chore('gone', { assignee_member_id: 'a', due_at: '2026-10-18T18:00:00+05:00', active: false });
    expect(nextForMe(members[0], [stopped], members, {}, '2026-10-16')).toBeNull();
  });
});
