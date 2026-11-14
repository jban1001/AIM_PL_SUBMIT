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
  voiceAction,
  speechAction,
  onBack,
  readOnly = false,
}: {
  communityName: string;
  notification?: MockNotificationData;
  publishedPost?: Post;
  playback: TTSPlaybackState;
  enabled: boolean;
  onPlay: () => void;
  speechAction?: { onPlay: () => void; enabled: boolean; status: string; playing: boolean };
  readOnly?: boolean;
  onBack?: () => void;
  voiceAction?: { label: string; hint: string; pressed?: boolean; onClick: () => void };
}) {
  return (
    <section
      className="driving-restriction-panel"
      aria-label={onBack ? "수신 제보 상세" : "주행 중 커뮤니티"}
      data-restriction-state={onBack ? "UNRESTRICTED" : "DRIVING_RESTRICTED"}
    >
      <div className="driving-panel-heading">
        <span>
          <Icon name="community" size={17} />
          {communityName}
        </span>
        {onBack ? <button type="button" className="secondary-button" onClick={onBack}>
          목록으로 돌아가기
        </button> : <span className="driving-mode-badge">
          <Icon name="lock" size={12} />
          게시글 목록 제한
        </span>}
      </div>
      {publishedPost ? (
        <section className="published-report" aria-label="등록된 내 제보">
          <div className="notification-arrival">
            <span><Icon name="check" size={17} />제보가 등록되었습니다.</span>
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
          speechAction={speechAction}
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
        {voiceAction ? (
          <div>
            <button
              type="button"
              className="voice-command-reminder voice-wake-button"
              aria-pressed={voiceAction.pressed}
              onClick={voiceAction.onClick}
            >
              <Icon name="mic" size={16} />
              <span className="voice-command-label">음성으로 제보하기</span>
              <strong>{voiceAction.label}</strong>
            </button>
            <p className="voice-wake-status" role="status">
              {voiceAction.hint}
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
        {onBack ? "이용자 제보는 검증된 사실이 아닙니다." : "주행 중 탭 터치는 시연 전용입니다. Pleos 정책 검증 및 실제 차량 연동 전 상태입니다."}
      </div>
      </>}
    </section>
  );
}
