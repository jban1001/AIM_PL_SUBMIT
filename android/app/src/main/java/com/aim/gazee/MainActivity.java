package com.aim.gazee;

import android.Manifest;
import android.app.Activity;
import android.car.Car;
import android.car.drivingstate.CarUxRestrictions;
import android.car.drivingstate.CarUxRestrictionsManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.TextView;

import org.json.JSONObject;

import java.io.IOException;
import java.util.Collections;

public final class MainActivity extends Activity {
    private static final String WEB_HOST = "appassets.androidplatform.net";
    private static final String WEB_ROOT = "/assets/web/";
    private static final String PAGE_URL = "https://" + WEB_HOST + WEB_ROOT + "index.html?host=pleos";
    private static final String LOG_TAG = "GazeePleos";
    private static final int MICROPHONE_PERMISSION = 41;
    private static final int SPEED_PERMISSION = 42;
    private static final String DEMO_ROLE_ACTION = "com.aim.gazee.DEMO_ROLE";

    private enum Screen { NORMAL, LIMITED, DRIVING, LOCKED, UNAVAILABLE }

    private WebView webView;
    private TextView lockScreen;
    private Car car;
    private CarUxRestrictionsManager restrictionsManager;
    private CarUxRestrictions currentRestrictions;
    private boolean emulatorDemo;
    private VehicleMotion motion;
    private Screen screen;
    private int renderGeneration;
    private boolean vehiclePageReady;
    private String lastDemoMotion;
    private boolean speedPermissionRequested;
    private PleosSpeech speech;
    private NotificationChime chime;
    private PleosMic microphone;
    // Defined by the Gleo package as a signature permission and granted to its service.
    private static final String GLEO_ACTION_PERMISSION = "ai.umos.gleo.permission.APP_ACTION";
    private GleoReportAction gleo;
    private final BroadcastReceiver gleoReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (!canInteract || !foreground) return;
            gleo.accept(intent);
            gleo.dispatch(true);
        }
    };
    private final BroadcastReceiver demoRoleReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (!isOrderedBroadcast() || !DEMO_ROLE_ACTION.equals(intent.getAction())) return;
            String role = intent.getStringExtra("role");
            if (!"front".equals(role) && !"rear".equals(role)) return;
            if (!vehiclePageReady || !foreground || webView == null
                    || screen == null || screen == Screen.LOCKED || screen == Screen.UNAVAILABLE) {
                setResultData("app-not-ready");
                return;
            }

            PendingResult reply = goAsync();
            webView.evaluateJavascript("window.selectGazeeDemoRole?.(" + JSONObject.quote(role) + ")", result -> {
                if (JSONObject.quote("ok").equals(result)) {
                    reply.setResultCode(RESULT_OK);
                    reply.setResultData(role);
                } else if (JSONObject.quote("report-required").equals(result)) {
                    reply.setResultData("report-required");
                } else {
                    reply.setResultData("app-not-ready");
                }
                reply.finish();
            });
        }
    };
    private String pendingMicId;
    private boolean canInteract;
    private boolean foreground;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        FrameLayout root = new FrameLayout(this);
        webView = new WebView(this);
        webView.setVisibility(View.INVISIBLE);
        root.addView(webView, new FrameLayout.LayoutParams(-1, -1));
        lockScreen = new TextView(this);
        lockScreen.setGravity(Gravity.CENTER);
        lockScreen.setTextSize(24);
        lockScreen.setTextColor(Color.rgb(55, 45, 66));
        lockScreen.setBackgroundColor(Color.rgb(250, 247, 253));
        lockScreen.setText("차량 주행 제한 상태를 확인하고 있어요.");
        root.addView(lockScreen, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);

        speech = new PleosSpeech(this, this::dispatchSpeechEvent);
        chime = new NotificationChime(this, this::dispatchChimeEvent);
        microphone = new PleosMic(this, this::dispatchMicEvent);
        gleo = new GleoReportAction(this, this::dispatchGleoReport, this::dispatchGleoRead);
        IntentFilter gleoActions = new IntentFilter(GleoReportAction.ACTION);
        gleoActions.addAction(getPackageName() + "." + GleoReportAction.ACTION);
        gleoActions.addAction(GleoReportAction.READ_ACTION);
        gleoActions.addAction(getPackageName() + "." + GleoReportAction.READ_ACTION);
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(gleoReceiver, gleoActions, GLEO_ACTION_PERMISSION, null,
                    Context.RECEIVER_EXPORTED);
        } else {
            registerReceiver(gleoReceiver, gleoActions, GLEO_ACTION_PERMISSION, null);
        }
        emulatorDemo = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0
                && Build.DEVICE.startsWith("crp_avd_");
        if (emulatorDemo) {
            motion = new VehicleMotion(this::publishDemoMotion);
            IntentFilter demoRole = new IntentFilter(DEMO_ROLE_ACTION);
            // The ADB shell can select a demo role without enabling driver input.
            if (Build.VERSION.SDK_INT >= 33) {
                registerReceiver(demoRoleReceiver, demoRole, Manifest.permission.DUMP, null,
                        Context.RECEIVER_EXPORTED);
            } else {
                registerReceiver(demoRoleReceiver, demoRole, Manifest.permission.DUMP, null);
            }
        }
        configureWebView();
        connectToVehicle();
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return true;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String path = uri.getPath();
                if (!"GET".equals(request.getMethod()) || !"https".equals(uri.getScheme())
                        || !WEB_HOST.equals(uri.getHost()) || path == null
                        || !path.startsWith(WEB_ROOT) || path.contains("..")) {
                    return notFound();
                }
                try {
                    String mime = assetMime(path);
                    return new WebResourceResponse(mime, mime.startsWith("text/") ? "UTF-8" : null,
                            getAssets().open(path.substring("/assets/".length())));
                } catch (IOException error) {
                    return notFound();
                }
            }
        });
        webView.addJavascriptInterface(new SpeechInterface(), "GazeeSpeech");
        webView.addJavascriptInterface(new ChimeInterface(), "GazeeChime");
        webView.addJavascriptInterface(new MicrophoneInterface(), "GazeeMic");
        webView.addJavascriptInterface(new GleoInterface(), "GazeeGleo");
        if (emulatorDemo) webView.addJavascriptInterface(new VehicleInterface(), "GazeeVehicle");
        webView.loadUrl(PAGE_URL);
    }

    private static String assetMime(String path) {
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".js")) return "text/javascript";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".woff2")) return "font/woff2";
        if (path.endsWith(".svg")) return "image/svg+xml";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
        if (path.endsWith(".webp")) return "image/webp";
        return "application/octet-stream";
    }

    private static WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
                Collections.emptyMap(), null);
    }

    private void connectToVehicle() {
        try {
            car = Car.createCar(this, new Handler(Looper.getMainLooper()), Car.CAR_WAIT_TIMEOUT_DO_NOT_WAIT,
                    (connected, ready) -> {
                        if (isDestroyed()) return;
                        if (!ready) {
                            restrictionsManager = null;
                            if (motion != null) motion.close();
                            updateRestrictions(null);
                            return;
                        }
                        try {
                            restrictionsManager = (CarUxRestrictionsManager)
                                    connected.getCarManager(Car.CAR_UX_RESTRICTION_SERVICE);
                            if (restrictionsManager != null) {
                                restrictionsManager.registerListener(
                                        value -> runOnUiThread(() -> updateRestrictions(value)));
                            }
                            if (motion != null) {
                                motion.connect(connected, checkSelfPermission(Car.PERMISSION_SPEED)
                                        == PackageManager.PERMISSION_GRANTED);
                            }
                            refreshRestrictions();
                        } catch (RuntimeException error) {
                            Log.w(LOG_TAG, "Vehicle UX service unavailable", error);
                            updateRestrictions(null);
                        }
                    });
        } catch (RuntimeException error) {
            Log.w(LOG_TAG, "Vehicle connection failed", error);
            updateRestrictions(null);
        }
    }

    private void refreshRestrictions() {
        try {
            updateRestrictions(restrictionsManager == null ? null
                    : restrictionsManager.getCurrentCarUxRestrictions());
        } catch (RuntimeException error) {
            Log.w(LOG_TAG, "Vehicle restrictions unavailable", error);
            updateRestrictions(null);
        }
    }

    private void updateRestrictions(CarUxRestrictions state) {
        currentRestrictions = state;
        applyRestrictions();
    }

    private void applyRestrictions() {
        if (isDestroyed() || webView == null) return;
        boolean platformAllowsInteraction = currentRestrictions != null
                && !currentRestrictions.isRequiresDistractionOptimization()
                && currentRestrictions.getActiveRestrictions() == 0;
        Screen next = Screen.UNAVAILABLE;
        if (currentRestrictions != null) {
            int contentLimits = CarUxRestrictions.UX_RESTRICTIONS_LIMIT_CONTENT
                    | CarUxRestrictions.UX_RESTRICTIONS_LIMIT_STRING_LENGTH;
            if (emulatorDemo && (currentRestrictions.getActiveRestrictions() & contentLimits) == 0) {
                next = Screen.NORMAL;
            } else {
                next = platformAllowsInteraction ? Screen.NORMAL : Screen.LOCKED;
            }
        }

        canInteract = next == Screen.NORMAL;
        if (screen != next) {
            screen = next;
            Log.i(LOG_TAG, "Vehicle screen: " + next);
            if (!canInteract) {
                speech.stop();
                chime.stop();
                microphone.interrupt();
            }
            renderScreen();
        }
        gleo.dispatch(canInteract && foreground);
        publishDemoMotion();
        maybeRequestSpeedPermission();
    }

    private void publishDemoMotion() {
        if (!vehiclePageReady || !canInteract || motion == null) return;
        String state = motion.demoState();
        if (state == null || state.equals(lastDemoMotion)) return;
        lastDemoMotion = state;
        Log.i(LOG_TAG, "Virtual Console mode: " + state);
        webView.evaluateJavascript("window.applyGazeeDemoMotion?.(" + JSONObject.quote(state) + ")", null);
    }

    private void renderScreen() {
        final int generation = ++renderGeneration;
        final Screen target = screen;
        boolean normal = target == Screen.NORMAL;
        // Hide the parked UI immediately, before waiting for the WebView to switch views.
        webView.setVisibility(View.INVISIBLE);
        // The emulator's driving page renders only demo tabs and role selection.
        boolean demoTouch = motion != null && target == Screen.DRIVING;
        webView.setOnTouchListener(normal || demoTouch ? null : (view, event) -> true);
        webView.setFocusable(normal);
        webView.setFocusableInTouchMode(normal);
        webView.setImportantForAccessibility(normal
                ? View.IMPORTANT_FOR_ACCESSIBILITY_AUTO : View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        if (!normal && webView.getWindowToken() != null) {
            webView.clearFocus();
            ((android.view.inputmethod.InputMethodManager) getSystemService(INPUT_METHOD_SERVICE))
                    .hideSoftInputFromWindow(webView.getWindowToken(), 0);
        }
        lockScreen.setVisibility(View.VISIBLE);
        lockScreen.setText(target == Screen.UNAVAILABLE
                ? "차량 주행 제한 상태를 확인하고 있어요."
                : "주행 중 이용이 제한돼요.");
        if (!emulatorDemo) {
            showWebView(normal);
            return;
        }
        if (!vehiclePageReady || target == null || target == Screen.UNAVAILABLE || target == Screen.LOCKED) return;
        String mode = JSONObject.quote(target.name());
        webView.evaluateJavascript("window.applyGazeeVehicleScreen?.(" + mode + ") === true", result -> {
            if (webView != null && renderGeneration == generation && "true".equals(result)) {
                webView.postVisualStateCallback(generation, new WebView.VisualStateCallback() {
                    @Override
                    public void onComplete(long requestId) {
                        if (webView != null && renderGeneration == requestId) showWebView(true);
                    }
                });
            }
        });
    }

    private void showWebView(boolean show) {
        webView.setVisibility(show ? View.VISIBLE : View.INVISIBLE);
        lockScreen.setVisibility(show ? View.GONE : View.VISIBLE);
    }

    private void maybeRequestSpeedPermission() {
        if (motion == null || !foreground || !canInteract || !vehiclePageReady || speedPermissionRequested
                || checkSelfPermission(Car.PERMISSION_SPEED) == PackageManager.PERMISSION_GRANTED) return;
        speedPermissionRequested = true;
        requestPermissions(new String[]{Car.PERMISSION_SPEED}, SPEED_PERMISSION);
    }

    private final class VehicleInterface {
        @JavascriptInterface
        public void ready() {
            runOnUiThread(() -> {
                if (webView == null) return;
                vehiclePageReady = true;
                lastDemoMotion = null;
                renderScreen();
                publishDemoMotion();
                maybeRequestSpeedPermission();
            });
        }
    }

    private void dispatchGleoReport(String id, String report) {
        String detail = "{id:" + JSONObject.quote(id) + ",report:" + report + "}";
        webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('gazee-gleo-report',{detail:"
                + detail + "}))", null);
    }

    private void dispatchGleoRead(String id) {
        String detail = "{id:" + JSONObject.quote(id) + "}";
        webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('gazee-gleo-read',{detail:"
                + detail + "}))", null);
    }

    private final class GleoInterface {
        @JavascriptInterface
        public void ready() {
            runOnUiThread(() -> {
                if (webView == null) return;
                gleo.webReady();
                gleo.dispatch(canInteract && foreground);
            });
        }

        @JavascriptInterface
        public void complete(String id, boolean success, String announcement) {
            runOnUiThread(() -> gleo.finish(id, success, announcement));
        }

        @JavascriptInterface
        public void requestDetails(String id, String missing) {
            runOnUiThread(() -> gleo.requestDetails(id, missing));
        }

        @JavascriptInterface
        public void completeRead(String id, String announcement) {
            runOnUiThread(() -> gleo.finishRead(id, announcement));
        }
    }

    private void dispatchSpeechEvent(String id, String phase, String message) {
        if (webView == null) return;
        Log.i(LOG_TAG, "Pleos TTS " + phase + (message.isEmpty() ? "" : ": " + message));
        String event = "{id:" + JSONObject.quote(id) + ",phase:" + JSONObject.quote(phase)
                + ",message:" + JSONObject.quote(message) + "}";
        webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('gazee-speech',{detail:"
                + event + "}))", null);
    }

    private void dispatchMicEvent(String id, String phase, String value) {
        if (webView == null) return;
        if (!"partial".equals(phase)) {
            Log.i(LOG_TAG, "STT " + phase + ("result".equals(phase) ? "" : ": " + value));
        }
        String event = "{id:" + JSONObject.quote(id) + ",phase:" + JSONObject.quote(phase)
                + ",value:" + JSONObject.quote(value) + "}";
        webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('gazee-mic',{detail:"
                + event + "}))", null);
    }

    private void startMicrophone(String id) {
        if (webView == null) return;
        if (!foreground || !canInteract) {
            dispatchMicEvent(id, "error", "차량 주행 제한이 풀리면 음성 제보를 사용할 수 있어요.");
            return;
        }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            pendingMicId = id;
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, MICROPHONE_PERMISSION);
            return;
        }
        speech.stop();
        chime.stop();
        microphone.listen(id);
    }

    private void resumePendingMic() {
        if (pendingMicId == null || !foreground
                || checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) return;
        String id = pendingMicId;
        pendingMicId = null;
        startMicrophone(id);
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        if (code == SPEED_PERMISSION) {
            if (motion != null && results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) {
                motion.subscribeSpeed();
            }
            return;
        }
        if (code != MICROPHONE_PERMISSION || pendingMicId == null) return;
        if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) {
            resumePendingMic();
        } else {
            String id = pendingMicId;
            pendingMicId = null;
            dispatchMicEvent(id, "error", "마이크 권한을 허용한 뒤 다시 켜 주세요.");
        }
    }

    private final class MicrophoneInterface {
        @JavascriptInterface
        public void listen(String id) {
            runOnUiThread(() -> startMicrophone(id));
        }

        @JavascriptInterface
        public void cancel(String id) {
            runOnUiThread(() -> {
                if (id.equals(pendingMicId)) pendingMicId = null;
                microphone.cancel(id);
            });
        }
    }

    private void dispatchChimeEvent(String id, String phase, String message) {
        if (webView == null) return;
        Log.i(LOG_TAG, "Notification chime " + phase + ": " + message);
        String event = "{id:" + JSONObject.quote(id) + ",phase:" + JSONObject.quote(phase)
                + ",message:" + JSONObject.quote(message) + "}";
        webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('gazee-chime',{detail:"
                + event + "}))", null);
    }

    private final class ChimeInterface {
        @JavascriptInterface
        public void play(String id) {
            runOnUiThread(() -> {
                if (webView == null || id == null || id.length() > 80) return;
                if (!foreground || !canInteract) {
                    dispatchChimeEvent(id, "error", "차량 주행 제한이 풀리면 수신 오디오를 사용할 수 있어요.");
                } else chime.play(id);
            });
        }

        @JavascriptInterface
        public void cancel(String id) { runOnUiThread(() -> chime.cancel(id)); }
    }

    private final class SpeechInterface {
        @JavascriptInterface
        public void speakSdk(String id, String text) {
            runOnUiThread(() -> {
                if (webView == null || id == null || id.length() > 80) return;
                if (!foreground || !canInteract) {
                    dispatchSpeechEvent(id, "error", "차량 주행 제한 상태에서는 안내할 수 없어요.");
                } else if (text == null || text.trim().isEmpty() || text.length() > 500) {
                    dispatchSpeechEvent(id, "error", "안내할 문장을 읽을 수 없어요.");
                } else {
                    microphone.interrupt();
                    chime.stop();
                    speech.speakSdk(id, text);
                }
            });
        }

        @JavascriptInterface
        public void speak(String id, String text) {
            runOnUiThread(() -> {
                if (webView == null) return;
                if (!foreground || !canInteract) {
                    dispatchSpeechEvent(id, "error", "차량 주행 제한 상태에서는 안내할 수 없어요.");
                } else if (text == null || text.trim().isEmpty() || text.length() > 500) {
                    dispatchSpeechEvent(id, "error", "안내할 문장을 읽을 수 없어요.");
                } else {
                    Log.i(LOG_TAG, "GazeeSpeech.speak bridge id=" + id + " length=" + text.length());
                    speech.speak(id, text);
                }
            });
        }

        @JavascriptInterface
        public void cancel(String id) {
            runOnUiThread(() -> speech.cancel(id));
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        foreground = true;
        refreshRestrictions();
        resumePendingMic();
    }

    @Override
    protected void onPause() {
        foreground = false;
        microphone.interrupt();
        speech.stop();
        chime.stop();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (restrictionsManager != null) {
            try {
                restrictionsManager.unregisterListener();
            } catch (RuntimeException error) {
                Log.w(LOG_TAG, "Could not remove vehicle listener", error);
            }
        }
        if (emulatorDemo) unregisterReceiver(demoRoleReceiver);
        if (motion != null) motion.close();
        if (car != null) car.disconnect();
        speech.stop();
        chime.stop();
        microphone.close();
        pendingMicId = null;
        unregisterReceiver(gleoReceiver);
        gleo.close();
        webView.removeJavascriptInterface("GazeeVehicle");
        webView.removeJavascriptInterface("GazeeGleo");
        webView.removeJavascriptInterface("GazeeMic");
        webView.removeJavascriptInterface("GazeeSpeech");
        webView.removeJavascriptInterface("GazeeChime");
        ((FrameLayout) webView.getParent()).removeView(webView);
        webView.destroy();
        webView = null;
        super.onDestroy();
    }
}
