# Habit Checker

A progressive web app that reminds you of scheduled habits and rewards you for keeping streaks.

- Add habits with an emoji, the weekdays they're scheduled on, and an optional reminder time.
- Check them off each day. Streaks (🔥) count only scheduled days, so a Mon/Wed/Fri habit keeps its streak over the weekend.
- Earn 10 points per check-in, plus badges and 50 bonus points at 3, 7, 14, 30, 60 and 100-day streaks. You level up every 250 points.
- It works offline and can be installed to the home screen with the "Install app" button. All data stays in your browser.

## Run it

```sh
npm start   # then open http://localhost:8080
npm test
```

Reminders appear as system notifications after you tap "Turn on reminders". With the push server (`server/`, a free Cloudflare Worker) deployed and its address in `src/config.js`, they arrive even while the app is closed. Otherwise they only fire while the app is open. On iPhone, push needs the app added to the home screen (iOS 16.4+).

### Push server setup

1. Create a free Cloudflare account.
2. In Cloudflare, create an API token from the "Edit Cloudflare Workers" template.
3. In this GitHub repo, add it under Settings → Secrets and variables → Actions as `CLOUDFLARE_API_TOKEN`.
4. Run the "Deploy push server" workflow from the Actions tab. Its summary shows the server's address.
5. Put that address in `src/config.js` as `PUSH_SERVER` (and bump `CACHE` in `sw.js`).
