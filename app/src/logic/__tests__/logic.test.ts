import {
  addDays, assigneeFor, dayNumber, eventFor, localDate, nextOccurrence, occursOn, overrideKey,
} from '../rotation';
import { alarmsToNativeJson, computeDesiredAlarms, deadlineMs, formatRemaining } from '../alarms';
import { formatPKR, groupByMonth, memberTotals, monthKey } from '../ledger';
import type { Chore, ChoreEvent, Member } from '../../types';

const member = (id: string, order: number, active = true): Member => ({
  id, household_id: 'h', name: id, rotation_order: order, active, joined_at: '',
});

const members = [member('a', 0), member('b', 1), member('c', 2)];

const baseChore = {
  household_id: 'h', note: null, assignee_member_id: null, rotate: false, rotation_offset: 0,
  strict: false, due_at: null, repeat_days: null, repeat_monthly_day: null, time_of_day: '10:00:00',
  duration_minutes: null, amount: null, spawned_from: null, active: true, created_by: null,
  created_at: '2026-09-01T00:00:00Z',
};

const chore = (id: string, patch: Partial<Chore> = {}): Chore => ({ id, title: id, ...baseChore, ...patch } as Chore);

const evt = (choreId: string, date: string, status: ChoreEvent['status'], by = 'a'): ChoreEvent => ({
  id: `e-${choreId}-${date}`, household_id: 'h', chore_id: choreId, on_date: date, status,
  started_at: status === 'started' ? '2026-10-16T05:00:00Z' : null, started_by: status === 'started' ? by : null,
  done_at: status === 'done' || status === 'skipped' ? '2026-10-16T05:00:00Z' : null, done_by: status === 'done' || status === 'skipped' ? by : null,
  created_at: '2026-10-16T05:00:00Z',
});

// pin "now" inside a Karachi day so today is deterministic
const NOW = Date.parse('2026-10-16T03:00:00Z');  // 08:00 PKT, 2026-10-16
const TODAY = localDate(new Date(NOW));

describe('rotation basics', () => {
  test('dayNumber is stable and integer', () => {
    expect(dayNumber('1970-01-01')).toBe(0);
    expect(dayNumber('2026-08-30')).toBe(Math.floor(Date.parse('2026-08-30T00:00:00Z') / 86400000));
  });

  test('localDate is YYYY-MM-DD in Karachi', () => {
    expect(localDate(new Date('2026-08-30T18:30:00Z'))).toBe('2026-08-30');  // 23:30 PKT
    expect(localDate(new Date('2026-08-30T20:00:00Z'))).toBe('2026-08-31');  // 01:00 PKT next day
  });
});

describe('occursOn', () => {
  test('daily chore occurs every day from its anchor', () => {
    const c = chore('daily', { repeat_days: 1 });
    expect(occursOn(c, '2026-09-01')).toBe(true);
    expect(occursOn(c, TODAY)).toBe(true);
    expect(occursOn(c, '2026-08-31')).toBe(false);  // before anchor
  });

  test('interval chore hits multiples only', () => {
    const c = chore('ew3', { repeat_days: 3, created_at: '2026-10-01T00:00:00Z' });
    expect(occursOn(c, '2026-10-01')).toBe(true);
    expect(occursOn(c, '2026-10-04')).toBe(true);
    expect(occursOn(c, '2026-10-02')).toBe(false);
  });

  test('monthly chore on its day of month', () => {
    const c = chore('mbill', { repeat_monthly_day: 25 });
    expect(occursOn(c, '2026-10-25')).toBe(true);
    expect(occursOn(c, '2026-10-24')).toBe(false);
    expect(occursOn(c, '2026-11-25')).toBe(true);
  });

  test('one-off occurs on its Karachi due date only', () => {
    const c = chore('one', { due_at: '2026-10-17T18:00:00+05:00' });
    expect(occursOn(c, '2026-10-17')).toBe(true);
    expect(occursOn(c, '2026-10-18')).toBe(false);
  });

  test('inactive chores never occur', () => {
    expect(occursOn(chore('x', { repeat_days: 1, active: false }), TODAY)).toBe(false);
  });

  test('nextOccurrence walks forward', () => {
    expect(nextOccurrence(chore('d', { repeat_days: 1 }), '2026-10-16')).toBe('2026-10-17');
    expect(nextOccurrence(chore('m', { repeat_monthly_day: 25 }), '2026-10-26')).toBe('2026-11-25');
  });
});

describe('assigneeFor', () => {
  test('rotation with per-chore offset cycles through members', () => {
    const c = chore('rot', { rotate: true, rotation_offset: 0 });
    for (let i = 0; i < 7; i++) {
      const d = addDays('2026-08-30', i);
      expect(assigneeFor(c, d, members, {})!.id).toBe(members[dayNumber(d) % 3].id);
    }
  });

  test('offset shifts which member a chore lands on', () => {
    const d = '2026-10-16';
    const zero = assigneeFor(chore('r0', { rotate: true, rotation_offset: 0 }), d, members, {})!.id;
    const one = assigneeFor(chore('r1', { rotate: true, rotation_offset: 1 }), d, members, {})!.id;
    expect(zero).not.toBe(one);
  });

  test('fixed assignee wins when not rotating', () => {
    expect(assigneeFor(chore('fix', { assignee_member_id: 'b' }), TODAY, members, {})!.id).toBe('b');
  });

  test('override beats everything', () => {
    const c = chore('rot', { rotate: true });
    const rotated = assigneeFor(c, TODAY, members, {})!.id;
    const other = members.find((m) => m.id !== rotated)!.id;
    expect(assigneeFor(c, TODAY, members, { [overrideKey('rot', TODAY)]: other })!.id).toBe(other);
  });

  test('override pointing at a removed member falls back', () => {
    const c = chore('rot', { rotate: true });
    const rotated = assigneeFor(c, TODAY, members, {})!.id;
    expect(assigneeFor(c, TODAY, members, { [overrideKey('rot', TODAY)]: 'gone' })!.id).toBe(rotated);
  });
});

describe('computeDesiredAlarms', () => {
  test('null me -> nothing armed', () => {
    expect(computeDesiredAlarms(null, members, [chore('m', { strict: true, repeat_days: 1 })], [], {}, NOW)).toEqual([]);
  });

  test('strict chore assigned to me today arms at time_of_day Karachi', () => {
    const c = chore('m', { rotate: true, strict: true, repeat_days: 1, time_of_day: '10:30:00' });
    const mine = members[dayNumber(TODAY) % 3];
    const alarms = computeDesiredAlarms(mine, members, [c], [], {}, NOW);
    const todayAlarm = alarms.find((a) => a.id === `m:${TODAY}`);
    expect(todayAlarm).toBeDefined();
    expect(todayAlarm!.atMs).toBe(Date.parse(`${TODAY}T10:30:00+05:00`));  // 05:30 UTC
    expect(todayAlarm!.rechain).toBe(true);
  });

  test('strict chore assigned to someone else arms nothing on their phone', () => {
    const c = chore('m', { rotate: true, strict: true, repeat_days: 1 });
    const tomorrow = addDays(TODAY, 1);
    // with a daily rotation, only a member owning neither today nor tomorrow arms nothing
    const bystander = members.find((m) =>
      m.id !== members[dayNumber(TODAY) % 3].id && m.id !== members[dayNumber(tomorrow) % 3].id)!;
    expect(computeDesiredAlarms(bystander, members, [c], [], {}, NOW)).toEqual([]);
  });

  test('done or skipped today means no alarm today', () => {
    const c = chore('m', { rotate: true, strict: true, repeat_days: 1 });
    const mine = members[dayNumber(TODAY) % 3];
    const alarms = computeDesiredAlarms(mine, members, [c], [evt('m', TODAY, 'done')], {}, NOW);
    expect(alarms.find((a) => a.id === `m:${TODAY}`)).toBeUndefined();
  });

  test('one-off bill arms at due_at with amount in body, no rechain', () => {
    const c = chore('bill', { assignee_member_id: 'a', strict: true, due_at: '2026-10-16T18:00:00+05:00', amount: 4500 });
    const alarms = computeDesiredAlarms(member('a', 0), members, [c], [], {}, NOW);
    expect(alarms).toHaveLength(1);
    expect(alarms[0].atMs).toBe(Date.parse('2026-10-16T18:00:00+05:00'));
    expect(alarms[0].rechain).toBe(false);
    expect(alarms[0].body).toContain('Rs 4,500');
  });

  test('past deadlines never arm', () => {
    const c = chore('late', { assignee_member_id: 'a', strict: true, due_at: '2026-10-16T02:00:00Z' });  // 07:00 PKT, before NOW
    expect(computeDesiredAlarms(member('a', 0), members, [c], [], {}, NOW)).toEqual([]);
  });

  test('soft chores never arm', () => {
    const c = chore('soft', { assignee_member_id: 'a', repeat_days: 1 });
    expect(computeDesiredAlarms(member('a', 0), members, [c], [], {}, NOW)).toEqual([]);
  });

  test('recurring arms tomorrow too when tomorrow is mine', () => {
    const c = chore('m', { rotate: true, strict: true, repeat_days: 1 });
    const tomorrow = addDays(TODAY, 1);
    const tomorrowMine = members[dayNumber(tomorrow) % 3];
    const alarms = computeDesiredAlarms(tomorrowMine, members, [c], [], {}, NOW);
    expect(alarms.some((a) => a.id === `m:${tomorrow}`)).toBe(true);
  });

  test('capped to nearest 8', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      chore(`c${i}`, { assignee_member_id: 'a', strict: true, due_at: new Date(NOW + (i + 1) * 3600_000).toISOString() }));
    expect(computeDesiredAlarms(member('a', 0), members, many, [], {}, NOW)).toHaveLength(8);
  });

  test('deadlineMs composes Karachi offset', () => {
    expect(deadlineMs(chore('x', { repeat_days: 1, time_of_day: '00:30:00' }), '2026-10-16'))
      .toBe(Date.parse('2026-10-15T19:30:00Z'));
  });
});

describe('alarmsToNativeJson', () => {
  test('serializes to the native contract', () => {
    const json = alarmsToNativeJson([{ id: 'x:1', atMs: 5, title: 'T', body: 'B', rechain: true }]);
    expect(JSON.parse(json)).toEqual({ 'x:1': { at: 5, title: 'T', body: 'B', rechain: true } });
  });
});

describe('eventFor', () => {
  test('finds the occurrence record', () => {
    const events = [evt('m', '2026-10-15', 'done'), evt('m', TODAY, 'started')];
    expect(eventFor(events, 'm', TODAY)!.status).toBe('started');
    expect(eventFor(events, 'm', '2026-10-14')).toBeUndefined();
  });
});

describe('formatRemaining', () => {
  test('formats mm:ss and overdue with +', () => {
    expect(formatRemaining(65_000)).toBe('1:05');
    expect(formatRemaining(-65_000)).toBe('+1:05');
    expect(formatRemaining(9_800)).toBe('0:10');
  });
});

describe('ledger', () => {
  const p = (id: string, memberId: string, amount: number, at: string) => ({
    id, household_id: 'h', member_id: memberId, item: id, amount, created_at: at,
  });

  test('monthKey uses Karachi months', () => {
    expect(monthKey('2026-10-31T20:00:00Z')).toBe('2026-11');  // 01:00 PKT Nov 1
    expect(monthKey('2026-10-31T18:00:00Z')).toBe('2026-10');
  });

  test('groups by month, newest first, entries newest first', () => {
    const grouped = groupByMonth([
      p('1', 'a', 100, '2026-10-02T10:00:00Z'),
      p('2', 'b', 200, '2026-10-05T10:00:00Z'),
      p('3', 'a', 50, '2026-09-20T10:00:00Z'),
    ]);
    expect([...grouped.keys()]).toEqual(['2026-10', '2026-09']);
    expect(grouped.get('2026-10')!.map((x) => x.id)).toEqual(['2', '1']);
  });

  test('memberTotals sums and sorts descending', () => {
    const totals = memberTotals([
      p('1', 'a', 100, '2026-10-02T10:00:00Z'),
      p('2', 'b', 250, '2026-10-05T10:00:00Z'),
      p('3', 'a', 50, '2026-09-20T10:00:00Z'),
    ], members);
    expect(totals.map((t) => t.member.id)).toEqual(['b', 'a']);
    expect(totals[0].total).toBe(250);
    expect(totals[1].total).toBe(150);
  });

  test('formatPKR', () => {
    expect(formatPKR(4500)).toBe('Rs 4,500');
    expect(formatPKR(3250.5)).toBe('Rs 3,251');
  });
});

describe('human dates', () => {
  const TODAY = '2026-10-16';  // test-local today
  const { formatDay, formatTime12, formatTimeOf, scheduleLabel } = require('../human');

  test('formatDay: today, tomorrow, yesterday, else short', () => {
    expect(formatDay('2026-10-16', TODAY)).toBe('Today');
    expect(formatDay('2026-10-17', TODAY)).toBe('Tomorrow');
    expect(formatDay('2026-10-15', TODAY)).toBe('Yesterday');
    expect(formatDay('2026-10-18', TODAY)).toBe('Sun 18 Oct');
    expect(formatDay('2027-01-05', TODAY)).toMatch(/2027$/);
  });

  test('formatTime12', () => {
    expect(formatTime12('00:30:00')).toBe('12:30 AM');
    expect(formatTime12('18:00')).toBe('6:00 PM');
    expect(formatTime12('12:05:00')).toBe('12:05 PM');
  });

  test('scheduleLabel for each schedule kind', () => {
    expect(scheduleLabel({ due_at: '2030-06-18T13:00:00+05:00', repeat_days: null, repeat_monthly_day: null, time_of_day: '' }))
      .toBe('by Tue 18 Jun 2030, 1:00 PM');
    expect(scheduleLabel({ due_at: null, repeat_days: 1, repeat_monthly_day: null, time_of_day: '18:00:00' }))
      .toBe('daily at 6:00 PM');
    expect(scheduleLabel({ due_at: null, repeat_days: 3, repeat_monthly_day: null, time_of_day: '07:15:00' }))
      .toBe('every 3 days at 7:15 AM');
    expect(scheduleLabel({ due_at: null, repeat_days: null, repeat_monthly_day: 25, time_of_day: '09:00:00' }))
      .toBe('monthly on the 25 at 9:00 AM');
  });
});
