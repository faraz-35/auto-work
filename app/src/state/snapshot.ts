import AsyncStorage from '@react-native-async-storage/async-storage';
import { SNAPSHOT_KEY } from '../config';
import type { Chore, ChoreEvent, Household, Member, Swap } from '../types';
import type { ChoreOverrides } from '../logic/rotation';

/** Last known server state, persisted so cold opens render instantly and
 *  revalidate in the background (stale-while-revalidate). */
export type Snapshot = {
  v: 2;
  household: Household | null;
  members: Member[];
  chores: Chore[];
  events: ChoreEvent[];
  overrides: ChoreOverrides;
  swaps: Swap[];
  savedAt: string;
};

export type SnapshotData = Omit<Snapshot, 'v' | 'savedAt'>;

export async function loadSnapshot(): Promise<Snapshot | null> {
  const raw = await AsyncStorage.getItem(SNAPSHOT_KEY);
  if (!raw) return null;
  const snap = JSON.parse(raw) as Snapshot;
  return snap.v === 2 ? snap : null;
}

export function saveSnapshot(data: SnapshotData): void {
  const snapshot: Snapshot = { ...data, v: 2, savedAt: new Date().toISOString() };
  void AsyncStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
}
