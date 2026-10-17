package io.github.tmerello1.habitchecker;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.widget.Toast;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Offers new builds from the android-latest release. The release title carries the CI run
 * number ("build N", see .github/workflows/android.yml), which is also the versionCode, so a
 * higher number means a newer APK. "Update" downloads it and opens Android's installer; with
 * the stable signing key it installs over this app and keeps its data.
 */
final class Updater {
    private static final String RELEASE =
            "https://api.github.com/repos/TMerello-1/Habit-Checker/releases/tags/android-latest";
    private static final String APK_TYPE = "application/vnd.android.package-archive";
    private static final long LATER_MS = 24 * 60 * 60 * 1000L; // "Later" asks again a day on

    static void check(Activity activity) {
        Context app = activity.getApplicationContext();
        new Thread(() -> {
            try {
                JSONObject release = new JSONObject(get(RELEASE));
                Matcher m = Pattern.compile("build (\\d+)").matcher(release.optString("name"));
                String apk = apkUrl(release.optJSONArray("assets"));
                if (!m.find() || apk == null) return;
                long latest = Long.parseLong(m.group(1));
                long current = versionCode(app);
                SharedPreferences prefs = app.getSharedPreferences("updater", Context.MODE_PRIVATE);
                if (latest <= current || System.currentTimeMillis() < prefs.getLong("later:" + latest, 0)) return;
                activity.runOnUiThread(() -> {
                    if (activity.isFinishing()) return;
                    new AlertDialog.Builder(activity)
                            .setTitle(R.string.update_title)
                            .setMessage(R.string.update_message)
                            .setPositiveButton(R.string.update_now, (d, w) -> download(app, apk, latest))
                            .setNegativeButton(R.string.update_later, (d, w) -> prefs.edit()
                                    .putLong("later:" + latest, System.currentTimeMillis() + LATER_MS).apply())
                            .show();
                });
            } catch (Exception e) {
                // Offline or GitHub unreachable: try again next launch.
            }
        }).start();
    }

    private static void download(Context app, String url, long build) {
        DownloadManager dm = app.getSystemService(DownloadManager.class);
        long id = dm.enqueue(new DownloadManager.Request(Uri.parse(url))
                .setTitle(app.getString(R.string.app_name))
                .setMimeType(APK_TYPE)
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setDestinationInExternalFilesDir(app, Environment.DIRECTORY_DOWNLOADS, "habit-checker-" + build + ".apk"));
        Toast.makeText(app, R.string.update_downloading, Toast.LENGTH_SHORT).show();

        BroadcastReceiver done = new BroadcastReceiver() {
            @Override
            public void onReceive(Context ctx, Intent intent) {
                if (intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1) != id) return;
                app.unregisterReceiver(this);
                Uri apk = dm.getUriForDownloadedFile(id);
                if (apk == null) {
                    Toast.makeText(app, R.string.update_failed, Toast.LENGTH_LONG).show();
                    return;
                }
                app.startActivity(new Intent(Intent.ACTION_VIEW)
                        .setDataAndType(apk, APK_TYPE)
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK));
            }
        };
        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        // The broadcast comes from the system's download app, so the receiver must be exported.
        if (Build.VERSION.SDK_INT >= 33) app.registerReceiver(done, filter, Context.RECEIVER_EXPORTED);
        else app.registerReceiver(done, filter);
    }

    @SuppressWarnings("deprecation")
    private static long versionCode(Context app) throws Exception {
        PackageInfo info = app.getPackageManager().getPackageInfo(app.getPackageName(), 0);
        return Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode;
    }

    private static String apkUrl(JSONArray assets) {
        for (int i = 0; assets != null && i < assets.length(); i++) {
            JSONObject a = assets.optJSONObject(i);
            if (a != null && a.optString("name").endsWith(".apk")) return a.optString("browser_download_url", null);
        }
        return null;
    }

    private static String get(String url) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(10_000);
        c.setReadTimeout(10_000);
        c.setRequestProperty("Accept", "application/vnd.github+json");
        try (InputStream in = c.getInputStream()) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
            return out.toString("UTF-8");
        } finally {
            c.disconnect();
        }
    }

    private Updater() {}
}
