# Codex Handoff - AutoChecks PWA

## Project Snapshot
- Stack: Next.js 16 (App Router), React 19, TypeScript, Dexie (IndexedDB), PWA service worker push flow.
- Repo path: `e:\Scripturi\pwa`
- Deployment target: Vercel (`helapp.xyz`)
- Data model: local-first (vehicles/checks/settings in IndexedDB).

## What Has Been Implemented

### Push + Reminder Foundation
- Web push test flow via:
  - `src/components/PushManager.tsx`
  - `src/app/api/push/subscribe/route.ts`
  - `src/app/api/push/test/route.ts`
  - `src/app/api/push/unsubscribe/route.ts`
- Reminder timing engine:
  - `ReminderSettings`, defaults, `calculateTriggerDate()`, `scheduleExpiryReminders()` in
    `src/services/reminders/reminderEngine.ts`
- Runtime scheduler integration (client-side scheduling):
  - `src/services/reminders/runtimeReminderScheduler.ts`

### UX / Product QoL Work
- Header made responsive across screen sizes.
- App name editable in settings and shown in header.
- Upcoming reminders card removed from homepage.
- Bell icon dialog added for reminders list.
- Reminder dialog now:
  - uses `dd/mm/yyyy`
  - lists all expiring docs (ITP/RCA/Vignette), not only nearest
  - includes snooze / mark-renewed interactions.
- Greeting screen footer added: `Powered by UCENICUL`.
- Add Vehicle page entry animation from FAB navigation path.
- PushManager mobile button wrapping fixed for iPhone overflow.

### Phases 0-8 (MVP Scope) Added
- Feature flag/settings scaffolding:
  - `src/lib/featureFlags.ts`
  - `src/lib/settings.ts`
- Validation utilities:
  - `src/utils/validation.ts`
- Dashboard search + hidden filter panel (toggle button to reveal filters/sort):
  - `src/app/page.tsx`
- Vehicle quick actions:
  - edit + delete implemented
  - duplicate removed per latest request.
- Soft delete + restore flow:
  - `deletedAt` in vehicles
  - recycle-bin style restore/permanent delete UI in settings.
- Import dry-run preview before applying import.
- Offline queue and reconnect flush for queued network requests:
  - `src/lib/networkQueue.ts`
- Debug tools panel (non-production) in settings.

## Current Behavior Notes
- Primary data is local (IndexedDB), not cloud-synced.
- Exports are recommended as backup safety.
- Runtime reminder scheduling is browser-runtime based (not guaranteed long-lived background if app runtime is terminated).

## Environment / Secrets
- Push env vars expected in Vercel:
  - `NEXT_PUBLIC_VAPID_PUBLIC`
  - `VAPID_PUBLIC_KEY`
  - `VAPID_PRIVATE_KEY`
  - `VAPID_SUBJECT`
- Node policy currently set by `package.json` engines (`>=18 <=20`).

## Useful Commands
```powershell
npm install
npm run dev
npm run build
npm run qa:smoke
```

## Deploy Checklist (Vercel)
1. Confirm env vars above exist in Vercel (Prod + Preview as needed).
2. Confirm Node version is compatible with engines (20.x).
3. Push to `main` or run Vercel production deploy.
4. Verify:
   - `/add-vehicle` loads and animation from FAB works.
   - push subscribe/test path works on HTTPS domain.
   - reminders appear in bell dialog as expected.

## Known Follow-Ups (Recommended)
1. Add real cloud sync + auth (e.g., Supabase) for cross-device account sync.
2. Move reminder dispatch to server-side scheduler (cron/job) for reliable background reminders.
3. Remove/lock debug-only controls before public release.
4. Add targeted tests for import preview, soft-delete restore, and reminder snooze behavior.

## Git / Handoff Tip
If moving machines/accounts, keep this file committed in repo so any VS Code/GitHub account can continue from the same state.
