import { TIMEZONE } from '../config';
import { localDate } from './rotation';

/** "Sun 18 Oct" (+" 2027" when the year differs from this year's). */
function shortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  const opts: Intl.DateTimeFormatOptions = { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' };
  let out = new Intl.DateTimeFormat('en-GB', opts).format(d);
  if (dateStr.slice(0, 4) !== localDate().slice(0, 4)) out += ` ${dateStr.slice(0, 4)}`;
  return out;
}

/** "Sun 18 Oct" (+" 2027" when the year differs from this year's). */
export function formatShortDate(dateStr: string): string {
  return shortDate(dateStr);
}

/** "18 Oct" (+" 2027" when the year differs) — compact, for tight spots. */
export function formatDayMonth(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  let out = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(d);
  if (dateStr.slice(0, 4) !== localDate().slice(0, 4)) out += ` ${dateStr.slice(0, 4)}`;
  return out;
}

/** "Today" / "Tomorrow" / "Yesterday" / "Sun 18 Oct". */
export function formatDay(dateStr: string, today = localDate()): string {
  if (dateStr === today) return 'Today';
  const diff = Math.round((Date.parse(dateStr + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000);
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return shortDate(dateStr);
}

/** "18:00" or "18:00:00" -> "6:00 PM". */
export function formatTime12(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const suffix = h < 12 ? 'AM' : 'PM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** Karachi clock time "HH:MM" of an ISO timestamp. */
export function formatTimeOf(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, hour: 'numeric', minute: '2-digit', hour12: true })
    .format(new Date(iso))
    .toUpperCase();
}

/** How a chore presents its schedule, everywhere. */
export function scheduleLabel(chore: {
  due_at: string | null; repeat_days: number | null; repeat_weekdays: number | null;
  repeat_monthly_day: number | null; time_of_day: string;
}): string {
  if (chore.due_at) return `by ${formatDay(chore.due_at.slice(0, 10))}, ${formatTimeOf(chore.due_at)}`;
  const at = formatTime12(chore.time_of_day);
  if (chore.repeat_days === 1) return `daily at ${at}`;
  if (chore.repeat_days != null) return `every ${chore.repeat_days} days at ${at}`;
  if (chore.repeat_weekdays != null) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].filter((_, d) => (chore.repeat_weekdays! & (1 << d)) !== 0);
    const dayPart = days.length === 7 ? 'daily' : days.join(', ');
    return `${dayPart} at ${at}`;
  }
  if (chore.repeat_monthly_day != null) return `monthly on the ${chore.repeat_monthly_day} at ${at}`;
  return at;
}
