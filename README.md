# Habit Checker

A progressive web app that reminds you of scheduled habits and rewards you for keeping streaks.

- Add habits with an emoji, the weekdays they're scheduled on, and an optional reminder time.
- Check them off each day. Streaks (🔥) count only scheduled days, so a Mon/Wed/Fri habit keeps its streak over the weekend.
- Earn 10 points per check-in, plus badges and 50 bonus points at 3, 7, 14, 30, 60 and 100-day streaks. You level up every 250 points.
- It works offline and can be installed to the home screen. All data stays in your browser.

## Run it

```sh
npm start   # then open http://localhost:8080
npm test
```

Reminders appear as system notifications while the app is open, after you tap "Turn on reminders".
