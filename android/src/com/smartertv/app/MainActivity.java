package com.smartertv.app;

import android.app.Activity;
import android.content.pm.ActivityInfo;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.app.PictureInPictureParams;
import android.content.Intent;
import android.content.res.Configuration;
import android.net.Uri;
import android.util.Rational;
import android.webkit.JavascriptInterface;

public class MainActivity extends Activity {

    private WebView webView;
    private FrameLayout customViewContainer;
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private boolean isPlayerPlaying = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Keep screen active for continuous TV streaming
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        setContentView(R.layout.activity_main);

        webView = (WebView) findViewById(R.id.webView);
        customViewContainer = (FrameLayout) findViewById(R.id.customViewContainer);

        setupWebView();
        hideSystemUI();

        // Load standalone packaged app from assets (Zero server requirement!)
        webView.loadUrl("file:///android_asset/index.html");
    }

    private void setupWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);

        // Enable cross-origin requests from file:/// to Xtream Codes IPTV servers
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN) {
            settings.setAllowFileAccessFromFileURLs(true);
            settings.setAllowUniversalAccessFromFileURLs(true);
        }

        // Allow mixed content (HTTP video streams on HTTPS or file schema)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        // Performance & viewport
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        // Cookies
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            cookieManager.setAcceptThirdPartyCookies(webView, true);
        }

        // Custom User Agent (identify as SmarterTV / VLC player for IPTV provider compatibility)
        String defaultUa = settings.getUserAgentString();
        settings.setUserAgentString(defaultUa + " SmarterTV/1.0.0 (VLC/3.0.18)");

        // JavaScript Interface for Native Picture-in-Picture & External Browser Links
        webView.addJavascriptInterface(new WebAppInterface(), "AndroidBridge");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (customView != null) {
                    onHideCustomView();
                    return;
                }

                customView = view;
                customViewCallback = callback;

                webView.setVisibility(View.GONE);
                customViewContainer.setVisibility(View.VISIBLE);
                customViewContainer.addView(view, new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT));

                hideSystemUI();
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
            }

            @Override
            public void onHideCustomView() {
                if (customView == null) {
                    return;
                }

                customViewContainer.removeView(customView);
                customView = null;
                customViewContainer.setVisibility(View.GONE);
                webView.setVisibility(View.VISIBLE);

                if (customViewCallback != null) {
                    customViewCallback.onCustomViewHidden();
                    customViewCallback = null;
                }

                hideSystemUI();
            }
        });
    }

    private void hideSystemUI() {
        View decorView = getWindow().getDecorView();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            decorView.setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        }
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        // Forward TV remote controls (D-Pad, Play, Pause, Back)
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (customView != null) {
                if (webView.getWebChromeClient() != null) {
                    // Hide fullscreen if active
                    webView.loadUrl("javascript:if(window.exitFullscreenPlayer)window.exitFullscreenPlayer();");
                    return true;
                }
            }
            webView.loadUrl("javascript:if(window.handleTvBack)window.handleTvBack();");
            return true;
        }

        return super.onKeyDown(keyCode, event);
    }

    @Override
    public void onBackPressed() {
        if (customView != null) {
            if (customViewCallback != null) {
                customViewCallback.onCustomViewHidden();
            }
            customViewContainer.removeView(customView);
            customView = null;
            customViewContainer.setVisibility(View.GONE);
            webView.setVisibility(View.VISIBLE);
            return;
        }

        webView.loadUrl("javascript:if(window.handleTvBack)window.handleTvBack();");
    }

    @Override
    protected void onResume() {
        super.onResume();
        hideSystemUI();
        if (webView != null) {
            webView.onResume();
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) {
            webView.onPause();
        }
    }

    @Override
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        // If user presses Home or switches apps while watching video, activate Picture-in-Picture
        if (isPlayerPlaying) {
            triggerPip();
        }
    }

    public void triggerPip() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                PictureInPictureParams.Builder builder = new PictureInPictureParams.Builder();
                Rational aspectRatio = new Rational(16, 9);
                builder.setAspectRatio(aspectRatio);
                enterPictureInPictureMode(builder.build());
            } catch (Exception e) {
                e.printStackTrace();
            }
        }
    }

    @Override
    public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode, Configuration newConfig) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig);
        if (webView != null) {
            webView.evaluateJavascript("if(window.onPipModeChanged) window.onPipModeChanged(" + isInPictureInPictureMode + ");", null);
        }
        if (!isInPictureInPictureMode) {
            hideSystemUI();
        }
    }

    public class WebAppInterface {
        @JavascriptInterface
        public void setPlayerActive(final boolean active) {
            isPlayerPlaying = active;
        }

        @JavascriptInterface
        public void enterPictureInPicture() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    triggerPip();
                }
            });
        }

        @JavascriptInterface
        public void openExternalUrl(final String url) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                        startActivity(intent);
                    } catch (Exception e) {
                        e.printStackTrace();
                    }
                }
            });
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }
}
