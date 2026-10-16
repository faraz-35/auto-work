import { db } from '../db/client';

/** Realtime is a doorbell, not a data channel: any row change in the
 *  household (including its own settings row) just triggers a refetch. */
export function watchHousehold(householdId: string, onChange: () => void): () => void {
  const channel = db.channel(`household-${householdId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', filter: `household_id=eq.${householdId}` },
      onChange,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'households', filter: `id=eq.${householdId}` },
      onChange,
    )
    .subscribe();
  return () => { void db.removeChannel(channel); };
}
