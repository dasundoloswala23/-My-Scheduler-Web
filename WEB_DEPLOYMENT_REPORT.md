# Web deployment report

Statuses are only **PASS / FIXED / PARTIAL / FAILED / BLOCKED / NOT TESTED**. A PASS here means
the check was run, in a real browser or against the real service, and the evidence is named.

## Deployment

| | |
|---|---|
| Provider | **Firebase Hosting** (the existing one: `firebase.json` → `hosting.public: "out"`; the site is a static export, `output: "export"`). No provider was changed or added. |
| Firebase project | `myscheduleplanner-e22f3` |
| Production URL | https://myscheduleplanner-e22f3.web.app |
| Deployed | 2026-10-09 07:04 (machine clock, Sri Lanka time) with `firebase deploy --only hosting --project myscheduleplanner-e22f3` (hosting target only; no rules or functions touched by this deploy) |
| Commit deployed | `ff420c0` on `main` of this repository. **It is a local commit and has not been pushed to the git remote** (pushing was held back at the owner's request). The deployed files are the `out/` built from exactly that tree. |
| Build | `next build` (Next 16.3.8): compiled, TypeScript clean, 24 static pages generated |
| Environment | `.env.local` (git-ignored) supplied the public `NEXT_PUBLIC_FIREBASE_*` values; no secret, service account or private key is in the tree or the diff |

## Test results before deploy

| Check | Result | Evidence |
|---|---|---|
| Unit tests | PASS | `npm test` → 126 tests, 0 failed (`node --test lib/*.test.ts`) |
| Type check | PASS | `npx tsc --noEmit`, no output |
| Lint | PASS | `npm run lint`, no output |
| Production build | PASS | `npm run build`, routes below |
| Browser smoke test on the built `out/` | PASS | Playwright, Chromium, local static server mimicking Hosting: 47/47 |
| Recurrence in a browser, checked in the database | PASS | 12/12 |
| Account deletion with a throwaway account | PASS | 13/13 |
| Firebase security | PASS | see Security |

Routes built: `/`, `/login`, `/today`, `/inbox`, `/boards`, `/board`, `/calendar`, `/search`,
`/categories`, `/notes`, `/reminders`, `/holidays`, `/focus`, `/eisenhower`, `/statistics`,
`/settings`, `/flows`, `/flow`, `/privacy`, `/terms`, `/manifest.webmanifest`.

## Root cause of the completion mismatch, and the fix: FIXED

The deployed site completed a task **in place** (set `completed`, leave it in its list), had no
Complete list, and for a repeating task wrote a **new random-id document** with no guard, so a
double tap or two devices made two. The Flutter app MOVES the task to its board's Complete list
(same id), remembers `completedFromListId`, and creates the next occurrence in the original list
with a deterministic id (`{taskId}-next-{startMillis}`) recorded in `spawnedNextTaskId`.

The web now runs the same rules, ported to `lib/completion.ts`, `lib/lists.ts` and
`lib/recurrence.ts` (pure, no Firebase) and written by one atomic batch in `lib/repo.ts`. Their
tests reuse the Flutter vectors (`completion.test.ts`, `recurrence.test.ts`). The web also now
creates new boards with the default lists, migrates "Done" to "Complete" (`listsVersion: 2`, same
flag and the same deterministic `complete-{boardId}` id as Flutter), refuses to delete the Complete
list, and keeps a deleted list's cards.

## Verification on the deployed site

Run against https://myscheduleplanner-e22f3.web.app after the deploy, in Chromium, signed in as the
shared test account (everything created was deleted afterwards; the account is back to its 13 tasks).

| Area | Status | Evidence |
|---|---|---|
| Site loads over HTTPS | PASS | HTTP 200; `Strict-Transport-Security: max-age=31556926; includeSubDomains; preload`; `http://` answers 301 |
| Login (email/password) | PASS | e2e: sign-in leaves `/login` |
| Google sign-in | NOT TESTED | needs an interactive Google consent; the code path is unchanged |
| Sign out | NOT TESTED in the live run | the button is unchanged; account deletion (below) signs the user out and returns to `/login` |
| Protected routes, direct load | PASS | 15 routes loaded directly while signed in: all HTTP 200 and stay on the route |
| Public routes | PASS | `/login`, `/privacy`, `/terms` load signed out |
| Refresh keeps the page and the data | PASS | a new card survives `page.reload()` |
| Deep links `/board?id=` and `/flow?id=` | PASS | board opens from its link; flow opens after creation. An unknown id answers HTTP 200 (see the soft-404 limitation) and shows a loading placeholder rather than a "not found" message |
| Board: lists, no "Done" list | PASS | `Inbox, Todo, In progress, Waiting, Complete, Someday` |
| Create a card | PASS | appears in Todo, persists across refresh |
| Complete → Complete list | PASS | the card moves; it leaves Todo; the number of cards with that title does not change |
| Re-open → back where it came from | PASS | |
| Recurrence (daily) | PASS | read back from Firestore: exactly two documents; the original is `completed`, in Complete, `completedFromListId` = Todo; the next occurrence has id `{id}-next-{ms}`, is one calendar day later at the same time, open, in Todo, version 1; a double click did not create a second; re-opening removed the untouched next occurrence and cleared `spawnedNextTaskId` |
| Weekdays / weekly / monthly / yearly | PARTIAL | covered by 15 unit tests (same vectors as Flutter, including month ends and DST-safe wall-clock time); only **daily** was driven in the browser |
| List Move left / Move right | PASS | swap and restore verified |
| Top / between / end drop zones | PARTIAL | the zones render (a labelled zone exists above the first card); **an actual pointer drag onto the zone was not exercised in a browser**. The drop logic is shared with the existing between-card path |
| Calendar (Day / 3-Day / Week / Month) | PARTIAL | `/calendar` loads signed in; views, drag and resize were **not** driven this pass. The calendar code was not changed by this work |
| Project Flow: create from template | PASS | Mobile App Launch → 0/9 stages; stage 1 active, stage 2 up next |
| Project Flow: link an existing task | PASS | stage shows 0/1 tasks; no task document was created |
| Project Flow: completing the task | PASS | stage 1 completed, stage 2 active, "1/9 stages complete" |
| Board card badge | PASS | `Flow 1/9` on the linked card |
| Flow Advisor | PASS | labels its source "keyword match, not AI"; says no tasks are created; Add all produced the stages |
| Dependency mode, cycles, stage unlocking rules | PASS (unit) | 36 engine tests with the Flutter vectors; **dependency editing UI not driven in a browser** |
| Holidays: Public / Bank / Mercantile / Other | PASS | the four groups are shown; grouping logic unit-tested; persistence uses the existing preference |
| Privacy and Terms | PASS | both load signed out; linked from Settings and the sign-in page |
| Account deletion | PASS | throwaway account, both locally and on the live site: wrong password refused with data untouched; with the final Auth step blocked, the data was already gone (tasks, boards, lists, categories, flows, stages, links, user document) and the account still existed; the retry succeeded, returned to `/login`; the account could no longer sign in |
| Account deletion, Google accounts | NOT TESTED | re-authentication uses a popup |
| New-account seeding | PASS | a brand-new account gets one board with six lists, exactly one Complete, and `listsVersion: 2` |

## Responsive and dark mode

| Check | Status | Evidence |
|---|---|---|
| No page-level horizontal overflow, board and flows at 1360, 820 and 390 px | PASS | measured `scrollWidth` against `innerWidth` |
| Screenshots reviewed | PARTIAL | flow detail (desktop) and board (phone) were viewed; tablet was measured, not viewed |
| Dark mode | PARTIAL | the flows page was rendered with `prefers-color-scheme: dark` and a screenshot taken; **it was not reviewed pixel by pixel**, and the board/forms/dialogs were not |
| Keyboard / dialogs / mobile browser real device | NOT TESTED | emulated viewports only |

## Security

| Check | Status | Evidence |
|---|---|---|
| Rules emulator suite | PASS | 62/62 (`tools/rules-tests` in the Flutter repository): owner allowed; another user and signed-out denied, per collection; malformed documents refused |
| Live: user A cannot read, list, overwrite, delete or create into user B's space; B cannot read A | PASS | 30/30 (`rules-live.test.mjs`) with two real accounts; the second was created for the run and deleted |
| Live: signed-out cannot list or write | PASS | HTTP 401/403 |
| Live: malformed documents refused for tasks and the three flow collections | PASS | |
| Storage rules | PASS | the existing 19-check suite, unchanged and green |
| The Firestore rules were tightened for this release | FIXED | no wildcard under `users/{uid}`; shape validators; **deployed 2026-10-08** after the emulator run and a live baseline, then re-run live. Previous ruleset for rollback: `git show 07dd3c3:firestore.rules` in the Flutter repository |

The web's writes (cards, completion, flows, account deletion, bootstrap) all passed under the
deployed rules, which is the check that the stricter rules did not break this client.

## Known limitations

- **Soft 404.** Any unknown path (for example `/nope`) answers HTTP **200** with the 404 page,
  because `firebase.json` rewrites `**` to `/404.html`. This predates this work and was not changed
  (the brief said to keep the existing hosting setup). The same rewrite also answers Next's RSC
  prefetch files with HTML instead of 404, so the router falls back to a normal navigation; that is
  harmless but noisy in the network panel.
- **A deleted account's ID token stays valid for up to an hour** (a Firebase property). After
  deletion its data is gone and the account cannot sign in again, but that token can still make
  writes under the old uid until it expires.
- **The web cannot fire reminders when the site is closed.** Browsers do not allow it.
- A monthly task started on the 31st drifts after clamping (31 Jan → 28 Feb → 28 Mar). Same
  limitation as the Flutter app, documented in `lib/recurrence.ts`.
- Completion on a card is not optimistic: the checkbox changes when Firestore confirms, normally
  well under a second but visible on a slow connection. The task and its board's lists are now
  read in parallel to shorten it.
- Project Flow edits are not transactional; the screens evaluate the engine live from the tasks, so
  they cannot show a wrong state, and the stored copy is repaired by the next change.

## Not covered by this report

Android, Windows and iOS/macOS are in the Flutter repository's `WINDOWS_QA_REPORT.md` and
`docs/MAC_HANDOFF.md`.

**WEB STATUS: READY FOR PRODUCTION**, with the PARTIAL and NOT TESTED rows above stated as such:
drag-and-drop onto the new drop zones, the calendar interactions, and Google sign-in were not
exercised in a browser. Nothing found blocks use of the site.
