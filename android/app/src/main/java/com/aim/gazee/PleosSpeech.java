package com.aim.gazee;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.UtteranceProgressListener;
import android.util.Log;

import java.util.Locale;

import ai.pleos.playground.tts.TextToSpeech;
import ai.pleos.playground.tts.constant.ErrorType;
import ai.pleos.playground.tts.constant.Mode;
import ai.pleos.playground.tts.listener.EventListener;
import ai.pleos.playground.tts.listener.OnInitializeListener;

/** Pleos ON_DEVICE output with an installed Android TTS engine as fallback. */
final class PleosSpeech {
    interface EventSink {
        void send(String id, String phase, String message);
    }

    private static final String TAG = "GazeePleos";
    private final Context context;
    private final EventSink events;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final AudioManager audio;
    private final AudioAttributes attributes = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build();
    private Request active;

    PleosSpeech(Context context, EventSink events) {
        this.context = context.getApplicationContext();
        this.events = events;
        audio = context.getSystemService(AudioManager.class);
    }

    void speak(String id, String text) {
        stop();
        Request request = new Request(id, text);
        active = request;
        progress(request, "Pleos ON_DEVICE 초기화 중");
        armWatchdog(request, 8_000);
        try {
            request.pleos = new TextToSpeech(context, Mode.ON_DEVICE);
            request.pleos.initialize(new OnInitializeListener() {
                @Override public void onSuccess() {
                    main.post(() -> startPleos(request));
                }

                @Override public void onFailure(ErrorType error) {
                    main.post(() -> fallbackToAndroid(request, "Pleos 초기화 실패 · " + error));
                }
            });
        } catch (RuntimeException | LinkageError error) {
            Log.w(TAG, "Pleos initialization threw", error);
            fallbackToAndroid(request, "Pleos 초기화 예외 · " + error.getClass().getSimpleName());
        }
    }

    private void startPleos(Request request) {
        if (active != request || request.androidFallback) return;
        try {
            request.pleos.addEventListener(request);
            request.pleosListening = true;
            request.pleos.setAudioAttributes(attributes);
            request.pleos.setLocale(Locale.KOREA);
            if (!ensureAudioFocus(request)) return;
            armWatchdog(request, 10_000);
            progress(request, "Pleos ON_DEVICE 초기화 완료 · 한국어 재생 준비 중");
            request.pleos.speak(request.text, true);
        } catch (RuntimeException | LinkageError error) {
            Log.w(TAG, "Pleos speak threw", error);
            fallbackToAndroid(request, "Pleos 재생 예외 · " + error.getClass().getSimpleName());
        }
    }

    private boolean ensureAudioFocus(Request request) {
        if (request.focus != null) return true;
        if (audio == null) {
            finish(request, "error", "차량 오디오 서비스를 찾을 수 없어요.");
            return false;
        }
        try {
            request.focus = new AudioFocusRequest.Builder(
                    AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                    .setAudioAttributes(attributes)
                    .setOnAudioFocusChangeListener(change -> {
                        if (change == AudioManager.AUDIOFOCUS_LOSS
                                || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
                            finish(request, "error", "다른 오디오에 의해 음성 안내가 중단됐어요.");
                        }
                    }, main)
                    .build();
            int result = audio.requestAudioFocus(request.focus);
            Log.i(TAG, "TTS " + request.id + " audio focus=" + result);
            if (result != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
                finish(request, "error", "차량 오디오 포커스 요청이 거절됐어요 (" + result + ").");
                return false;
            }
            return true;
        } catch (RuntimeException error) {
            Log.w(TAG, "Audio focus failed", error);
            finish(request, "error", "오디오 포커스를 요청하지 못했어요.");
            return false;
        }
    }

    private void fallbackToAndroid(Request request, String reason) {
        if (active != request || request.androidFallback) return;
        request.androidFallback = true;
        request.started = false;
        request.pleosFailure = reason;
        events.send(request.id, "fallback", reason);
        releasePleos(request, true);
        progress(request, reason + " → Android 기본 TTS 초기화 중");
        armWatchdog(request, 8_000);
        try {
            request.systemTts = new android.speech.tts.TextToSpeech(context, status ->
                    main.post(() -> startAndroid(request, status)));
        } catch (RuntimeException | LinkageError error) {
            Log.w(TAG, "Android TTS initialization failed", error);
            finish(request, "error", "Android TTS 초기화 예외 · " + error.getClass().getSimpleName());
        }
    }

    private void startAndroid(Request request, int status) {
        if (active != request) return;
        if (status != android.speech.tts.TextToSpeech.SUCCESS || request.systemTts == null) {
            finish(request, "error", "Android TTS 초기화 실패 (" + status
                    + ") · 설치된 한국어 TTS 엔진을 확인해 주세요.");
            return;
        }
        try {
            request.engine = "Android TTS · " + request.systemTts.getDefaultEngine();
            request.systemTts.setAudioAttributes(attributes);
            int language = request.systemTts.setLanguage(Locale.KOREA);
            Log.i(TAG, "TTS " + request.id + " engine=" + request.engine + " language=" + language);
            if (language < android.speech.tts.TextToSpeech.LANG_AVAILABLE) {
                finish(request, "error", request.engine + " · 한국어 음성 데이터가 없어요 (" + language + ").");
                return;
            }
            if (!ensureAudioFocus(request)) return;
            request.systemTts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String utteranceId) {
                    main.post(() -> started(request, request.engine));
                }

                @Override public void onDone(String utteranceId) {
                    main.post(() -> completed(request));
                }

                @Override public void onError(String utteranceId) {
                    main.post(() -> finish(request, "error", request.engine + " · 음성 합성 실패"));
                }

                @Override public void onError(String utteranceId, int errorCode) {
                    main.post(() -> finish(request, "error", request.engine + " · 오류 " + errorCode));
                }
            });
            armWatchdog(request, 10_000);
            progress(request, request.pleosFailure + " → " + request.engine + " 재생 준비 중");
            int result = request.systemTts.speak(request.text,
                    android.speech.tts.TextToSpeech.QUEUE_FLUSH, null, "gazee-" + request.id);
            if (result == android.speech.tts.TextToSpeech.ERROR) {
                finish(request, "error", request.engine + " · 재생 요청이 거절됐어요.");
            }
        } catch (RuntimeException | LinkageError error) {
            Log.w(TAG, "Android TTS speak failed", error);
            finish(request, "error", "Android TTS 재생 예외 · " + error.getClass().getSimpleName());
        }
    }

    private void progress(Request request, String message) {
        if (active != request) return;
        Log.i(TAG, "TTS " + request.id + " preparing · " + message);
        events.send(request.id, "preparing", message);
    }

    private void started(Request request, String engine) {
        if (active != request || request.started) return;
        request.started = true;
        request.engine = engine;
        armWatchdog(request, 30_000);
        Log.i(TAG, "TTS " + request.id + " started · " + engine);
        events.send(request.id, "started", engine);
    }

    private void completed(Request request) {
        if (active != request) return;
        if (!request.started) {
            finish(request, "error", "재생 시작 이벤트 없이 완료되어 음성 출력을 확인하지 못했어요.");
            return;
        }
        finish(request, "done", request.engine);
    }

    private void armWatchdog(Request request, long delayMs) {
        main.removeCallbacks(request.watchdog);
        main.postDelayed(request.watchdog, delayMs);
    }

    void cancel(String id) {
        if (active != null && active.id.equals(id)) stop();
    }

    void stop() {
        if (active != null) finish(active, "error", "음성 안내를 중지했어요.");
    }

    private void releasePleos(Request request, boolean stop) {
        if (request.pleos == null) return;
        try {
            if (request.pleosListening) request.pleos.removeEventListener(request);
            if (stop && request.pleosListening) request.pleos.stop();
        } catch (RuntimeException error) {
            Log.w(TAG, "Could not stop Pleos TTS", error);
        } finally {
            try { request.pleos.release(); }
            catch (RuntimeException error) { Log.w(TAG, "Could not release Pleos TTS", error); }
            request.pleos = null;
            request.pleosListening = false;
        }
    }

    private void finish(Request request, String phase, String message) {
        if (active != request) return;
        active = null;
        main.removeCallbacks(request.watchdog);
        releasePleos(request, !"done".equals(phase));
        if (request.systemTts != null) {
            try {
                if (!"done".equals(phase)) request.systemTts.stop();
                request.systemTts.shutdown();
            } catch (RuntimeException error) {
                Log.w(TAG, "Could not close Android TTS", error);
            }
            request.systemTts = null;
        }
        if (request.focus != null && audio != null) {
            try { audio.abandonAudioFocusRequest(request.focus); }
            catch (RuntimeException error) { Log.w(TAG, "Could not abandon audio focus", error); }
            request.focus = null;
        }
        if ("error".equals(phase) && !request.pleosFailure.isEmpty()) {
            message = request.pleosFailure + " / " + message;
        }
        Log.i(TAG, "TTS " + request.id + " " + phase + " · " + message);
        events.send(request.id, phase, message);
    }

    private final class Request implements EventListener {
        private final String id;
        private final String text;
        private TextToSpeech pleos;
        private android.speech.tts.TextToSpeech systemTts;
        private AudioFocusRequest focus;
        private boolean pleosListening;
        private boolean androidFallback;
        private boolean started;
        private String engine = "Pleos ON_DEVICE";
        private String pleosFailure = "";
        private final Runnable watchdog = () -> {
            if (active != this) return;
            if (!this.androidFallback && !this.started) {
                fallbackToAndroid(this, "Pleos 응답 시간 초과");
            } else {
                finish(this, "error", this.engine + " · 음성 엔진 응답 시간이 초과됐어요.");
            }
        };

        Request(String id, String text) {
            this.id = id;
            this.text = text;
        }

        @Override public void onStart() {
            main.post(() -> {
                if (!androidFallback && pleos != null) started(this, "Pleos ON_DEVICE");
            });
        }
        @Override public void onReady() {
            main.post(() -> {
                if (!androidFallback) progress(this, "Pleos ON_DEVICE 합성 준비 완료");
            });
        }
        @Override public void onDone() {
            main.post(() -> { if (!androidFallback) completed(this); });
        }
        @Override public void onStop() {
            main.post(() -> fallbackToAndroid(this, "Pleos 음성이 중단됨"));
        }
        @Override public void onUpdatedRms(double rms) {}
        @Override public void onError(ErrorType error) {
            main.post(() -> fallbackToAndroid(this, "Pleos 합성 오류 · " + error));
        }
    }
}
