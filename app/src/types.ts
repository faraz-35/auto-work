export type Member = {
  id: string;
  household_id: string;
  name: string;
  rotation_order: number;
  active: boolean;
  joined_at: string;
};

export type Household = {
  id: string;
  snooze_minutes: number;
  created_at: string;
};

/** A chore definition. Exactly one schedule is set: due_at (one-off),
 *  repeat_days (every N days) or repeat_monthly_day (day of month). */
export type Chore = {
  id: string;
  household_id: string;
  title: string;
  note: string | null;
  assignee_member_id: string | null;  // fixed person; null when rotate
  rotate: boolean;
  rotation_offset: number;
  strict: boolean;                    // strict deadline -> native alarm on the assignee's phone
  due_at: string | null;              // ISO timestamptz for one-offs
  repeat_days: number | null;
  repeat_weekdays: number | null;     // weekly: bitmask, bit 0 = Sunday
  repeat_monthly_day: number | null;
  time_of_day: string;                // "HH:MM:SS" recurring deadline time
  duration_minutes: number | null;    // set -> starting spawns a strict close chore
  amount: number | null;              // bill amount
  rotation_members: string[] | null;  // rotate among these (null = everyone active)
  spawned_from: string | null;        // close chores point at their start event
  active: boolean;
  created_by: string | null;
  created_at: string;
};

/** One completion record per occurrence; generalizes the v1 run row. */
export type ChoreEvent = {
  id: string;
  household_id: string;
  chore_id: string;
  on_date: string;                    // "YYYY-MM-DD"
  status: 'started' | 'done' | 'skipped';
  started_at: string | null;
  started_by: string | null;
  done_at: string | null;
  done_by: string | null;
  created_at: string;
};

export type Swap = {
  id: string;
  household_id: string;
  chore_id: string;
  on_date: string;
  from_member_id: string;
  to_member_id: string | null;        // null = anyone may accept
  status: 'pending' | 'accepted' | 'canceled';
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
};

export type Purchase = {
  id: string;
  household_id: string;
  member_id: string;                  // who bought it
  item: string;
  amount: number;
  created_at: string;
};

export type Profile = {
  householdId: string;
  memberId: string;
};
