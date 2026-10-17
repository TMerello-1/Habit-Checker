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

    /** The recovery code of a signed-in admin profile, for FeedbackJob; empty otherwise. */
    static String adminCode(Context ctx) {
        return prefs(ctx).getString("adminCode", "");
    }

    static void setAdminCode(Context ctx, String code) {
        prefs(ctx).edit().putString("adminCode", code).apply();
    }

    /** When the newest feedback FeedbackJob has seen was sent (an ISO timestamp). */
    static String feedbackSeen(Context ctx) {
        return prefs(ctx).getString("feedbackSeen", "");
    }

    static void setFeedbackSeen(Context ctx, String createdAt) {
        prefs(ctx).edit().putString("feedbackSeen", createdAt).apply();
    }
}
