# Ghar

The house's one app: everything that needs doing, who's doing it, and by when —
with alarms that actually ring. The water motor is just a chore here (starting
it spawns a "close it" chore), bills are chores with amounts, and whatever
anyone buys goes in the ledger. No login: a new phone types a name and it's in.

## How it works

- **Chores are the core.** One-offs with a deadline, or recurring — every N
  days, monthly on a day, or rotating across members (each rotating chore gets
  its own rotation offset so two rotating chores don't land on the same person).
  Swaps stay two-way: the coverer takes the requester's occurrence, the
  requester repays by taking the coverer's next one.
- **The motor is two chained chores.** A rotating daily "Turn on the motor"
  chore with a duration; `start_chore()` atomically records the start and
  spawns a strict one-off "Close:" chore due at start + duration. Completing
  the close chore stamps the parent occurrence done.
- **Strict deadlines ring real alarms.** Chores marked strict arm exact
  `AlarmClock` alarms (full-screen, insistent, DND-bypassing) on **the
  assignee's phone only** — the today list is for everyone else. Alarms are
  local-first: every phone computes its desired alarm set from shared state
  (`computeDesiredAlarms`), reconciles via `syncAlarms()`, and the native side
  persists the set and re-arms after reboots. Recurring alarms re-chain +24h
  when they fire so they survive unopened apps; JS corrects the exact schedule
  on next open.
- **Snappy by construction.** The last data snapshot renders instantly on
  open (stale-while-revalidate); actions flip local state immediately and
  write behind, healed by realtime. The server never gates the UI or the
  alarms.
- **The ledger** is the ported home-invoice: insert purchases, monthly
  per-member totals, two-tap delete. Bills-to-pay are chores, not ledger rows.
- **In-app updates.** On every app open, Ghar asks GitHub for the latest
  release; when it's newer, a bottom sheet offers the update, downloads the
  APK with a progress bar, and Android's installer takes over. First update
  on a phone also asks once for "allow from this source". Publishing remains
  `scripts/release.sh vX.Y.Z` — the updater reads the release tag and its
  `.apk` asset.
- **Invisible auth**: anonymous sign-ins are disabled on the project, so each
  phone claims one of 12 pre-provisioned pool users
  (`claim_device_account()` RPC) and signs in with a password grant. The user
  sees one name field, once.

## Layout

- `app/` — Expo (SDK 57, React Native) app. `src/logic` is pure and
  unit-tested (occurrences, rotation, alarms, ledger); `src/state/AppContext.tsx`
  owns the snapshot cache, optimistic actions, realtime, and the alarm
  reconciler.
- `packages/motor-alarms/` — local Expo native module (Kotlin): N keyed exact
  alarms as one persisted desired-set, boot restore, full-screen insistent
  alarm activity, per-alarm snooze, battery/autostart helpers.
- `server/` — SQL migrations + test harnesses. Scripts talk SQL over the
  Supabase Management API (`scripts/mgmt.mjs`) because the project's Postgres
  is IPv6-only and its shared-pooler tenant was retired when the project was
  restored from pause in Oct 2026 — HTTPS needs neither.
- `scripts/` — asset generators, APK build + release scripts.
- `.github/workflows/keepalive.yml` — pings `rpc/ping` twice weekly so the
  free tier never pauses (set `SUPABASE_URL` + `SUPABASE_ANON_KEY` as repo
  secrets).

## Dev commands

```zsh
cd server && npm run migrate               # apply pending migrations
cd server && node scripts/seed-pool.mjs    # (re)fill device account pool
cd server && node scripts/reset.mjs        # drop everything (destructive)
cd server && npm test                      # REST e2e (wipes data — dev DB only!)
cd server && node scripts/sql-test.mjs     # SQL-level RPC logic test
cd app && npm run test                     # unit tests (logic)
cd app && npm run typecheck
zsh scripts/build-android.sh               # signed release APK
zsh scripts/release.sh v2.0.0              # tag + GitHub release with the APK
```

`server/.env` (gitignored) holds `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_KEY`. SQL admin access comes from the Supabase CLI's
keychain token (or `SUPABASE_ACCESS_TOKEN`). The keystore (`motor.keystore` +
`keystore.env`, gitignored, on Faraz's Mac) signs every release — losing it
means siblings must uninstall before updating.

## Phone setup (the part that actually matters)

Alarms only ring reliably if Android lets them. On each phone, once:

1. Install the APK (allow "unknown sources" for the browser/WhatsApp), open,
   type your name.
2. Family tab → **Make alarms reliable**: allow notifications, exempt from
   battery optimization (green checkmarks).
3. Autostart (manual on their ROMs):
   - **Redmi (MIUI)**: Security app → Permissions → Autostart → enable Ghar.
     Also Settings → Apps → Ghar → Battery saver → "No restrictions".
   - **Infinix (HiOS)**: Phone Master/HiOS settings → autostart for Ghar; keep
     it off "smart" battery cleaning lists.
4. Test once: Family tab → "Ring a test alarm in 1 minute" → lock the phone →
   it must light up the screen and ring.
