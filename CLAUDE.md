# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Habit Checker: a progressive web app that reminds users of scheduled habits and rewards them for keeping streaks. Plain HTML/CSS/JS with native ES modules. There is no build step, no bundler and no runtime dependencies; files are served as-is.

## Commands

```sh
npm start                                  # serve on http://localhost:8080 (python3 -m http.server)
npm test                                   # run all tests (node --test auto-discovers tests/*.test.js)
node --test tests/habits.test.js           # run one test file
node --test --test-name-pattern="streak"   # run tests whose name matches
```

`node tools/build-preview.mjs > preview.html` bundles everything into one self-contained HTML fragment, which is published as the hosted phone preview (a claude.ai Artifact, https://claude.ai/artifact/2eL4pDTn9FzPCuGHEkdByx). Service workers and notifications don't work there, and `confirm()`/`alert()` are blocked, so keep UI confirmations in-page.

Requires Node 22+ (the built-in `node:test` runner). Don't pass a directory to `node --test` because Node 22 treats it as a module path and fails. The app must be served over http(s), not opened via `file://`, or the service worker and module imports won't load.

## Architecture

- `src/habits.js` holds the pure domain logic: scheduling (`isScheduled`), streaks and rewards. It has no DOM or storage access, which is what lets it be unit-tested under Node. New logic belongs here when it can be pure.
- `src/app.js` is the only file that touches the DOM. Every mutation goes through `commit()`, which saves state and re-renders the whole view. There is no framework and no partial diffing.
- `src/store.js` keeps the entire app state as one JSON blob in `localStorage` under `habit-checker:v1`: `{ version, habits, completions, notified }`. If the shape changes, bump `version` and migrate in `load()`.
- `src/reminders.js`: `dueReminders()` is pure and tested. `notify()` shows notifications through the service worker registration. `state.notified[habitId] = "YYYY-MM-DD"` stops a reminder from firing twice in a day. `setBadge()` puts the count of today's open habits (`openToday()`) on the app icon on every render; the Badging API only exists on desktop (Windows/macOS), and on Android the icon shows a dot only while a notification is up, so checking a habit off closes its reminder via `dismissReminder()`.
- `src/install.js` picks the "Install app" help text per browser (pure, tested). `app.js` uses the browser's `beforeinstallprompt` dialog when Chromium offers one and shows these menu steps otherwise; the button hides once the app runs standalone. Installability depends on the PNG icons in `manifest.webmanifest` (rendered from `icons/icon.svg`).
- `src/i18n.js` holds all UI text in English and German. `t(key, vars)` looks strings up in the current language, which `app.js` picks from `navigator.languages` (English fallback); `index.html` keeps the English text and marks elements with `data-i18n`, `data-i18n-placeholder`, `data-i18n-aria-label` or `data-i18n-day` so `app.js` swaps in translations at startup. New user-facing text goes in both languages (a test checks they match). The Android app's text lives in `res/values/strings.xml` and `res/values-de/strings.xml`.
- `src/transfer.js` exports and validates the state as copied text (pure, tested), for the "Move your data" section that carries habits between the PWA and the Android app.
- `android/` is a Java Android app (no dependencies) that loads the GitHub Pages site in a WebView and adds the user-agent token `HabitCheckerAndroid`, which `app.js` checks. A script injected after page load wraps `localStorage.setItem` and passes each save of `habit-checker:v1` to the app, where `Habits.java` re-implements `isScheduled`/open-today for the home screen widget and native reminders (AlarmManager, so they fire while closed). Keep `Habits.java` in step with `src/habits.js` and the state shape. CI (`.github/workflows/android.yml`) builds the APK and publishes it as the `android-latest` release; the Android SDK can't be downloaded in Claude's cloud sandbox, so CI is the only build check.
- `sw.js` is a cache-first service worker for offline use, and it also handles notification clicks.

### Key invariants

- **Dates are local calendar keys** (`"YYYY-MM-DD"`, built by `dateKey()` in `src/dates.js`), never UTC ISO strings. `completions[habitId]` is an array of these keys.
- **Streaks count only scheduled days.** Unscheduled weekdays are skipped and don't break a streak. Today being scheduled but not yet done also doesn't break it. Days before `habit.createdAt` never count.
- **Rewards are derived, never stored.** `rewards()` recomputes points, level and badges from the completion history every time, so un-checking a habit takes its points back. Scoring is 10 pts per check-in plus 50 pts per streak-milestone badge (`STREAK_MILESTONES`), with a new level every 250 pts.

### Reminders limitation

Reminders only fire while the app is open: `app.js` polls `dueReminders()` every 30s. A static PWA has no reliable way to wake itself at a set time when closed, so real background reminders would need a Web Push server (VAPID keys plus a `push` handler in `sw.js`).

## When changing files

- Adding, renaming or removing any shipped file means updating the `ASSETS` list in `sw.js`.
- Any change to a shipped file requires bumping `CACHE` in `sw.js`. The worker is cache-first, so without a bump installed users keep the old version.
