package com.aim.gazee;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import java.util.Locale;

import ai.pleos.playground.tts.TextToSpeech;
import ai.pleos.playground.tts.constant.ErrorType;
import ai.pleos.playground.tts.constant.Mode;
import ai.pleos.playground.tts.listener.EventListener;
import ai.pleos.playground.tts.listener.OnInitializeListener;

final class PleosSpeech {
    interface EventSink {
        void send(String id, String phase, String message);
    }

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
        this.context = context;
        this.events = events;
        this.audio = context.getSystemService(AudioManager.class);
    }

    void speak(String id, String text) {
        stop();
        Request request = new Request(id);
        active = request;
        try {
            request.engine = new TextToSpeech(context, Mode.ON_DEVICE);
            request.engine.initialize(new OnInitializeListener() {
                @Override public void onSuccess() {
                    main.post(() -> start(request, text));
                }

                @Override public void onFailure(ErrorType error) {
                    main.post(() -> finish(request, "error", "Pleos 음성 초기화 실패 · " + error));
                }
            });
        } catch (RuntimeException | LinkageError error) {
            Log.w("GazeePleos", "Pleos TTS initialization failed", error);
            finish(request, "error", "Pleos 음성 서비스를 열지 못했어요.");
        }
    }

    private void start(Request request, String text) {
        if (active != request) return;
        try {
            request.engine.addEventListener(request);
            request.listening = true;
            request.engine.setAudioAttributes(attributes);
            request.engine.setLocale(Locale.KOREA);
            request.focus = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                    .setAudioAttributes(attributes)
                    .setOnAudioFocusChangeListener(change -> {
                        if (change < 0) finish(request, "error", "다른 음성이 재생되어 안내를 중지했어요.");
                    }, main)
                    .build();
            if (audio.requestAudioFocus(request.focus) != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
                finish(request, "error", "차량 오디오를 사용할 수 없어요.");
                return;
            }
            request.engine.speak(text, true);
        } catch (RuntimeException | LinkageError error) {
            Log.w("GazeePleos", "Pleos TTS playback failed", error);
            finish(request, "error", "Pleos 음성을 재생하지 못했어요.");
        }
    }

    void cancel(String id) {
        if (active != null && active.id.equals(id)) stop();
    }

    void stop() {
        if (active != null) finish(active, "error", "음성 안내를 중지했어요.");
    }

    private void finish(Request request, String phase, String message) {
        if (active != request) return;
        active = null;
        if (request.engine != null) {
            try {
                if (request.listening) request.engine.removeEventListener(request);
                if (!"done".equals(phase) && request.listening) request.engine.stop();
            } catch (RuntimeException error) {
                Log.w("GazeePleos", "Could not stop Pleos TTS", error);
            } finally {
                try {
                    request.engine.release();
                } catch (RuntimeException error) {
                    Log.w("GazeePleos", "Could not release Pleos TTS", error);
                }
            }
        }
        if (request.focus != null) audio.abandonAudioFocusRequest(request.focus);
        events.send(request.id, phase, message);
    }

    private final class Request implements EventListener {
        private final String id;
        private TextToSpeech engine;
        private AudioFocusRequest focus;
        private boolean listening;

        Request(String id) {
            this.id = id;
        }

        @Override public void onStart() {
            main.post(() -> {
                if (active == this) events.send(id, "started", "");
            });
        }
        @Override public void onReady() {}
        @Override public void onDone() {
            main.post(() -> finish(this, "done", ""));
        }
        @Override public void onStop() {
            main.post(() -> finish(this, "error", "음성 안내가 중지됐어요."));
        }
        @Override public void onUpdatedRms(double rms) {}
        @Override public void onError(ErrorType error) {
            main.post(() -> finish(this, "error", "Pleos 음성 합성 실패 · " + error));
        }
    }
}
