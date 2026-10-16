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

    // Wraps localStorage.setItem so every save of the app state is passed to the bridge.
    private static final String BRIDGE_JS = "(function () {"
            + "  if (window.__habitBridge) return; window.__habitBridge = true;"
            + "  var KEY = 'habit-checker:v1';"
            + "  var push = function () { HabitCheckerBridge.saveState(localStorage.getItem(KEY) || ''); };"
            + "  var setItem = Storage.prototype.setItem;"
            + "  Storage.prototype.setItem = function (k) { setItem.apply(this, arguments); if (k === KEY) push(); };"
            + "  push();"
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

        if (savedInstanceState == null) web.loadUrl(START_URL);
        else web.restoreState(savedInstanceState);

        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] {Manifest.permission.POST_NOTIFICATIONS}, 1);
        }
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
    }
}
