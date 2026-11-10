import { AISummaryToggle } from "./Community";
import { Icon } from "./Icon";
import type { Post } from "../domain/types";

// Mounted outside the locked post area, only while driving restrictions are active.
export function ContextPanel({
  enabled,
  onToggle,
  communityName,
  offline,
  posts,
}: {
  enabled: boolean;
  onToggle: () => void;
  communityName: string;
  offline: boolean;
  posts: Post[];
}) {
  const titleCount = new Set(
    posts.map((post) => post.summary.split("\n")[0].trim()).filter(Boolean),
  ).size;
  const active = enabled && titleCount > 0;
  return (
    <aside className="context-panel" aria-label="주행 제한 전용 AI 제목 읽기">
      <section className={`summary-panel ${enabled ? "" : "summary-disabled"}`}>
        <div className="summary-top">
          <div className="summary-icon">
            <Icon name="speaker" size={23} />
          </div>
          <AISummaryToggle enabled={enabled} onChange={onToggle} />
        </div>
        <h2>
          눈은 도로에,
          <br />
          <span>소식은 목소리로.</span>
        </h2>
        <p className="summary-description">수신한 제보를 ID별로 한 번만 자동 안내해요.</p>
        <div className="audio-visualizer" aria-hidden="true">
          {Array.from({ length: 35 }, (_, i) => (
            <i
              key={i}
              style={{
                height: `${8 + Math.sin(i * 1.8) ** 2 * 26}px`,
                animationDelay: `${i * 0.08}s`,
              }}
            />
          ))}
        </div>
        <div className="summary-status" role="status">
          <span className={`status-dot ${!active ? "muted" : ""}`} />
          {!enabled
            ? "제보 음성 안내 꺼짐"
            : offline
              ? "오프라인 · 받은 제보 안내"
              : titleCount === 0
                ? "안내할 게시글이 없습니다"
                : "제보 음성 안내 켜짐"}
          <span>MOCK TTS</span>
        </div>
        <div className="summary-transcript">
          <span className="small-label">
            <Icon name="spark" size={14} />
            {communityName}
          </span>
          <p>
            {enabled
              ? titleCount === 0
                ? "현재 커뮤니티에 새로운 게시글이 등록되면 제목 안내를 준비합니다."
                : "새 제보가 도착했을 때만 자동으로 안내합니다. 탭 변경이나 토글 켜기만으로 기존 제보를 다시 읽지 않습니다."
              : "음성 안내를 켜면 새로 수신하는 제보를 안내합니다. 기존 제보는 메시지의 시연 음성 재생 버튼으로 시작하세요."}
          </p>
        </div>
        <p className="mock-caption">
          브라우저 TTS로 Mock 문장을 읽습니다. 미지원 시 버튼으로 무음 시연합니다. Pleos 연동은
          없습니다.
        </p>
      </section>
    </aside>
  );
}
