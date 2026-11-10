import type { MockNotificationData, TTSPlaybackState } from "../domain/notifications";
import { PostCard } from "./Community";
import { Icon } from "./Icon";

export function VoiceNotificationCard({
  notification,
  playback,
  enabled,
  onPlay,
}: {
  notification: MockNotificationData;
  playback: TTSPlaybackState;
  enabled: boolean;
  onPlay: () => void;
}) {
  const playing = playback.status === "playing" || playback.status === "simulating";
  const completed = playback.status === "played";
  const pending = playback.status === "queued";
  return (
    <section
      className="voice-notification"
      aria-label="수신 제보 메시지"
      data-post-id={notification.post.id}
    >
      <div className="notification-arrival">
        <span>
          <Icon name="route" size={17} />
          {notification.source} · 약 {notification.distanceMeters} m
        </span>
        <span className="mock-badge">MOCK DATA</span>
      </div>
      <div className="notification-message">
        <PostCard post={notification.post} compact />
        <div className={`notification-audio ${playing ? "is-speaking" : ""}`}>
          <div className="notification-audio-heading">
            <Icon name="speaker" size={18} />
            <span>{window.GazeeSpeech ? "음성 안내 · Pleos TTS" : "음성 안내"}</span>
            {playing && (
              <div className="notification-wave" aria-hidden="true">
                {[12, 22, 15, 29, 19, 25, 12].map((height, i) => (
                  <i key={i} style={{ height, animationDelay: `${i * 0.1}s` }} />
                ))}
              </div>
            )}
          </div>
          <p className="notification-quote">“{notification.speech}”</p>
          <div className="notification-playback">
            <span role="status">
              <span className={`status-dot ${playing ? "" : "muted"}`} />
              {playback.detail}
            </span>
            <button
              className="secondary-button"
              onClick={onPlay}
              disabled={!enabled || playing || pending || completed}
            >
              <Icon name={completed ? "check" : "speaker"} size={15} />
              {completed
                ? "안내 완료"
                : playing
                  ? "안내 중"
                  : pending
                    ? "준비 중"
                    : "시연 음성 재생"}
            </button>
          </div>
        </div>
      </div>
      <p className="notification-mock-note">
        <Icon name="info" size={14} />
        차량 근거는 시연용 Mock 데이터이며, 실제 센서로 확인한 결과가 아닙니다.
      </p>
    </section>
  );
}
