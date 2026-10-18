import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config';

export const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
  },
});

/**
 * Sign this phone in as one of the pre-provisioned pool devices.
 * Idempotent: returns once a session exists.
 */
export async function ensureDeviceSession(): Promise<void> {
  const { data } = await db.auth.getSession();
  if (data.session) {
    // a cached session can outlive its refresh token — one cheap call proves
    // the JWT still works; if it's dead, fall through and claim a fresh device
    const { error } = await db.from('households').select('id').limit(1);
    if (!error) return;
    if (!/jwt|401/i.test(error.message)) throw error;  // offline etc: stay loud
    await db.auth.signOut().catch(() => undefined);
  }

  const claim = await db.rpc('claim_device_account');
  const account = Array.isArray(claim.data) ? claim.data[0] : claim.data;
  if (!account?.email) throw new Error('No free device slots left — ask Faraz to refill the pool.');

  const { error } = await db.auth.signInWithPassword({
    email: account.email,
    password: account.password,
  });
  if (error) throw error;
}
