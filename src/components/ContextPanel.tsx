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
    <aside className="context-panel" aria-label="새 제보 수신 알림음 설정">
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
          <span>새 소식은 알림음으로.</span>
        </h2>
        <p className="summary-description">새 제보마다 짧은 알림음을 한 번 재생해요.</p>
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
            ? "수신 알림음 꺼짐"
            : offline
              ? "오프라인 · 기존 수신 정보 유지"
              : titleCount === 0
                ? "새 제보 수신 대기"
                : "수신 알림음 켜짐"}
          <span>알림음</span>
        </div>
        <div className="summary-transcript">
          <span className="small-label">
            <Icon name="spark" size={14} />
            {communityName}
          </span>
          <p>
            {enabled
              ? titleCount === 0
                ? "새 제보가 도착하면 알림음과 카드를 표시합니다."
                : "탭 변경이나 알림음 켜기만으로 기존 제보의 알림음을 반복하지 않습니다."
              : "알림음 설정은 새 수신에만 적용돼요. Gleo에게 제보 읽기를 요청하는 기능은 계속 사용할 수 있어요."}
          </p>
        </div>
        <p className="mock-caption">
          내용을 들으려면 “글레오, 지금 가지 앱에서 방금 받은 도로 제보를 알려줘”라고 말해 주세요.
          Gleo 읽기는 Pleos 앱에서 제공하며 웹 미리보기에서는 사용할 수 없어요.
        </p>
      </section>
    </aside>
  );
}
