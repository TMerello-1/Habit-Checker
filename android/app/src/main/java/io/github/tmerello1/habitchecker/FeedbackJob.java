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
 * New-feedback notifications for admins. The web app gets these as Web Push; this app has no
 * push connection, so while an admin profile is signed in it asks the friends server for the
 * inbox about every 15 minutes (Android's shortest periodic job) and notifies about anything
 * newer than what it saw last.
 */
public class FeedbackJob extends JobService {
    // Keep in step with FRIENDS_SERVER in src/config.js.
    private static final String SERVER = "https://habit-checker-friends.habits-f6268550.workers.dev";
    private static final int JOB_ID = 1;
    private static final String CHANNEL = "feedback";

    /** Starts or stops the checks to match the friends data the web app just saved. */
    static void update(Context ctx, String friendsJson) {
        String code = "";
        try {
            JSONObject friends = new JSONObject(friendsJson);
            if (friends.optBoolean("admin") && friends.optJSONObject("me") != null) code = friends.optString("code");
        } catch (Exception e) {
            // Unreadable: treat as signed out.
        }
        JobScheduler js = ctx.getSystemService(JobScheduler.class);
        if (code.equals(Store.adminCode(ctx)) && (code.isEmpty() || js.getPendingJob(JOB_ID) != null)) return;
        Store.setAdminCode(ctx, code);
        if (code.isEmpty()) {
            js.cancel(JOB_ID);
            return;
        }
        js.schedule(new JobInfo.Builder(JOB_ID, new ComponentName(ctx, FeedbackJob.class))
                .setPeriodic(15 * 60 * 1000L)
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPersisted(true)
                .build());
    }

    @Override
    public boolean onStartJob(JobParameters params) {
        new Thread(() -> {
            try {
                check(getApplicationContext());
            } catch (Exception e) {
                // Offline or server trouble: the next run tries again.
            }
            jobFinished(params, false);
        }).start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return true;
    }

    private static void check(Context ctx) throws Exception {
        String code = Store.adminCode(ctx);
        if (code.isEmpty()) return;
        HttpURLConnection conn = (HttpURLConnection) new URL(SERVER + "/feedback").openConnection();
        conn.setRequestProperty("Authorization", "Bearer " + code);
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(15000);
        int status = conn.getResponseCode();
        if (status == 401 || status == 403) {
            // Profile deleted or no longer an admin.
            Store.setAdminCode(ctx, "");
            ctx.getSystemService(JobScheduler.class).cancel(JOB_ID);
            return;
        }
        if (status != 200) return;
        JSONArray feedback = new JSONObject(read(conn.getInputStream())).getJSONArray("feedback");

        // Newest first. ISO timestamps compare correctly as text.
        String seen = Store.feedbackSeen(ctx);
        String newest = feedback.length() > 0 ? feedback.getJSONObject(0).getString("createdAt") : "";
        int fresh = 0;
        for (int i = 0; i < feedback.length(); i++) {
            if (feedback.getJSONObject(i).getString("createdAt").compareTo(seen) > 0) fresh++;
        }
        if (newest.compareTo(seen) > 0) Store.setFeedbackSeen(ctx, newest);
        // The first check only notes what's there, so old feedback doesn't alert.
        if (seen.isEmpty() || fresh == 0) return;

        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel(
                CHANNEL, ctx.getString(R.string.feedback_channel), NotificationManager.IMPORTANCE_DEFAULT));
        if (!nm.areNotificationsEnabled()) return;
        Intent open = new Intent(ctx, MainActivity.class)
                .setData(Uri.parse(MainActivity.START_URL + "#inbox"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent tap = PendingIntent.getActivity(
                ctx, 1, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        String title = fresh == 1
                ? ctx.getString(R.string.feedback_title)
                : ctx.getString(R.string.feedback_title_many, fresh);
        nm.notify("feedback", 0, new Notification.Builder(ctx, CHANNEL)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(title)
                .setContentText(feedback.getJSONObject(0).getString("text"))
                .setStyle(new Notification.BigTextStyle().bigText(feedback.getJSONObject(0).getString("text")))
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
