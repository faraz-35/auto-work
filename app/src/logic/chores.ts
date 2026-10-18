import type { Chore } from '../types';

export type ChoreFilters = {
  state: 'active' | 'stopped' | 'all';
  createdBy: string | null;   // member id; null = anyone
  assignee: string | null;    // member id; null = anyone
  kind: 'all' | 'recurring' | 'once';
};

export const DEFAULT_CHORE_FILTERS: ChoreFilters = {
  state: 'active', createdBy: null, assignee: null, kind: 'all',
};

export const isRecurring = (c: Chore) =>
  c.repeat_days != null || c.repeat_weekdays != null || c.repeat_monthly_day != null;

/** Is this member on the hook for the chore — fixed assignee, or in the
 *  rotation pool (null pool = everyone active takes turns)? */
export const assignedTo = (c: Chore, memberId: string) =>
  c.rotate
    ? c.rotation_members == null || c.rotation_members.includes(memberId)
    : c.assignee_member_id === memberId;

/** The Chores tab list: definition chores only (spawned close chores live on
 *  the day they belong to), narrowed by the filter row. */
export function filterChores(chores: Chore[], f: ChoreFilters): Chore[] {
  return chores.filter((c) =>
    c.spawned_from == null
    && (f.state === 'all' || (f.state === 'active') === c.active)
    && (f.createdBy == null || c.created_by === f.createdBy)
    && (f.assignee == null || assignedTo(c, f.assignee))
    && (f.kind === 'all' || (f.kind === 'recurring') === isRecurring(c))
  );
}
