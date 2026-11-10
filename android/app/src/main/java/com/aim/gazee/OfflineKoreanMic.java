package com.aim.gazee;

import android.content.Context;
import android.util.Log;

import org.json.JSONObject;
import org.vosk.Model;
import org.vosk.Recognizer;
import org.vosk.android.RecognitionListener;
import org.vosk.android.SpeechService;
import org.vosk.android.StorageService;

import java.io.IOException;

final class OfflineKoreanMic {
    private static final String MODEL_ASSET = "vosk-model-small-ko-0.22";
    private static final float SAMPLE_RATE = 16_000f;

    private final Context context;
    private final PleosMic.EventSink events;
    private Model model;
    private boolean loading;
    private boolean closed;
    private Request active;

    OfflineKoreanMic(Context context, PleosMic.EventSink events) {
        this.context = context.getApplicationContext();
        this.events = events;
    }

    void listen(String id) {
        if (closed) return;
        interrupt();
        active = new Request(id);
        if (model != null) {
            start(active);
        } else if (!loading) {
            loading = true;
            StorageService.unpack(context, MODEL_ASSET, "gazee-voice", loaded -> {
                loading = false;
                if (closed) {
                    loaded.close();
                    return;
                }
                model = loaded;
                if (active != null) start(active);
            }, error -> {
                loading = false;
                Log.w("GazeePleos", "Offline Korean model load failed", error);
                if (active != null) finish(active, "error", "오프라인 한국어 모델을 열지 못했어요.");
            });
        }
    }

    private void start(Request request) {
        try {
            request.recognizer = new Recognizer(model, SAMPLE_RATE);
            request.service = new SpeechService(request.recognizer, SAMPLE_RATE);
            if (!request.service.startListening(request, 24_000)) {
                finish(request, "error", "마이크를 시작하지 못했어요.");
            }
        } catch (IOException | RuntimeException | LinkageError error) {
            Log.w("GazeePleos", "Offline STT could not start", error);
            finish(request, "error", "마이크를 시작하지 못했어요.");
        }
    }

    void cancel(String id) {
        if (active != null && active.id.equals(id)) finish(active, null, "");
    }

    void interrupt() {
        if (active != null) finish(active, "error", "마이크 듣기가 중지됐어요.");
    }

    void close() {
        closed = true;
        interrupt();
        if (model != null) model.close();
        model = null;
    }

    private void finish(Request request, String phase, String value) {
        if (active != request) return;
        active = null;
        if (request.service != null) {
            request.service.cancel();
            request.service.shutdown();
        }
        if (request.recognizer != null) request.recognizer.close();
        if (phase != null) events.send(request.id, phase, value);
    }

    private final class Request implements RecognitionListener {
        private final String id;
        private SpeechService service;
        private Recognizer recognizer;
        private boolean ready;

        Request(String id) {
            this.id = id;
        }

        @Override public void onPartialResult(String hypothesis) {
            if (active != this) return;
            if (!ready) {
                ready = true;
                events.send(id, "ready", "offline");
            }
            String partial = readText(hypothesis, "partial");
            if (!partial.isEmpty()) events.send(id, "partial", partial);
        }

        @Override public void onResult(String hypothesis) {
            String transcript = readText(hypothesis, "text");
            if (!transcript.isEmpty()) finish(this, "result", transcript);
        }

        @Override public void onFinalResult(String hypothesis) {
            onResult(hypothesis);
        }

        @Override public void onError(Exception error) {
            Log.w("GazeePleos", "Offline STT recording failed", error);
            finish(this, "error", "마이크로 소리를 받지 못했어요.");
        }

        @Override public void onTimeout() {
            finish(this, "error", "들은 말이 없어요. 마이크를 켜고 다시 말해 주세요.");
        }
    }

    private static String readText(String hypothesis, String key) {
        try {
            return new JSONObject(hypothesis).optString(key, "").trim();
        } catch (org.json.JSONException error) {
            return "";
        }
    }
}
