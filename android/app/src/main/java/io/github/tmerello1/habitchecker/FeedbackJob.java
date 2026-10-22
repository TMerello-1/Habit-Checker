package io.github.tmerello1.habitchecker;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Feedback notifications. The web app gets these as Web Push; this app has no push
 * connection, so it asks the friends server about every 15 minutes (Android's shortest
 * periodic job) and notifies about anything newer than what it saw last:
 * - for an admin profile signed in here, new feedback and senders' answers in the inbox;
 * - for feedback sent from here, replies and reactions (the threads the web app keeps under
 *   habit-checker:feedback, each opened with its own token).
 */
public class FeedbackJob extends JobService {
    // Keep in step with FRIENDS_SERVER in src/config.js.
    private static final String SERVER = "https://habit-checker-friends.habits-f6268550.workers.dev";
    private static final int JOB_ID = 1;
    private static final String CHANNEL = "feedback";

    /** Takes in the friends data the web app just saved: is an admin signed in here? */
    static void update(Context ctx, String friendsJson) {
        String code = "";
        String inboxSeen = "";
        try {
            JSONObject friends = new JSONObject(friendsJson);
            if (friends.optBoolean("admin") && friends.optJSONObject("me") != null) code = friends.optString("code");
            inboxSeen = friends.optString("inboxSeen");
        } catch (Exception e) {
            // Unreadable: treat as signed out.
        }
        Store.setAdminCode(ctx, code);
        Store.setInboxSeen(ctx, inboxSeen);
        reschedule(ctx);
        HabitWidget.refresh(ctx);
    }

    /** Takes in the feedback threads the web app just saved. */
    static void updateThreads(Context ctx, String threadsJson) {
        Store.setThreads(ctx, threadsJson == null ? "[]" : threadsJson);
        reschedule(ctx);
        HabitWidget.refresh(ctx);
    }

    /**
     * Where unread feedback is, for the widget's 📨: "#inbox" when an admin signed in here has
     * feedback or answers newer than the inbox showed, "#feedback" when feedback sent from here
     * has replies or a reaction not yet opened, otherwise null.
     */
    static String unread(Context ctx) {
        if (!Store.adminCode(ctx).isEmpty() && Store.feedbackSeen(ctx).compareTo(Store.inboxSeen(ctx)) > 0) return "#inbox";
        JSONArray threads = openThreads(ctx);
        for (int i = 0; i < threads.length(); i++) {
            JSONObject t = threads.optJSONObject(i);
            if (t == null) continue;
            // What the app last fetched, or what this job saw since, whichever knows more.
            int replies = 0;
            JSONArray messages = t.optJSONArray("messages");
            for (int j = 0; messages != null && j < messages.length(); j++) {
                JSONObject m = messages.optJSONObject(j);
                if (m != null && m.optBoolean("fromAdmin")) replies++;
            }
            String reaction = t.optString("reaction");
            String[] seen = Store.threadSeen(ctx, t.optString("id"), "").split("\\|", -1);
            if (seen.length == 2) {
                try {
                    replies = Math.max(replies, Integer.parseInt(seen[0]));
                } catch (NumberFormatException e) {
                    // Keep the app's count.
                }
                reaction = seen[1];
            }
            if (replies > t.optInt("seenAdmin")) return "#feedback";
            if (!reaction.isEmpty() && !reaction.equals(t.optString("seenReaction"))) return "#feedback";
        }
        return null;
    }

    /** Runs the checks while there's anything to check, and stops them otherwise. */
    private static void reschedule(Context ctx) {
        JobScheduler js = ctx.getSystemService(JobScheduler.class);
        boolean needed = !Store.adminCode(ctx).isEmpty() || openThreads(ctx).length() > 0;
        if (!needed) {
            js.cancel(JOB_ID);
            return;
        }
        if (js.getPendingJob(JOB_ID) != null) return;
        js.schedule(new JobInfo.Builder(JOB_ID, new ComponentName(ctx, FeedbackJob.class))
                .setPeriodic(15 * 60 * 1000L)
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPersisted(true)
                .build());
    }

    private static JSONArray openThreads(Context ctx) {
        JSONArray open = new JSONArray();
        try {
            JSONArray all = new JSONArray(Store.threads(ctx));
            for (int i = 0; i < all.length(); i++) {
                JSONObject t = all.getJSONObject(i);
                if (!t.optBoolean("closed")) open.put(t);
            }
        } catch (Exception e) {
            // Nothing readable stored.
        }
        return open;
    }

    @Override
    public boolean onStartJob(JobParameters params) {
        new Thread(() -> {
            try {
                checkInbox(getApplicationContext());
            } catch (Exception e) {
                // Offline or server trouble: the next run tries again.
            }
            try {
                checkThreads(getApplicationContext());
            } catch (Exception e) {
                // Same.
            }
            HabitWidget.refresh(getApplicationContext());
            jobFinished(params, false);
        }).start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return true;
    }

    private static HttpURLConnection open(String path) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(SERVER + path).openConnection();
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(15000);
        return conn;
    }

    /** Admins: new feedback, and senders answering in a thread, since the last check. */
    private static void checkInbox(Context ctx) throws Exception {
        String code = Store.adminCode(ctx);
        if (code.isEmpty()) return;
        HttpURLConnection conn = open("/feedback");
        conn.setRequestProperty("Authorization", "Bearer " + code);
        int status = conn.getResponseCode();
        if (status == 401 || status == 403) {
            // Profile deleted or no longer an admin.
            Store.setAdminCode(ctx, "");
            reschedule(ctx);
            return;
        }
        if (status != 200) return;
        JSONArray feedback = new JSONObject(read(conn.getInputStream())).getJSONArray("feedback");

        // ISO timestamps compare correctly as text.
        String seen = Store.feedbackSeen(ctx);
        String newest = seen;
        String latestText = "";
        int fresh = 0;
        for (int i = 0; i < feedback.length(); i++) {
            JSONObject f = feedback.getJSONObject(i);
            JSONArray items = new JSONArray().put(f);
            JSONArray messages = f.optJSONArray("messages");
            for (int j = 0; messages != null && j < messages.length(); j++) {
                if (!messages.getJSONObject(j).optBoolean("fromAdmin")) items.put(messages.getJSONObject(j));
            }
            for (int j = 0; j < items.length(); j++) {
                String at = items.getJSONObject(j).getString("createdAt");
                if (at.compareTo(seen) <= 0) continue;
                fresh++;
                if (at.compareTo(newest) > 0) {
                    newest = at;
                    latestText = items.getJSONObject(j).getString("text");
                }
            }
        }
        if (!newest.equals(seen)) Store.setFeedbackSeen(ctx, newest);
        // The first check only notes what's there, so old feedback doesn't alert.
        if (seen.isEmpty() || fresh == 0) return;
        String title = fresh == 1
                ? ctx.getString(R.string.feedback_title)
                : ctx.getString(R.string.feedback_title_many, fresh);
        notify(ctx, "feedback", "#inbox", title, latestText);
    }

    /** Senders: replies and reactions to feedback sent from here. */
    private static void checkThreads(Context ctx) throws Exception {
        JSONArray threads = openThreads(ctx);
        for (int i = 0; i < threads.length(); i++) {
            JSONObject t = threads.getJSONObject(i);
            String id = t.getString("id");
            if (!id.matches("[\\w-]{1,64}")) continue;
            HttpURLConnection conn = open("/threads/" + id);
            conn.setRequestProperty("X-Feedback-Token", t.getString("token"));
            if (conn.getResponseCode() != 200) continue;
            JSONObject remote = new JSONObject(read(conn.getInputStream()));
            String reaction = remote.optString("reaction");
            JSONArray messages = remote.optJSONArray("messages");
            int replies = 0;
            String lastReply = "";
            for (int j = 0; messages != null && j < messages.length(); j++) {
                JSONObject m = messages.getJSONObject(j);
                if (m.optBoolean("fromAdmin")) {
                    replies++;
                    lastReply = m.getString("text");
                }
            }
            // Until this check has seen a thread, it counts what the app already showed.
            String[] seen = Store.threadSeen(ctx, id, t.optInt("seenAdmin") + "|" + t.optString("seenReaction")).split("\\|", -1);
            int seenReplies = Integer.parseInt(seen[0]);
            String seenReaction = seen.length > 1 ? seen[1] : "";
            Store.setThreadSeen(ctx, id, replies + "|" + reaction);
            if (replies > seenReplies) {
                notify(ctx, "reply:" + id, "#feedback", ctx.getString(R.string.feedback_reply_title), lastReply);
            } else if (!reaction.isEmpty() && !reaction.equals(seenReaction)) {
                notify(ctx, "reply:" + id, "#feedback", ctx.getString(R.string.feedback_reaction_title, reaction), t.optString("text"));
            }
        }
    }

    private static void notify(Context ctx, String tag, String hash, String title, String text) {
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel(
                CHANNEL, ctx.getString(R.string.feedback_channel), NotificationManager.IMPORTANCE_DEFAULT));
        if (!nm.areNotificationsEnabled()) return;
        Intent open = new Intent(ctx, MainActivity.class)
                .setData(Uri.parse(MainActivity.START_URL + hash))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent tap = PendingIntent.getActivity(
                ctx, tag.hashCode(), open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        nm.notify(tag, 0, new Notification.Builder(ctx, CHANNEL)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setContentIntent(tap)
                .setAutoCancel(true)
                .build());
    }

    private static String read(InputStream in) throws Exception {
        try (in) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
            return out.toString(StandardCharsets.UTF_8.name());
        }
    }
}
