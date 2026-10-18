import { assignedTo, DEFAULT_CHORE_FILTERS, filterChores, isRecurring } from '../chores';
import type { Chore } from '../../types';

const baseChore = {
  household_id: 'h', note: null, assignee_member_id: null, rotate: false, rotation_offset: 0,
  strict: false, due_at: null, repeat_days: null, repeat_weekdays: null, repeat_monthly_day: null,
  time_of_day: '10:00:00', duration_minutes: null, amount: null, rotation_members: null,
  spawned_from: null, active: true, created_by: null, created_at: '2026-10-01T00:00:00Z',
};

const chore = (id: string, patch: Partial<Chore> = {}): Chore =>
  ({ id, title: id, ...baseChore, ...patch } as Chore);

const recurring = chore('dishes', { repeat_weekdays: 127, created_by: 'faraz' });
const once = chore('ke-bill', { due_at: '2026-10-25T13:00:00Z', assignee_member_id: 'ayesha', created_by: 'ayesha' });
const rotated = chore('motor', { repeat_days: 1, rotate: true, created_by: 'faraz' });
const pooled = chore('car', { repeat_days: 1, rotate: true, rotation_members: ['faraz', 'bilal'], created_by: 'bilal' });
const stopped = chore('old', { repeat_days: 1, active: false, created_by: 'faraz' });
const spawned = chore('close-motor', { due_at: '2026-10-25T13:00:00Z', spawned_from: 'evt-1', created_by: 'faraz' });

const all = [recurring, once, rotated, pooled, stopped, spawned];

describe('isRecurring', () => {
  test('true for every repeat shape, false for one-offs', () => {
    expect(isRecurring(recurring)).toBe(true);
    expect(isRecurring(rotated)).toBe(true);
    expect(isRecurring(once)).toBe(false);
  });
});

describe('assignedTo', () => {
  test('fixed chores match only their person', () => {
    expect(assignedTo(once, 'ayesha')).toBe(true);
    expect(assignedTo(once, 'bilal')).toBe(false);
  });
  test('rotation with no pool is everyone', () => {
    expect(assignedTo(rotated, 'faraz')).toBe(true);
    expect(assignedTo(rotated, 'ayesha')).toBe(true);
  });
  test('rotation pool limits to its members', () => {
    expect(assignedTo(pooled, 'bilal')).toBe(true);
    expect(assignedTo(pooled, 'ayesha')).toBe(false);
  });
});

describe('filterChores', () => {
  test('default keeps active definition chores of both kinds', () => {
    expect(filterChores(all, DEFAULT_CHORE_FILTERS).map((c) => c.id))
      .toEqual(['dishes', 'ke-bill', 'motor', 'car']);
  });
  test('stopped state keeps only inactive chores', () => {
    expect(filterChores(all, { ...DEFAULT_CHORE_FILTERS, state: 'stopped' }).map((c) => c.id))
      .toEqual(['old']);
  });
  test('all state includes stopped but never spawned chores', () => {
    expect(filterChores(all, { ...DEFAULT_CHORE_FILTERS, state: 'all' }).map((c) => c.id))
      .toEqual(['dishes', 'ke-bill', 'motor', 'car', 'old']);
  });
  test('creator filter', () => {
    expect(filterChores(all, { ...DEFAULT_CHORE_FILTERS, createdBy: 'ayesha' }).map((c) => c.id))
      .toEqual(['ke-bill']);
  });
  test('assignee matches fixed people and rotation pools', () => {
    expect(filterChores(all, { ...DEFAULT_CHORE_FILTERS, assignee: 'bilal' }).map((c) => c.id))
      .toEqual(['motor', 'car']);
  });
  test('kind filter', () => {
    expect(filterChores(all, { ...DEFAULT_CHORE_FILTERS, kind: 'once' }).map((c) => c.id))
      .toEqual(['ke-bill']);
    expect(filterChores(all, { ...DEFAULT_CHORE_FILTERS, kind: 'recurring' }).map((c) => c.id))
      .toEqual(['dishes', 'motor', 'car']);
  });
  test('filters combine', () => {
    expect(filterChores(all, { ...DEFAULT_CHORE_FILTERS, state: 'all', createdBy: 'faraz', kind: 'recurring' }).map((c) => c.id))
      .toEqual(['dishes', 'motor', 'old']);
  });
});
