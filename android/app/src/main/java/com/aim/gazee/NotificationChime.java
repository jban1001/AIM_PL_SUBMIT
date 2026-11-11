package com.aim.gazee;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.os.Handler;
import android.os.Looper;

/** Plays the short notification chime. */
final class NotificationChime {
    interface Events { void emit(String id, String phase, String message); }
    private final AudioManager audio;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Events events;
    private AudioTrack track;
    private AudioFocusRequest focus;
    private String activeId;
    private final Runnable timeout = () -> finish("error", "오디오 재생 완료를 확인하지 못했어요.");

    NotificationChime(Context context, Events events) {
        audio = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
        this.events = events;
    }

    void play(String id) {
        if (activeId != null) {
            events.emit(id, "error", "다른 알림음을 재생하고 있어요.");
            return;
        }
        activeId = id;
        try {
            AudioAttributes attributes = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build();
            focus = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                    .setAudioAttributes(attributes)
                    .setOnAudioFocusChangeListener(change -> {
                        if (change < 0) finish("error", "다른 오디오가 우선되어 알림음을 중단했어요.");
                    }, main).build();
            if (audio == null || audio.requestAudioFocus(focus) != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
                finish("error", "차량 오디오 사용을 허용받지 못했어요.");
                return;
            }
            final int rate = 24000;
            short[] pcm = new short[rate * 3 / 5];
            // Two gentle notes with fade-in/out to avoid clicks (total 600 ms).
            for (int i = 0; i < pcm.length; i++) {
                double time = (double) i / rate;
                double start = time < .22 ? 0 : .24;
                double duration = time < .22 ? .18 : .28;
                double local = time - start;
                if (local < 0 || local >= duration) continue;
                double envelope = Math.min(1, local / .012) * Math.min(1, (duration - local) / .09);
                double hz = time < .22 ? 660 : 880;
                pcm[i] = (short) (6000 * envelope * Math.sin(2 * Math.PI * hz * local));
            }
            track = new AudioTrack.Builder().setAudioAttributes(attributes)
                    .setAudioFormat(new AudioFormat.Builder().setSampleRate(rate)
                            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
                    .setTransferMode(AudioTrack.MODE_STATIC).setBufferSizeInBytes(pcm.length * 2).build();
            if (track.getState() == AudioTrack.STATE_UNINITIALIZED
                    || track.write(pcm, 0, pcm.length) != pcm.length) {
                finish("error", "알림음 오디오 버퍼를 준비하지 못했어요.");
                return;
            }
            track.setPlaybackPositionUpdateListener(new AudioTrack.OnPlaybackPositionUpdateListener() {
                @Override public void onMarkerReached(AudioTrack source) {
                    if (source == track) finish("done", "Android AudioTrack");
                }
                @Override public void onPeriodicNotification(AudioTrack source) { }
            }, main);
            if (track.setNotificationMarkerPosition(pcm.length - 1) != AudioTrack.SUCCESS) {
                finish("error", "알림음 재생 완료 감지를 설정하지 못했어요.");
                return;
            }
            track.play();
            main.postDelayed(timeout, 3000);
            events.emit(id, "started", "Android AudioTrack");
        } catch (RuntimeException error) {
            finish("error", "오디오 재생 실패 · " + error.getClass().getSimpleName());
        }
    }

    void cancel(String id) { if (id != null && id.equals(activeId)) stop(); }
    void stop() { finish("error", "알림음이 중단됐어요."); }

    private void finish(String phase, String message) {
        if (activeId == null) return;
        String id = activeId;
        activeId = null;
        main.removeCallbacks(timeout);
        if (track != null) {
            AudioTrack previous = track;
            track = null;
            previous.setPlaybackPositionUpdateListener(null);
            try { previous.stop(); } catch (IllegalStateException ignored) { }
            previous.release();
        }
        if (focus != null && audio != null) audio.abandonAudioFocusRequest(focus);
        focus = null;
        events.emit(id, phase, message);
    }
}
