import type { MockNotificationData, TTSPlaybackState } from "../domain/notifications";
import type { Post } from "../domain/types";
import { PostCard } from "./Community";
import { Icon } from "./Icon";
import { VoiceNotificationCard } from "./VoiceNotificationCard";

export function DrivingRestrictionPanel({
  communityName,
  notification,
  publishedPost,
  playback,
  enabled,
  onPlay,
  voiceWake,
  readOnly = false,
}: {
  communityName: string;
  notification?: MockNotificationData;
  publishedPost?: Post;
  playback: TTSPlaybackState;
  enabled: boolean;
  onPlay: () => void;
  readOnly?: boolean;
  voiceWake?: { active: boolean; status: string; onToggle: () => void };
}) {
  return (
    <section
      className="driving-restriction-panel"
      aria-label="주행 중 커뮤니티"
      data-restriction-state="DRIVING_RESTRICTED"
    >
      <div className="driving-panel-heading">
        <span>
          <Icon name="community" size={17} />
          {communityName}
        </span>
        <span className="driving-mode-badge">
          <Icon name="lock" size={12} />
          게시글 목록 제한
        </span>
      </div>
      {publishedPost ? (
        <section className="published-report" aria-label="등록된 내 제보">
          <div className="notification-arrival">
            <span><Icon name="check" size={17} />제보 등록 완료</span>
            {publishedPost.simulated && <span className="mock-badge">MOCK DATA</span>}
          </div>
          <div className="notification-message">
            <PostCard post={publishedPost} compact />
          </div>
        </section>
      ) : notification ? (
        <VoiceNotificationCard
          notification={notification}
          playback={playback}
          enabled={enabled}
          onPlay={onPlay}
          readOnly={readOnly}
        />
      ) : (
        <div className="notification-empty">
          <div className="notification-empty-icon">
            <Icon name="speaker" size={30} />
          </div>
          <span className="eyebrow">{readOnly ? "제보 수신 준비됨" : "제보 알림 준비됨"}</span>
          <h2>새로운 제보를 기다리고 있어요</h2>
          {readOnly ? (
            <p>주변 도로의 새로운 소식을<br />수신 카드로 알려드려요.</p>
          ) : (
            <p>
              주변 도로의 새로운 소식을
              <br />
              카드와 알림음으로 알려드려요.
            </p>
          )}
          <span className="notification-waiting">
            <span className="status-dot" />
            제보 수신 대기 중
          </span>
        </div>
      )}
      {readOnly ? (
        <div className="driving-panel-bottom">
          <div className="voice-command-reminder">
            <Icon name="mic" size={16} />
            <span className="voice-command-label">음성으로 제보하기</span>
            <strong>GLEO에게 제보할 수 있어요</strong>
          </div>
        </div>
      ) : <>
      <div className="driving-panel-bottom">
        {voiceWake ? (
          <div>
            <button
              type="button"
              className="voice-command-reminder voice-wake-button"
              aria-pressed={voiceWake.active}
              onClick={voiceWake.onToggle}
            >
              <Icon name="mic" size={16} />
              <span className="voice-command-label">음성으로 제보하기</span>
              <strong>{voiceWake.active ? "음성 호출 끄기" : "음성 호출 켜기"}</strong>
            </button>
            <p className="voice-wake-status" role="status">
              {voiceWake.status || "마이크를 켜고 “제보할게”라고 말해 주세요."}
            </p>
          </div>
        ) : (
          <div className="voice-command-reminder">
            <Icon name="mic" size={16} />
            <span className="voice-command-label">음성으로 제보하기</span>
            <strong>“제보할게”라고 말해보세요</strong>
          </div>
        )}

      </div>
      <div className="policy-note">
        <Icon name="shield" size={15} />
        주행 중 탭 터치는 시연 전용입니다. Pleos 정책 검증 및 실제 차량 연동 전
        상태입니다.
      </div>
      </>}
    </section>
  );
}
