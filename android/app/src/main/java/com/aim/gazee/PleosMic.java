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

final class PleosMic {
    interface EventSink {
        void send(String id, String phase, String value);
    }

    private final Context context;
    private final EventSink events;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final OfflineKoreanMic offline;
    private Request active;
    private boolean useOffline;

    PleosMic(Context context, EventSink events) {
        this.context = context;
        this.events = events;
        this.offline = new OfflineKoreanMic(context, events);
    }

    void listen(String id) {
        interrupt();
        if (useOffline) {
            offline.listen(id);
            return;
        }
        Request request = new Request(id);
        active = request;
        main.postDelayed(request.timeout, 25_000);
        try {
            request.engine = new SpeechToText(context, Mode.ON_DEVICE);
            request.engine.initialize(new OnInitializeListener() {
                @Override public void onSuccess() {
                    main.post(() -> start(request));
                }

                @Override public void onFailure(ErrorType error) {
                    main.post(() -> handleSdkError(request, error));
                }
            });
        } catch (RuntimeException | LinkageError error) {
            Log.w("GazeePleos", "Pleos STT initialization failed", error);
            finish(request, "error", "Pleos 음성 인식 서비스를 열지 못했어요.");
        }
    }

    private void start(Request request) {
        if (active != request) return;
        try {
            request.engine.addListener(request);
            request.listening = true;
            request.engine.setLocale(Locale.KOREA);
            request.engine.request();
        } catch (RuntimeException | LinkageError error) {
            Log.w("GazeePleos", "Pleos STT request failed", error);
            finish(request, "error", "마이크를 시작하지 못했어요.");
        }
    }

    void cancel(String id) {
        if (active != null && active.id.equals(id)) finish(active, null, "");
        offline.cancel(id);
    }

    void interrupt() {
        if (active != null) finish(active, "error", "마이크 듣기가 중지됐어요.");
        offline.interrupt();
    }

    void close() {
        interrupt();
        offline.close();
    }

    private void handleSdkError(Request request, ErrorType error) {
        if (active != request) return;
        if (error == ErrorType.ON_DEVICE_ENGINE_ERROR || error == ErrorType.NOT_SUPPORTED_API) {
            Log.w("GazeePleos", "Using offline Korean STT after Pleos error: " + error);
            finish(request, null, "");
            useOffline = true;
            events.send(request.id, "preparing", "오프라인 한국어 인식 준비 중…");
            offline.listen(request.id);
        } else {
            finish(request, "error", "Pleos 음성 인식 실패 · " + error);
        }
    }

    private void finish(Request request, String phase, String value) {
        if (active != request) return;
        active = null;
        main.removeCallbacks(request.timeout);
        main.removeCallbacks(request.endedWithoutResult);
        if (request.engine != null) {
            try {
                if (request.listening) {
                    request.engine.removeListener(request);
                    request.engine.stop();
                }
            } catch (RuntimeException error) {
                Log.w("GazeePleos", "Could not stop Pleos STT", error);
            } finally {
                try {
                    request.engine.release();
                } catch (RuntimeException error) {
                    Log.w("GazeePleos", "Could not release Pleos STT", error);
                }
            }
        }
        if (phase != null) events.send(request.id, phase, value);
    }

    private final class Request implements ResultListener {
        private final String id;
        private final Runnable timeout = () ->
                finish(this, "error", "들은 말이 없어요. 마이크를 켜고 다시 말해 주세요.");
        private final Runnable endedWithoutResult = () ->
                finish(this, "error", "음성을 인식하지 못했어요. 다시 말해 주세요.");
        private SpeechToText engine;
        private boolean listening;

        Request(String id) {
            this.id = id;
        }

        @Override public void onReady() {
            main.post(() -> {
                if (active == this) events.send(id, "ready", "");
            });
        }

        @Override public void onStartedRecognition() {
            onReady();
        }

        @Override public void onUpdated(String text, boolean completed) {
            String transcript = text == null ? "" : text;
            main.post(() -> {
                if (active != this) return;
                if (completed) finish(this, "result", transcript);
                else events.send(id, "partial", transcript);
            });
        }

        @Override public void onEndedRecognition() {
            main.post(() -> {
                if (active == this) main.postDelayed(endedWithoutResult, 1200);
            });
        }

        @Override public void onError(ErrorType error) {
            main.post(() -> handleSdkError(this, error));
        }

        @Override public void onUpdatedEpdData(long on, long off) {}
        @Override public void onUpdatedRms(double rms) {}
    }
}
