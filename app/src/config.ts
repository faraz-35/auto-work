export const SUPABASE_URL = 'https://qiylpuudulmokvjlkdcw.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpeWxwdXVkdWxtb2t2amxrZGN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgwNzUyNzAsImV4cCI6MjEwMzY1MTI3MH0.rwTzcZtvoNzKcLa4-vgzTysU5XogI3SA90TjCnPgrqM';

/** Latest-release feed the in-app updater polls; releases carry the APK. */
export const RELEASES_API = 'https://api.github.com/repos/faraz-35/auto-work/releases/latest';

export const TIMEZONE = 'Asia/Karachi';
/** Karachi is UTC+5 with no DST; used to compose "date + time_of_day" stamps. */
export const TZ_OFFSET = '+05:00';
/** v2 bumps the key so every phone asks "who are you" once after the update. */
export const PROFILE_KEY = 'ghar.profile.v2';
export const SNAPSHOT_KEY = 'ghar.snapshot';
export const CHORE_DRAFT_KEY = 'ghar.choreDraft';
export const SEEN_KEY = 'ghar.seenAssignments';
export const SEEN_INIT_KEY = 'ghar.seenAssignments.init';
