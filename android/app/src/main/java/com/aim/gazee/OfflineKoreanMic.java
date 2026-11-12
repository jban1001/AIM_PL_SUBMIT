package com.aim.gazee;

import android.content.Context;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;

import com.k2fsa.sherpa.onnx.OfflineModelConfig;
import com.k2fsa.sherpa.onnx.OfflineRecognizer;
import com.k2fsa.sherpa.onnx.OfflineRecognizerConfig;
import com.k2fsa.sherpa.onnx.OfflineStream;
import com.k2fsa.sherpa.onnx.OfflineWhisperModelConfig;
import com.k2fsa.sherpa.onnx.SileroVadModelConfig;
import com.k2fsa.sherpa.onnx.Vad;
import com.k2fsa.sherpa.onnx.VadModelConfig;

import java.io.IOException;
import java.util.Arrays;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class OfflineKoreanMic {
    interface EventSink {
        void send(String id, String phase, String value);
    }

    private static final String ASSETS = "gazee-whisper/";
    private static final int SAMPLE_RATE = 16_000;
    private static final int FRAME_SIZE = 512;
    private static final long WAIT_FOR_SPEECH_MS = 8_000;
    private static final long MAX_RECORDING_MS = 18_000;

    private final Context context;
    private final EventSink events;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    // The recognizer is owned by the worker. The request reference is owned by the main thread.
    private OfflineRecognizer recognizer;
    private Request active;
    private boolean closed;

    OfflineKoreanMic(Context context, EventSink events) {
        this.context = context.getApplicationContext();
        this.events = events;
    }

    void listen(String id) {
        if (closed) return;
        interrupt();
        Request request = new Request(id);
        active = request;
        events.send(id, "preparing", "한국어 음성 인식을 준비하고 있어요.");
        worker.execute(() -> transcribe(request));
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
        worker.execute(() -> {
            if (recognizer != null) {
                recognizer.release();
                recognizer = null;
            }
        });
        worker.shutdown();
    }

    private void transcribe(Request request) {
        if (request.cancelled) return;
        try {
            if (recognizer == null) recognizer = createRecognizer();
            if (request.cancelled) return;
            float[] samples = recordSpeech(request);
            if (request.cancelled) return;
            if (samples == null || samples.length == 0) {
                main.post(() -> finish(request, "error", "들은 말이 없어요. 다시 말해 주세요."));
                return;
            }
            send(request, "preparing", "말한 내용을 받아쓰고 있어요.");
            long start = SystemClock.elapsedRealtime();
            String transcript;
            OfflineStream stream = recognizer.createStream();
            try {
                stream.acceptWaveform(samples, SAMPLE_RATE);
                recognizer.decode(stream);
                transcript = recognizer.getResult(stream).getText().trim();
            } finally {
                stream.release();
            }
            Log.i("GazeePleos", "Whisper decode · speechMs=" + (samples.length * 1000 / SAMPLE_RATE)
                    + " · decodeMs=" + (SystemClock.elapsedRealtime() - start));
            main.post(() -> {
                if (transcript.isEmpty()) finish(request, "error", "음성을 인식하지 못했어요. 다시 말해 주세요.");
                else finish(request, "result", transcript);
            });
        } catch (IOException | RuntimeException | LinkageError error) {
            Log.w("GazeePleos", "Offline Whisper STT failed", error);
            main.post(() -> finish(request, "error", "한국어 음성 인식을 사용할 수 없어요. 다시 시도해 주세요."));
        }
    }

    private OfflineRecognizer createRecognizer() {
        OfflineWhisperModelConfig whisper = new OfflineWhisperModelConfig();
        whisper.setEncoder(ASSETS + "base-encoder.int8.onnx");
        whisper.setDecoder(ASSETS + "base-decoder.int8.onnx");
        whisper.setLanguage("ko");
        whisper.setTask("transcribe");

        OfflineModelConfig model = new OfflineModelConfig();
        model.setWhisper(whisper);
        model.setTokens(ASSETS + "base-tokens.txt");
        model.setNumThreads(Math.min(4, Runtime.getRuntime().availableProcessors()));

        OfflineRecognizerConfig config = new OfflineRecognizerConfig();
        config.setModelConfig(model);
        return new OfflineRecognizer(context.getAssets(), config);
    }

    private Vad createVad() {
        SileroVadModelConfig silero = new SileroVadModelConfig();
        silero.setModel(ASSETS + "silero_vad.onnx");
        silero.setWindowSize(FRAME_SIZE);
        silero.setThreshold(0.40f);
        silero.setMinSpeechDuration(0.22f);
        silero.setMinSilenceDuration(0.90f);
        silero.setMaxSpeechDuration(16.0f);

        VadModelConfig config = new VadModelConfig();
        config.setSileroVadModelConfig(silero);
        config.setSampleRate(SAMPLE_RATE);
        config.setNumThreads(1);
        return new Vad(context.getAssets(), config);
    }

    private float[] recordSpeech(Request request) throws IOException {
        int minimum = AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT);
        if (minimum <= 0) throw new IOException("Unsupported microphone format: " + minimum);
        Vad vad = createVad();
        AudioRecord recorder = null;
        try {
            recorder = new AudioRecord.Builder()
                    .setAudioSource(MediaRecorder.AudioSource.VOICE_RECOGNITION)
                    .setAudioFormat(new AudioFormat.Builder()
                            .setSampleRate(SAMPLE_RATE)
                            .setChannelMask(AudioFormat.CHANNEL_IN_MONO)
                            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                            .build())
                    .setBufferSizeInBytes(Math.max(minimum, FRAME_SIZE * 8))
                    .build();
            recorder.startRecording();
            if (recorder.getRecordingState() != AudioRecord.RECORDSTATE_RECORDING) {
                throw new IOException("Microphone did not start recording.");
            }
            send(request, "ready", "whisper");
            short[] buffer = new short[FRAME_SIZE];
            float[] samples = new float[FRAME_SIZE];
            float[] recording = new float[(int) (MAX_RECORDING_MS * SAMPLE_RATE / 1000)];
            int recorded = 0;
            long start = SystemClock.elapsedRealtime();
            boolean spoke = false;
            while (!request.cancelled && recorded < recording.length) {
                long elapsed = SystemClock.elapsedRealtime() - start;
                if (elapsed >= MAX_RECORDING_MS || (!spoke && elapsed >= WAIT_FOR_SPEECH_MS)) break;
                int count = recorder.read(buffer, 0, Math.min(buffer.length, recording.length - recorded),
                        AudioRecord.READ_BLOCKING);
                if (count < 0) throw new IOException("Microphone read failed: " + count);
                if (count == 0) continue;
                for (int i = 0; i < count; i++) samples[i] = buffer[i] / 32768f;
                System.arraycopy(samples, 0, recording, recorded, count);
                recorded += count;
                vad.acceptWaveform(count == samples.length ? samples : Arrays.copyOf(samples, count));
                if (!vad.empty()) return trimToUtterance(vad, recording, recorded);
                spoke |= vad.isSpeechDetected();
            }
            if (request.cancelled || !spoke) return null;
            vad.flush();
            return vad.empty() ? null : trimToUtterance(vad, recording, recorded);
        } finally {
            if (recorder != null) {
                try {
                    if (recorder.getRecordingState() == AudioRecord.RECORDSTATE_RECORDING) recorder.stop();
                } finally {
                    recorder.release();
                }
            }
            vad.release();
        }
    }

    private static float[] trimToUtterance(Vad vad, float[] recording, int count) {
        // Keep context before the first detected frame and the full tail used to decide that speech ended.
        int speechStart = (int) vad.front().getStart();
        int start = Math.max(0, Math.min(speechStart, count) - SAMPLE_RATE / 5);
        return Arrays.copyOfRange(recording, start, count);
    }

    private void send(Request request, String phase, String value) {
        main.post(() -> {
            if (active == request) events.send(request.id, phase, value);
        });
    }

    private void finish(Request request, String phase, String value) {
        if (active != request) return;
        active = null;
        request.cancelled = true;
        if (phase != null) events.send(request.id, phase, value);
    }

    private static final class Request {
        final String id;
        volatile boolean cancelled;
        Request(String id) { this.id = id; }
    }
}
