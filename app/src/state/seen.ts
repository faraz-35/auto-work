import AsyncStorage from '@react-native-async-storage/async-storage';
import { SEEN_INIT_KEY, SEEN_KEY } from '../config';

/** Chore ids this phone has already announced as "added for you". Held in
 *  memory after the first load so overlapping refreshes can't double-notify. */
let cache: Set<string> | null = null;

export async function loadSeen(): Promise<Set<string>> {
  if (cache) return cache;
  const raw = await AsyncStorage.getItem(SEEN_KEY);
  cache = new Set(raw ? (JSON.parse(raw) as string[]) : []);
  return cache;
}

/** Replace the set with my current fixed chores and persist. */
export function saveSeen(ids: string[]): void {
  cache = new Set(ids);
  void AsyncStorage.setItem(SEEN_KEY, JSON.stringify([...cache]));
}

export async function seenInitialized(): Promise<boolean> {
  return (await AsyncStorage.getItem(SEEN_INIT_KEY)) != null;
}

export function markSeenInitialized(): void {
  void AsyncStorage.setItem(SEEN_INIT_KEY, '1');
}
