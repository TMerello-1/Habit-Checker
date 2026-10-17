# Habit Checker

A progressive web app that reminds you of scheduled habits and rewards you for keeping streaks.

- Add habits with an emoji, the weekdays they're scheduled on, and an optional reminder time.
- Check them off each day. Streaks (🔥) count only scheduled days, so a Mon/Wed/Fri habit keeps its streak over the weekend.
- Earn 10 points per check-in, plus badges and 50 bonus points at 3, 7, 14, 30, 60 and 100-day streaks. You level up every 250 points.
- It works offline and can be installed to the home screen with the "Install app" button. Your habits stay in your browser.
- Add friends under **Friends** with an anonymous name like "Sleepy Otter". Friends see only each other's name, level and best streak, and you can give each friend a nickname only you see.

## Run it

```sh
npm start   # then open http://localhost:8080
npm test
```

Reminders appear as system notifications while the app is open, after you tap "Turn on reminders".

## Android app and widget

`android/` is a small Android app that runs this site in a WebView and adds a home screen widget listing today's open habits. It also shows reminders natively, so they fire even while the app is closed.

1. On your phone, download `habit-checker.apk` from the [android-latest release](https://github.com/TMerello-1/Habit-Checker/releases/tag/android-latest) and open it. Allow installing from your browser when Android asks.
2. In the PWA, open **Move your data** and tap **Copy my data**. In the Android app, paste it into the same section and tap **Replace my data with this**. The two keep separate data, so use the Android app from then on.
3. Long-press the home screen, choose **Widgets**, and drag **Habit Checker** onto it.

The APK is built by `.github/workflows/android.yml` and republished whenever `android/` changes on main. To make updates install over the previous version, add the repo secrets `ANDROID_KEYSTORE` (a base64-encoded keystore with key alias `habit-checker`) and `ANDROID_KEYSTORE_PASSWORD`. Without them each build is signed with a new key, and updating means copying your data, uninstalling, then reinstalling.

## Friends server

The Friends section needs the small server in `friends-server/` (a Cloudflare Worker with a D1 database, free tier). To set it up:

1. In Cloudflare, create an API token from the **Edit Cloudflare Workers** template and add the permission **Account → D1 → Edit**.
2. Add it to this repo as the secret `CLOUDFLARE_API_TOKEN`, then run the **Deploy friends server** workflow. It creates the database and prints the server's address.
3. Put that address in `src/config.js` as `FRIENDS_SERVER`.

Save your recovery code (Friends → Show my recovery code): it's the only way to get your profile back on a new phone.
