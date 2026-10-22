package io.github.tmerello1.habitchecker;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.text.Html;
import android.view.DisplayCutout;
import android.view.RoundedCorner;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Runs the Habit Checker web app (GitHub Pages) in a WebView, so the app itself stays the
 * PWA and gets every web update. A small script mirrors the saved state into Store each time
 * the page saves, which is what the widget and native reminders read.
 */
public class MainActivity extends Activity {
    static final String START_URL = "https://tmerello-1.github.io/Habit-Checker/";
    private static final String HOST = Uri.parse(START_URL).getHost();
    // The friends server, whose /invite/CODE links open the app (see AndroidManifest.xml).
    private static final String INVITE_HOST = "habit-checker-friends.habits-f6268550.workers.dev";

    // Wraps localStorage.setItem so every save of the app state is passed to the bridge, and
    // each save of the friends data too (FeedbackJob needs to know about admin profiles).
    private static final String BRIDGE_JS = "(function () {"
            + "  if (window.__habitBridge) return; window.__habitBridge = true;"
            + "  var KEY = 'habit-checker:v1', FRIENDS = 'habit-checker:friends', FEEDBACK = 'habit-checker:feedback';"
            + "  var push = function () { HabitCheckerBridge.saveState(localStorage.getItem(KEY) || ''); };"
            + "  var pushFriends = function () { HabitCheckerBridge.saveFriends(localStorage.getItem(FRIENDS) || '{}'); };"
            + "  var pushFeedback = function () { HabitCheckerBridge.saveFeedback(localStorage.getItem(FEEDBACK) || '[]'); };"
            + "  var setItem = Storage.prototype.setItem;"
            + "  Storage.prototype.setItem = function (k) {"
            + "    setItem.apply(this, arguments);"
            + "    if (k === KEY) push();"
            + "    if (k === FRIENDS) pushFriends();"
            + "    if (k === FEEDBACK) pushFeedback();"
            + "  };"
            + "  push(); pushFriends(); pushFeedback();"
            + "})();";

    private WebView web;
    // The page that didn't load, opened again by the error page's Retry button.
    private String failedUrl = START_URL;
    // The page's --app-inset-* values for the current screen, see insetsJs().
    private String insetsJs = "";

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        // The page checks for this to hide "Install app" and the PWA reminder notes.
        s.setUserAgentString(s.getUserAgentString() + " HabitCheckerAndroid");

        web.addJavascriptInterface(new Bridge(), "HabitCheckerBridge");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (HOST.equals(request.getUrl().getHost())) return false;
                // Links off the app open in the browser, where the bridge isn't exposed.
                startActivity(new Intent(Intent.ACTION_VIEW, request.getUrl()));
                return true;
            }

            // The site is normally served from the page's offline copy, so this only shows
            // when there's none yet (first start, cleared data) and the site can't be reached.
            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showLoadError(request.getUrl().toString());
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame() && response.getStatusCode() >= 500) showLoadError(request.getUrl().toString());
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (HOST.equals(Uri.parse(url).getHost())) view.evaluateJavascript(BRIDGE_JS + insetsJs, null);
            }
        });

        // WebView has no env(safe-area-inset-*), so the page gets the room to keep clear of
        // camera cutouts and rounded corners from here. It changes with the screen, e.g. on
        // a Flip's cover display, and the page's CSS follows it.
        web.setOnApplyWindowInsetsListener((v, insets) -> {
            insetsJs = insetsJs(insets);
            web.evaluateJavascript(insetsJs, null);
            return v.onApplyWindowInsets(insets);
        });

        if (savedInstanceState == null) web.loadUrl(urlFor(getIntent()));
        else web.restoreState(savedInstanceState);

        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] {Manifest.permission.POST_NOTIFICATIONS}, 1);
        }
        Updater.check(this);
    }

    // An invite opened while the app is running. Only the #invite hash differs from the
    // loaded page, so the page handles it on hashchange without reloading.
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (intent.getData() != null) web.loadUrl(urlFor(intent));
    }

    // Invite links (https://<friends server>/invite/CODE or habitchecker://invite/CODE) and links
    // to the site open the matching page; anything else the start page.
    static String urlFor(Intent intent) {
        Uri data = intent == null ? null : intent.getData();
        if (data == null) return START_URL;
        boolean inviteLink = "https".equals(data.getScheme()) && INVITE_HOST.equals(data.getHost())
                && data.getPath() != null && data.getPath().startsWith("/invite/");
        if (inviteLink || ("habitchecker".equals(data.getScheme()) && "invite".equals(data.getHost()))) {
            String code = data.getLastPathSegment();
            if (code != null && code.matches("[A-Za-z0-9-]{1,32}")) return START_URL + "#invite=" + code;
        }
        if ("https".equals(data.getScheme()) && HOST.equals(data.getHost())) return data.toString();
        return START_URL;
    }

    // Folding, unfolding or moving to the cover screen resizes the WebView in place (see
    // configChanges in the manifest); ask for fresh insets for the new screen.
    @Override
    public void onConfigurationChanged(Configuration config) {
        super.onConfigurationChanged(config);
        web.requestApplyInsets();
    }

    // Sets --app-inset-top/right/bottom/left (in CSS px) to the larger of the cutout's safe
    // inset and how far a rounded screen corner reaches into the WebView on that side.
    private String insetsJs(WindowInsets insets) {
        int[] px = new int[4]; // top, right, bottom, left
        if (Build.VERSION.SDK_INT >= 28) {
            DisplayCutout cutout = insets.getDisplayCutout();
            if (cutout != null) {
                px[0] = cutout.getSafeInsetTop();
                px[1] = cutout.getSafeInsetRight();
                px[2] = cutout.getSafeInsetBottom();
                px[3] = cutout.getSafeInsetLeft();
            }
        }
        if (Build.VERSION.SDK_INT >= 31) {
            int[] at = new int[2];
            web.getLocationInWindow(at);
            int top = at[1], left = at[0], bottom = top + web.getHeight(), right = left + web.getWidth();
            int[] positions = {RoundedCorner.POSITION_TOP_LEFT, RoundedCorner.POSITION_TOP_RIGHT,
                    RoundedCorner.POSITION_BOTTOM_RIGHT, RoundedCorner.POSITION_BOTTOM_LEFT};
            for (int pos : positions) {
                RoundedCorner c = insets.getRoundedCorner(pos);
                if (c == null || c.getRadius() == 0) continue;
                // Keep content inside the point of the curve at 45°.
                int reach = Math.round(c.getRadius() * 0.7071f);
                int x = c.getCenter().x, y = c.getCenter().y;
                boolean isTop = pos == RoundedCorner.POSITION_TOP_LEFT || pos == RoundedCorner.POSITION_TOP_RIGHT;
                boolean isLeft = pos == RoundedCorner.POSITION_TOP_LEFT || pos == RoundedCorner.POSITION_BOTTOM_LEFT;
                if (isTop) px[0] = Math.max(px[0], y - reach - top);
                else px[2] = Math.max(px[2], bottom - (y + reach));
                if (isLeft) px[3] = Math.max(px[3], x - reach - left);
                else px[1] = Math.max(px[1], right - (x + reach));
            }
        }
        float density = getResources().getDisplayMetrics().density;
        String[] sides = {"top", "right", "bottom", "left"};
        StringBuilder js = new StringBuilder(";(function () { var r = document.documentElement.style;");
        for (int i = 0; i < 4; i++) {
            js.append(" r.setProperty('--app-inset-").append(sides[i]).append("', '")
                    .append(Math.max(0, Math.round(px[i] / density))).append("px');");
        }
        return js.append(" })();").toString();
    }

    // A page of our own instead of WebView's "Webpage not available", with a Retry button.
    private void showLoadError(String url) {
        failedUrl = url;
        String html = "<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'>"
                + "<style>:root{color-scheme:light dark}body{font-family:sans-serif;margin:0;min-height:100vh;"
                + "display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px;box-sizing:border-box}"
                + "h1{font-size:1.3em}p{max-width:22em;line-height:1.4;opacity:.8}"
                + "button{font:inherit;font-weight:bold;padding:12px 32px;border:0;border-radius:24px;background:#4f46e5;color:#fff}</style>"
                + "<div style='font-size:48px'>☁️</div>"
                + "<h1>" + Html.escapeHtml(getString(R.string.load_error_title)) + "</h1>"
                + "<p>" + Html.escapeHtml(getString(R.string.load_error_message)) + "</p>"
                + "<button onclick='HabitCheckerBridge.retry()'>" + Html.escapeHtml(getString(R.string.load_error_retry)) + "</button>";
        web.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
    }

    @Override
    protected void onStart() {
        super.onStart();
        FeedbackJob.checkNow(getApplicationContext());
    }

    @Override
    protected void onStop() {
        super.onStop();
        FeedbackJob.checkNow(getApplicationContext());
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    private class Bridge {
        @JavascriptInterface
        public void saveState(String json) {
            // The page also saves every 30s for reminder bookkeeping; skip unchanged state.
            if (json == null || json.isEmpty() || json.equals(Store.state(MainActivity.this))) return;
            Store.saveState(MainActivity.this, json);
            Reminders.update(getApplicationContext());
        }

        @JavascriptInterface
        public void retry() {
            runOnUiThread(() -> {
                web.clearHistory();
                web.loadUrl(failedUrl);
            });
        }

        @JavascriptInterface
        public void saveFriends(String json) {
            FeedbackJob.update(getApplicationContext(), json);
        }

        @JavascriptInterface
        public void saveFeedback(String json) {
            FeedbackJob.updateThreads(getApplicationContext(), json);
        }
    }
}
