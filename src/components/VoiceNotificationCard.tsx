import type { MockNotificationData, TTSPlaybackState } from "../domain/notifications";
import { PostCard } from "./Community";
import { Icon } from "./Icon";

export function VoiceNotificationCard({
  notification,
  playback,
  enabled,
  onPlay,
  speechAction,
  readOnly = false,
}: {
  notification: MockNotificationData;
  playback: TTSPlaybackState;
  enabled: boolean;
  onPlay: () => void;
  speechAction?: { onPlay: () => void; enabled: boolean; status: string; playing: boolean };
  readOnly?: boolean;
}) {
  const playing = playback.status === "playing";
  const pending = playback.status === "queued";
  const failed = playback.status === "blocked" || playback.status === "unsupported" || playback.status === "cancelled";
  return (
    <section
      className="voice-notification"
      aria-label="수신 제보 메시지"
      data-post-id={notification.post.id}
    >
      <div className="notification-arrival">
        <span>
          <Icon name="route" size={17} />
          {notification.source}{notification.distanceMeters > 0 && ` · 약 ${notification.distanceMeters} m`}
        </span>
        <span className="mock-badge">MOCK DATA</span>
      </div>
      <div className="notification-message">
        <PostCard post={notification.post} compact />
        {!readOnly && <div className={`notification-audio ${playing ? "is-speaking" : ""}`}>
          <div className="notification-audio-heading">
            <Icon name="speaker" size={18} />
            <span>음성 안내</span>
            {playing && (
              <div className="notification-wave" aria-hidden="true">
                {[12, 22, 15, 29, 19, 25, 12].map((height, i) => (
                  <i key={i} style={{ height, animationDelay: `${i * 0.1}s` }} />
                ))}
              </div>
            )}
          </div>
          <p className="notification-quote">“{notification.speech}”</p>
          {speechAction && <div className="notification-playback">
            <button type="button" className="secondary-button" onClick={speechAction.onPlay}
              disabled={!speechAction.enabled}>
              <Icon name="speaker" size={16} />
              {speechAction.playing ? "음성 안내 중…" : "제보글 음성 출력"}
            </button>
            <span role="status">{speechAction.status || "버튼을 누르면 도착한 제보를 읽어 드려요."}</span>
          </div>}
          <div className="notification-playback">
            <span role="status">
              <span className={`status-dot ${playing ? "" : "muted"}`} />
              {playback.detail}
            </span>
            {failed && <button
              className="secondary-button"
              onClick={onPlay}
              disabled={!enabled || playing || pending}
            >
              <Icon name="speaker" size={15} />
              알림음 재시도
            </button>}
          </div>
        </div>}
      </div>
      <p className="notification-mock-note">
        <Icon name="info" size={14} />
        시연용 제보 데이터
      </p>
    </section>
  );
}
