package io.github.tmerello1.habitchecker;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
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

    // Wraps localStorage.setItem so every save of the app state is passed to the bridge, and
    // each save of the friends data too (FeedbackJob needs to know about admin profiles).
    private static final String BRIDGE_JS = "(function () {"
            + "  if (window.__habitBridge) return; window.__habitBridge = true;"
            + "  var KEY = 'habit-checker:v1', FRIENDS = 'habit-checker:friends';"
            + "  var push = function () { HabitCheckerBridge.saveState(localStorage.getItem(KEY) || ''); };"
            + "  var pushFriends = function () { HabitCheckerBridge.saveFriends(localStorage.getItem(FRIENDS) || '{}'); };"
            + "  var setItem = Storage.prototype.setItem;"
            + "  Storage.prototype.setItem = function (k) {"
            + "    setItem.apply(this, arguments);"
            + "    if (k === KEY) push();"
            + "    if (k === FRIENDS) pushFriends();"
            + "  };"
            + "  push(); pushFriends();"
            + "})();";

    private WebView web;

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

            @Override
            public void onPageFinished(WebView view, String url) {
                if (HOST.equals(Uri.parse(url).getHost())) view.evaluateJavascript(BRIDGE_JS, null);
            }
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

    // habitchecker://invite/CODE and links to the site open the matching page; anything else the start page.
    static String urlFor(Intent intent) {
        Uri data = intent == null ? null : intent.getData();
        if (data == null) return START_URL;
        if ("habitchecker".equals(data.getScheme()) && "invite".equals(data.getHost())) {
            String code = data.getLastPathSegment();
            if (code != null && code.matches("[A-Za-z0-9-]{1,32}")) return START_URL + "#invite=" + code;
        }
        if ("https".equals(data.getScheme()) && HOST.equals(data.getHost())) return data.toString();
        return START_URL;
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
        public void saveFriends(String json) {
            FeedbackJob.update(getApplicationContext(), json);
        }
    }
}
