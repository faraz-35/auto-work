import { assignmentAlert, computeReminders, freshAssignments, myFixedChores, remindersToNativeJson } from '../logic';
import type { Chore, ChoreEvent, Member } from '../../types';


const member = (id: string, order: number, active = true): Member => ({
  id, household_id: 'h', name: id, rotation_order: order, active, joined_at: '',
});

const members = [member('a', 0), member('b', 1), member('c', 2)];
const me = members[0];

const baseChore = {
  household_id: 'h', note: null, assignee_member_id: null, rotate: false, rotation_offset: 0,
  strict: false, due_at: null, repeat_days: null, repeat_monthly_day: null, time_of_day: '10:00:00',
  rotation_members: null, active: true, created_by: 'b',
  created_at: '2026-10-01T00:00:00Z',
};

const chore = (id: string, patch: Partial<Chore> = {}): Chore => ({ id, title: id, ...baseChore, ...patch } as Chore);

const evt = (choreId: string, date: string, status: ChoreEvent['status']): ChoreEvent => ({
  id: `e-${choreId}-${date}`, household_id: 'h', chore_id: choreId, on_date: date, status,
  started_at: null, started_by: null, done_at: '2026-10-16T05:00:00Z', done_by: 'a',
  created_at: '2026-10-16T05:00:00Z',
});

// 08:00 PKT, 2026-10-16
const NOW = Date.parse('2026-10-16T03:00:00Z');
const TODAY = '2026-10-16';


describe('computeReminders', () => {
  test('one-off due in 40 min gets the 30 and 10 minute nudges plus the late nag', () => {
    const c = chore('one', { assignee_member_id: 'a', due_at: '2026-10-16T08:40:00+05:00' });
    const out = computeReminders(me, members, [c], [], {}, NOW);
    expect(out.map((r) => r.id)).toEqual([
      'one:2026-10-16:m30', 'one:2026-10-16:m10', 'one:2026-10-16:late',
    ]);
  });

  test('due in 20 min skips the 30 minute nudge', () => {
    const c = chore('soon', { assignee_member_id: 'a', due_at: '2026-10-16T08:20:00+05:00' });
    const out = computeReminders(me, members, [c], [], {}, NOW);
    expect(out.map((r) => r.id)).toEqual(['soon:2026-10-16:m10', 'soon:2026-10-16:late']);
  });

  test('due in 5 min gets only the late nag', () => {
    const c = chore('imminent', { assignee_member_id: 'a', due_at: '2026-10-16T08:05:00+05:00' });
    const out = computeReminders(me, members, [c], [], {}, NOW);
    expect(out.map((r) => r.id)).toEqual(['imminent:2026-10-16:late']);
  });

  test('no late nag once the deadline is over an hour old', () => {
    const c = chore('old', { assignee_member_id: 'a', due_at: '2026-10-16T06:00:00+05:00' });
    expect(computeReminders(me, members, [c], [], {}, NOW)).toEqual([]);
  });

  test('a done occurrence is silent', () => {
    const c = chore('done', { assignee_member_id: 'a', due_at: '2026-10-16T13:40:00+05:00' });
    expect(computeReminders(me, members, [c], [evt('done', TODAY, 'done')], {}, NOW)).toEqual([]);
  });

  test('other people\'s chores and inactive chores are silent', () => {
    const theirs = chore('theirs', { assignee_member_id: 'b', due_at: '2026-10-16T13:40:00+05:00' });
    const stopped = chore('stopped', { assignee_member_id: 'a', due_at: '2026-10-16T13:40:00+05:00', active: false });
    expect(computeReminders(me, members, [theirs, stopped], [], {}, NOW)).toEqual([]);
  });

  test('a rotating chore nudges its day\'s assignee only (today and their next turn)', () => {
    const rot = chore('rot', { rotate: true, rotation_offset: 0, repeat_days: 1, time_of_day: '12:00:00' });
    const mine = computeReminders(me, members, [rot], [], {}, NOW);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((r) => r.id.startsWith('rot:2026-10-16:') || r.id.startsWith('rot:2026-10-17:'))).toBe(true);
    // rotation_offset 0 lands today on me, so b holds only tomorrow's nudge
    const b = computeReminders(members[1], members, [rot], [], {}, NOW);
    expect(b.every((r) => r.id.startsWith('rot:2026-10-17:'))).toBe(true);
  });

  test('recurring chores also arm their next occurrence', () => {
    const daily = chore('daily', { assignee_member_id: 'a', repeat_days: 1, time_of_day: '23:00:00' });
    const out = computeReminders(me, members, [daily], [], {}, NOW);
    expect(out.some((r) => r.id.startsWith('daily:2026-10-17:'))).toBe(true);
  });

  test('a per-date override reassigns the nudge', () => {
    const rot = chore('rot', { rotate: true, rotation_offset: 0, repeat_days: 1, time_of_day: '12:00:00' });
    const out = computeReminders(me, members, [rot], [], { [`rot|${TODAY}`]: 'b' }, NOW);
    expect(out.length).toBe(0);
  });
});

describe('assignments', () => {
  test('myFixedChores keeps only my active fixed rows', () => {
    const mine = chore('mine', { assignee_member_id: 'a' });
    const rotating = chore('rot', { rotate: true, rotation_offset: 0 });
    const stopped = chore('old', { assignee_member_id: 'a', active: false });
    expect(myFixedChores([mine, rotating, stopped], me)).toEqual([mine]);
  });

  test('freshAssignments skips seen chores and chores I created', () => {
    const fresh = chore('fresh', { assignee_member_id: 'a', created_by: 'b' });
    const seen = chore('seen', { assignee_member_id: 'a', created_by: 'b' });
    const mine = chore('self', { assignee_member_id: 'a', created_by: 'a' });
    expect(freshAssignments([fresh, seen, mine], me, new Set(['seen']))).toEqual([fresh]);
  });

  test('assignmentAlert names the creator and the due date', () => {
    const c = chore('Dishes', { assignee_member_id: 'a', created_by: 'b', due_at: '2026-10-16T18:00:00+05:00' });
    expect(assignmentAlert(c, members[1], TODAY)).toEqual({
      title: 'Dishes',
      body: 'b added this for you · due Today, 6:00 PM',
    });
  });

  test('assignmentAlert falls back when the creator is unknown', () => {
    const c = chore('Dishes', { assignee_member_id: 'a', repeat_days: 1, time_of_day: '18:00:00' });
    expect(assignmentAlert(c, null, TODAY).body).toBe('Added for you · due Today, 6:00 PM');
  });
});

describe('remindersToNativeJson', () => {
  test('serializes the native contract', () => {
    expect(remindersToNativeJson([{ id: 'x:2026-10-16:m10', atMs: 5, title: 'T', body: 'B' }]))
      .toBe('{"x:2026-10-16:m10":{"at":5,"title":"T","body":"B"}}');
  });
});
