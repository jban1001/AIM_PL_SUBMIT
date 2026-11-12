package com.aim.gazee;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import java.util.Locale;

import ai.pleos.playground.stt.SpeechToText;
import ai.pleos.playground.stt.constant.ErrorType;
import ai.pleos.playground.stt.constant.Mode;
import ai.pleos.playground.stt.listener.OnInitializeListener;
import ai.pleos.playground.stt.listener.ResultListener;

/** One Pleos recognition session per explicit request. All state belongs to the main thread. */
final class PleosMic {
    interface EventSink {
        void send(String id, String phase, String value);
    }

    private static final String TAG = "GazeePleos";
    private final Context context;
    private final EventSink events;
    private final Handler main = new Handler(Looper.getMainLooper());
    private Request active;
    private boolean closed;

    PleosMic(Context context, EventSink events) {
        this.context = context.getApplicationContext();
        this.events = events;
    }

    void listen(String id) {
        if (closed) return;
        interrupt();
        Request request = new Request(id);
        active = request;
        events.send(id, "preparing", "Pleos 음성 인식을 준비하고 있어요.");
        armTimeout(request, 8_000);
        try {
            // ON_DEVICE uses the vehicle speech service; no Whisper or server credentials.
            request.sdk = new SpeechToText(context, Mode.ON_DEVICE);
            request.sdk.initialize(new OnInitializeListener() {
                @Override public void onSuccess() { main.post(() -> start(request)); }
                @Override public void onFailure(ErrorType error) {
                    main.post(() -> fail(request, "초기화 실패", error));
                }
            });
        } catch (RuntimeException | LinkageError error) {
            exception(request, "초기화", error);
        }
    }

    private void start(Request request) {
        if (active != request || request.requested) return;
        try {
            request.sdk.addListener(request);
            request.listening = true;
            request.sdk.setLocale(Locale.KOREA);
            request.requested = true;
            armTimeout(request, 8_000); // Wait for microphone readiness separately.
            Log.i(TAG, "Pleos STT request · ON_DEVICE · ko-KR");
            request.sdk.request();
        } catch (RuntimeException | LinkageError error) {
            exception(request, "인식 요청", error);
        }
    }

    private void ready(Request request) {
        if (active != request || !request.requested || request.ready) return;
        request.ready = true;
        armTimeout(request, 60_000); // Actual listening time starts after readiness.
        events.send(request.id, "ready", "pleos-on-device");
    }

    private void updated(Request request, String text, boolean completed) {
        if (active != request) return;
        String value = text == null ? "" : text.trim();
        if (completed) {
            if (value.isEmpty()) finish(request, "idle", "들은 말이 없어요. 다시 말해 주세요.");
            else finish(request, "result", value);
        } else {
            events.send(request.id, "partial", value);
        }
    }

    private void fail(Request request, String stage, ErrorType error) {
        // Keep the SDK code visible so platform/engine failures can be diagnosed.
        finish(request, request.ready && error == ErrorType.TIMEOUT ? "idle" : "error", "Pleos STT " + stage + " · " + error);
    }

    private void exception(Request request, String stage, Throwable error) {
        Log.w(TAG, "Pleos STT " + stage + " failed", error);
        finish(request, "error", "Pleos STT " + stage + " 오류 · " + error.getClass().getSimpleName());
    }

    private void armTimeout(Request request, long delayMs) {
        main.removeCallbacks(request.timeout);
        main.postDelayed(request.timeout, delayMs);
    }

    void cancel(String id) {
        if (active != null && active.id.equals(id)) finish(active, null, "");
    }

    void interrupt() {
        if (active != null) finish(active, "error", "마이크 듣기가 중지됐어요.");
    }

    void close() {
        if (closed) return;
        closed = true;
        interrupt();
    }

    private void finish(Request request, String phase, String value) {
        if (active != request) return;
        active = null; // Ignore callbacks caused by stop/release and late callbacks from old sessions.
        main.removeCallbacks(request.timeout);
        main.removeCallbacks(request.noResult);
        if (request.sdk != null) {
            try {
                if (request.listening) request.sdk.removeListener(request);
            } catch (RuntimeException | LinkageError error) {
                Log.w(TAG, "Could not remove Pleos STT listener", error);
            }
            try {
                if (request.requested) request.sdk.stop();
            } catch (RuntimeException | LinkageError error) {
                Log.w(TAG, "Could not stop Pleos STT", error);
            }
            try { request.sdk.release(); }
            catch (RuntimeException | LinkageError error) {
                Log.w(TAG, "Could not release Pleos STT", error);
            }
            request.sdk = null;
        }
        if (phase != null) events.send(request.id, phase, value);
    }

    private final class Request implements ResultListener {
        final String id;
        SpeechToText sdk;
        boolean listening;
        boolean requested;
        boolean ready;
        final Runnable timeout = () -> finish(this, ready ? "idle" : "error", "Pleos 음성 인식 시간이 끝났어요. 다시 켜 주세요.");
        final Runnable noResult = () -> finish(this, "idle", "들은 말이 없어요. 다시 말해 주세요.");

        Request(String id) { this.id = id; }

        @Override public void onReady() { main.post(() -> ready(this)); }
        @Override public void onStartedRecognition() { main.post(() -> ready(this)); }
        @Override public void onUpdated(String text, boolean completed) {
            main.post(() -> updated(this, text, completed));
        }
        @Override public void onError(ErrorType error) {
            main.post(() -> fail(this, "인식 실패", error));
        }
        @Override public void onEndedRecognition() {
            main.post(() -> {
                if (active != this) return;
                // Some services end microphone capture before delivering the final transcript.
                main.removeCallbacks(noResult);
                main.postDelayed(noResult, 1_500);
            });
        }
        @Override public void onUpdatedEpdData(long on, long off) { }
        @Override public void onUpdatedRms(double rms) { }
    }
}
