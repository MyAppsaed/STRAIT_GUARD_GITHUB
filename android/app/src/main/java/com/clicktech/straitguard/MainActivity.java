package com.clicktech.straitguard;

import android.os.Build;
import android.os.Bundle;
import android.view.View;

import android.view.WindowManager;

import androidx.activity.EdgeToEdge;
import androidx.activity.SystemBarStyle;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

/**
 * Android 15+ (API 35) enforces edge-to-edge rendering. We opt in explicitly with the
 * current AndroidX Activity API and forward the real system-bar / cutout insets to the
 * WebView as CSS environment variables, so the game canvas can paint full-bleed while
 * every HUD element, button and menu stays inside the safe area.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // NOTE: never call requestWindowFeature(...) on an AppCompat activity — it throws
        // AndroidRuntimeException and crashes at launch. The AppCompat-safe equivalent is
        // supportRequestWindowFeature(), which must run before super.onCreate() inflates
        // the content view. Guarded so a failure can never crash the app.
        try {
            supportRequestWindowFeature(Window.FEATURE_NO_TITLE);
        } catch (Throwable ignored) {
            // Theme already handles it.
        }

        // Must run before super.onCreate() so the window is configured before the view inflates.
        EdgeToEdge.enable(
            this,
            SystemBarStyle.dark(android.graphics.Color.TRANSPARENT),
            SystemBarStyle.dark(android.graphics.Color.TRANSPARENT)
        );

        super.onCreate(savedInstanceState);

        if (getSupportActionBar() != null) {
            getSupportActionBar().hide();
        }

        // Draw into the display cutout / notch area on all orientations (incl. landscape).
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            getWindow().getAttributes().layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }

        final View root = findViewById(android.R.id.content);
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, windowInsets) -> {
            Insets bars = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars()
                    | WindowInsetsCompat.Type.displayCutout()
                    | WindowInsetsCompat.Type.ime()
            );

            // Push the measured insets into the web layer as --sg-inset-* CSS variables.
            final String js =
                "(function(){var d=document.documentElement;if(!d)return;" +
                "d.style.setProperty('--sg-inset-top','" + px(bars.top) + "px');" +
                "d.style.setProperty('--sg-inset-right','" + px(bars.right) + "px');" +
                "d.style.setProperty('--sg-inset-bottom','" + px(bars.bottom) + "px');" +
                "d.style.setProperty('--sg-inset-left','" + px(bars.left) + "px');})();";

            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().post(
                    () -> getBridge().getWebView().evaluateJavascript(js, null)
                );
            }

            // Keep the insets flowing so the WebView itself still renders edge-to-edge.
            return windowInsets;
        });
    }

    /** Convert physical pixels to CSS pixels for the WebView. */
    private int px(int physical) {
        float density = getResources().getDisplayMetrics().density;
        if (density <= 0) return physical;
        return Math.round(physical / density);
    }
}
