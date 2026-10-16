package io.github.tmerello1.habitchecker;

import android.content.Context;
import android.content.SharedPreferences;

/** The last state the web app saved, mirrored here so the widget and alarms can read it. */
final class Store {
    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences("habit-checker", Context.MODE_PRIVATE);
    }

    static String state(Context ctx) {
        return prefs(ctx).getString("state", null);
    }

    static void saveState(Context ctx, String json) {
        prefs(ctx).edit().putString("state", json).apply();
    }

    /** The day a habit's reminder last fired, so it fires once a day (state.notified on the web). */
    static String notified(Context ctx, String habitId) {
        return prefs(ctx).getString("notified:" + habitId, "");
    }

    static void setNotified(Context ctx, String habitId, String day) {
        prefs(ctx).edit().putString("notified:" + habitId, day).apply();
    }
}
