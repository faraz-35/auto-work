import AsyncStorage from '@react-native-async-storage/async-storage';
import { PROFILE_KEY } from '../config';
import type { Profile } from '../types';

export async function loadProfile(): Promise<Profile | null> {
  const raw = await AsyncStorage.getItem(PROFILE_KEY);
  return raw ? (JSON.parse(raw) as Profile) : null;
}

export function saveProfile(profile: Profile): void {
  void AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function clearProfile(): void {
  void AsyncStorage.removeItem(PROFILE_KEY);
}
