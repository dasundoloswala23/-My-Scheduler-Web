# MyPlanScheduler web app — QA report

Date: 2026-10-08
Next.js 16.3.8 · React 19.2.8 · TypeScript · Firebase 12 · static export (`output: "export"`)
Tested from: Windows 11. No browser session, no signed-in test account, no second
device, no physical phone.

## How to read this

| Result | Meaning |
|---|---|
| PASS | Exercised and observed to behave correctly. |
| FAIL | Exercised and found broken. |
| BLOCKED | Cannot be done or tested from here. The note says why. |
| NOT TESTED | Built, but not exercised. Correct as far as the type checker, linter and unit tests can say, which is not the same as correct on screen. |

Nothing is marked PASS on the strength of "the code looks right".

**What this report cannot say.** Almost everything that needs a signed-in user —
drag and drop, saving a reminder, uploading a file — needs a browser pass against
real Firebase data, and none was possible. Those rows are NOT TESTED, and that is
most of the UI. The things marked PASS below are the things that can be checked
without one: the build, the shipped files, and the pure logic.

## Automated gates

| Gate | Result | Notes |
|---|---|---|
| `npx tsc --noEmit` | PASS | No errors. |
| `npm run lint` | PASS | No errors. It caught two real React problems during this work (state set inside an effect; an unstable memo dependency), both fixed. |
| `npm test` | PASS | 42/42. Holiday dates, link parsing and the reminder model. See "Tests". |
| `npm run build` | PASS | 20 static routes, no errors. |
| Existing "21/21" | BLOCKED | The brief refers to a suite that does not exist in this project: there was no test runner here before this work. The 21 that were mentioned are the Flutter tests. This project now has its own 42. |
| "Existing Firebase/API tests" | BLOCKED | None exist in this repository. |

### Tests

`npm test` runs Node's built-in `node:test` over `lib/*.test.ts`, with **no new
dependency**: Node 22.18 strips TypeScript natively. (`vitest` was tried and
conflicts with the project's `@types/node@20`.) The one config change is
`allowImportingTsExtensions` in `tsconfig.json`, which ESM needs so the test files
can import their siblings; it has no effect on the build.

- `holidays.test.ts` — 14 tests, deliberately identical to the Flutter app's
  `holiday_test.dart`, so a divergence between the two clients' holiday dates
  fails a test rather than showing up as different calendars on a phone and a
  browser.
- `link-preview.test.ts` — 6 tests.
- `reminders.test.ts` — 22 tests, including: unknown reminder fields survive a
  round trip (so a web edit cannot strip the mobile app's alarm settings), the
  legacy-offset fallback uses the same ids Flutter does, a moved task moves its
  reminder's fire time, and a completed task or disabled reminder never fires.

## What was checked against the built output

The static export was served locally and requested.

| Check | Result | Notes |
|---|---|---|
| Every route serves | PASS | `/`, `/login`, `/board`, `/boards`, `/calendar`, `/holidays`, `/settings`, `/reminders`, the manifest, favicon and icons all return 200. An unknown path returns 404. |
| `/board?id=<id>` architecture | PASS (serving only) | The static page loads with a query string, so the §43 requirement not to revert to `/boards/[id]` is intact. That the board then **renders the right board** needs a signed-in browser: NOT TESTED. |
| Title, description, Open Graph | PASS | `<title>MyPlanScheduler</title>`, description "Plan Today · Do More · Live Better", `og:title` set. |
| Favicon | PASS | 432,254 bytes, the brand icon. It was the 25,931-byte default Next.js icon, which §39 forbids. |
| PWA manifest | PASS | Served, with brand name, theme colour and four icons (any + maskable). |
| Old brand string | PASS | No "My scheduler" remains in shipped HTML or JS. |
| Secrets in the bundle | PASS | No private key. The `AIza…` value in the bundle is Firebase's public web API key, which identifies the project and is meant to ship to browsers; access is governed by the security rules, not by hiding it. |

## Feature results

| Area | Result | Notes |
|---|---|---|
| **Board** — lists, cards, create / rename / delete list | NOT TESTED | Existing code, not modified apart from colour tokens. |
| **Board drag-and-drop**, optimistic update, rollback | NOT TESTED | Existing `@dnd-kit` code, unchanged in behaviour. |
| **Version / concurrency** | NOT TESTED | **Changed.** Moves now pass the version the card showed and report `hadConflict`, with a toast. Edits through `updateTaskFields` now bump `version` (they did not before, so a web edit was invisible to the check). Matches Flutter: last write wins, with the conflict reported. Needs two sessions to test. |
| **Task card** — category, title, date, time, priority, reminder, attachment, subtasks | NOT TESTED | Rewritten. Reminder count now reads the effective, enabled reminders. |
| **Subtasks on card**, tick without opening the dialog | NOT TESTED | The row is its own button and stops pointer events, which is what prevents the dialog opening and the drag starting. Not exercised. |
| **Show-subtasks setting** (ON default / OFF) | NOT TESTED | Stored on the account. |
| **Attachments** — upload, progress, cancel, retry, delete, image viewer | NOT TESTED | New. Needs a real Storage upload. Size and type are checked before the network is touched, mirroring `storage.rules`. |
| Attachment thumbnails on cards | NOT TESTED | Written through a denormalised `attachmentPreview` field in the shape Flutter reads. Tasks that already have attachments show no thumbnail until their attachments change. |
| **URL preview** | NOT TESTED (parsing PASS) | URL parsing and YouTube thumbnail derivation are unit-tested. It does not fetch Open Graph metadata: the browser blocks that cross-origin request and a static export has no server to proxy it. Unknown hosts fall back to the domain. |
| **Board → Calendar** is one record | NOT TESTED | No `calendarEvents` collection exists; the calendar reads tasks. |
| **Calendar views** — Day, 3 Days, Week, Month, Agenda; persisted | NOT TESTED | New 3-Day and Agenda views; the selection is saved to the account. |
| **Calendar opens at 9 AM** | NOT TESTED | The scroll is applied in a layout effect. Default value is unit-tested; the scroll itself is not. |
| Calendar drag, move, resize | NOT TESTED | The resize arithmetic now uses the density's hour height — the change most worth a manual check, because an error would silently write a wrong end time. |
| Calendar category colours | NOT TESTED | Events take the task's category colour. A colour-picker for categories was not reviewed. |
| **Reminders** — multiple, presets, custom unit | NOT TESTED (logic PASS) | New editor. The model, fire-time maths and the "disabled / completed never fires" rules are unit-tested. |
| **Reminder rescheduling** | PASS (logic) / NOT TESTED (end to end) | The fire time is derived from the task's start, so moving 6 PM to 8 PM moves a 30-minute reminder from 5:30 to 7:30 — unit-tested. The web writes only data; the Flutter apps cancel every id the task owned and recompute. Whether the phone actually does so was not tested here. |
| Reminder editor preserves the mobile app's extra fields | PASS (unit) | Unknown fields round-trip. This is the guard against stripping alarm/sound settings. |
| Legacy offsets not resurrected | NOT TESTED | The editor clears `reminderOffsets` when it writes, because Flutter falls back to them when `reminders` is empty. Reasoned from the Flutter code, not run. |
| **Reminders page** — Today / Tomorrow / Later, click opens the task | NOT TESTED | Rebuilt around task reminders. |
| **Browser notifications** — permission handling | NOT TESTED | Asks once, on a click only; granted / denied / blocked / unsupported each have their own text. |
| Browser notifications actually firing | NOT TESTED | **Only while a tab is open** — there is no service worker or push server. The Settings page says so. This is not a substitute for the mobile app's alerts. |
| **Holidays** — country, category filter, calendar display | PASS (logic) / NOT TESTED (UI) | Dates and filtering are unit-tested. The hard-coded "World Teachers' Day" seed is gone. Holiday pills render beside tasks and have no drag behaviour. |
| Holiday preference sync to other devices | NOT TESTED | Written to `users/{uid}.appPreferences`, the field the Flutter app uses, with matching key names. Not confirmed from a second device. |
| **Categories** (global filter) | NOT TESTED | Not modified. |
| **Search** — tasks, subtasks, boards, lists, categories, notes, attachments; filters | NOT TESTED | **Not reviewed or changed.** The filters and the attachment scope in the brief were not checked against the existing page. |
| **Today** uses the same task data | NOT TESTED | Not reviewed or changed. |
| **Notes** | NOT TESTED | Not reviewed or changed. |
| **Authentication** — register, login, logout, reset, Google | NOT TESTED | Not modified. |
| **Security** — user A cannot read or write user B's data | NOT TESTED | The Firestore rule (`users/{uid}/{document=**}` requires `auth.uid == uid`) and the Storage rule were read and the design is sound, but no cross-account test was run. The rules live in the Flutter repository, not this one. |
| **Dark mode** | NOT TESTED | One token set in `globals.css`; computed contrast is 6.3:1 for secondary text on the dark card (the old value was 3.6:1). The native-dropdown fix uses `color-scheme`. Not looked at. |
| Tailwind `dark:` variant under an explicit theme | NOT TESTED | **Fixed a real bug**: `dark:` followed the OS setting, not the app's `data-theme`, so choosing Dark on a light OS applied none of those styles. Rebound with `@custom-variant`; the four call sites were also moved to tokens. |
| **Light mode** | NOT TESTED | Same token set. |
| **Responsive** — 390×844 to 1920×1080 | NOT TESTED | No viewport was opened. |
| Mobile navigation | NOT TESTED | **Fixed a real bug**: the phone nav showed only the first five entries, so Settings, Holidays and Reminders were unreachable on a small screen. It is now Today / Boards / Calendar / Inbox / More, with everything else under More. |
| Touch drag-and-drop | NOT TESTED | The calendar has a touch sensor; the board was not checked. |
| **Loading / empty / error / retry** | NOT TESTED | New banner for listener errors (permission denied, unavailable) with a Retry. Offline banner already existed. Not every page has its own loading state. |
| Branded 404 and error pages | NOT TESTED | `not-found.tsx` and `error.tsx` added; the build includes `/_not-found`. |
| **Performance** | NOT TESTED | **Not worked on.** No virtualisation or pagination was added for large lists, and the Firestore queries were not reviewed. |
| **Archive task** | BLOCKED | Not built. Neither client has an archive concept in the shared data model, and a web-only version would make the two clients disagree about the same task. Needs a decision to add an `archived` field to both. |
| Settings: Widgets, Security, Privacy, Check for Updates, Rate App | BLOCKED | Not built. They describe native-app features; there are no web widgets, and update checks and ratings belong to the app stores. Appearance, Calendar, Tasks, Notifications, Holidays, Categories, Account and About exist. |

## Deployment

See the section at the bottom, written after the deploy ran.

## What a human still has to do

1. Sign in on the web and on the Flutter app as the same user. Change the theme,
   the calendar view and the holiday countries on one and confirm they change on
   the other. This is the check that matters most, because the whole point is
   one shared account state.
2. Add reminders on the web, move the task's time, and confirm the **phone**
   re-schedules them. The web only writes data.
3. Open a task on two browsers, change it in one, drag it in the other, and
   confirm the conflict toast.
4. Drag a calendar event and resize it in all three layouts; check the end time.
5. Upload an image, a PDF and something over 50 MB.
6. Look at every screen in both themes, with the OS set to light while the app is
   set to Dark.
7. Check 390×844 and 768×1024 in particular.
8. Try signed in as user A while requesting user B's document path, to prove the
   rules.

## Deployment result (appended after the deploy)

Deployed to Firebase Hosting, project `myscheduleplanner-e22f3`, with
`firebase deploy --project myscheduleplanner-e22f3`. This repository has no
`.firebaserc`, so the flag is required. Its `firebase.json` contains only the
`hosting` block, so the deploy could not touch Firestore or Storage rules.

| Check | Result | Notes |
|---|---|---|
| Release | PASS | 138 files, 94 uploaded, release complete. |
| Live routes respond | PASS | See the status codes recorded when this was run. |
| Live title and favicon are the brand ones | PASS | Read back from the live site. |
| Correct environment and Firebase config in the production build | NOT TESTED | The build read `.env.local`. That a real sign-in works against the live site was not exercised. |
