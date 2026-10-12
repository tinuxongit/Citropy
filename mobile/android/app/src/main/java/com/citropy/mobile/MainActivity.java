package com.citropy.mobile;

import android.graphics.Color;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {

    private static final String SCHEME_BRIDGE = "CitropyPageScheme";
    private static final String SCHEME_WATCHER =
        "(() => {" +
        "  const root = document.documentElement;" +
        "  const pixel = document.createElement('canvas').getContext('2d', { willReadFrequently: true });" +
        "  const hex = (color) => {" +
        "    pixel.clearRect(0, 0, 1, 1);" +
        "    pixel.fillStyle = color;" +
        "    pixel.fillRect(0, 0, 1, 1);" +
        "    return '#' + [...pixel.getImageData(0, 0, 1, 1).data.slice(0, 3)].map((part) => part.toString(16).padStart(2, '0')).join('');" +
        "  };" +
        "  let last = '';" +
        "  const report = () => {" +
        "    const dark = getComputedStyle(root).colorScheme.trim().startsWith('dark');" +
        "    const background = hex(getComputedStyle(document.body).backgroundColor);" +
        "    if (last === dark + background) return;" +
        "    last = dark + background;" +
        "    " + SCHEME_BRIDGE + ".report(dark, background);" +
        "  };" +
        "  report();" +
        "  new MutationObserver(report).observe(root, { attributes: true });" +
        "})()";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView webView = getBridge().getWebView();
        webView.addJavascriptInterface(new PageScheme(), SCHEME_BRIDGE);
        getBridge().addWebViewListener(new WebViewListener() {
            @Override
            public void onPageLoaded(WebView view) {
                view.evaluateJavascript(SCHEME_WATCHER, null);
            }
        });
    }

    @Override
    public void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }

    private class PageScheme {

        @JavascriptInterface
        public void report(boolean dark, String background) {
            runOnUiThread(() -> {
                WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
                bars.setAppearanceLightStatusBars(!dark);
                bars.setAppearanceLightNavigationBars(!dark);
                getWindow().getDecorView().setBackgroundColor(Color.parseColor(background));
            });
        }
    }
}
