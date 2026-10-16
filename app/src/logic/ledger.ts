import type { Member, Purchase } from '../types';
import { TIMEZONE } from '../config';

/** "YYYY-MM" of a purchase in household time (Karachi). */
export function monthKey(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit' })
    .format(new Date(iso))
    .slice(0, 7);
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** Purchases grouped by month, newest month first, newest entry first. */
export function groupByMonth(purchases: Purchase[]): Map<string, Purchase[]> {
  const byMonth = new Map<string, Purchase[]>();
  for (const p of purchases) {
    const k = monthKey(p.created_at);
    const list = byMonth.get(k);
    if (list) list.push(p);
    else byMonth.set(k, [p]);
  }
  for (const [, list] of byMonth) {
    list.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  }
  return new Map([...byMonth.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)));
}

export function formatPKR(n: number): string {
  return `Rs ${n.toLocaleString('en-PK', { maximumFractionDigits: 0 })}`;
}

/** Per-member spend for one month, descending — the "who paid what" summary. */
export function memberTotals(purchases: Purchase[], members: Member[]): { member: Member; total: number }[] {
  const sums = new Map<string, number>();
  for (const p of purchases) sums.set(p.member_id, (sums.get(p.member_id) ?? 0) + p.amount);
  return members
    .filter((m) => sums.has(m.id))
    .map((m) => ({ member: m, total: sums.get(m.id)! }))
    .sort((a, b) => b.total - a.total);
}
