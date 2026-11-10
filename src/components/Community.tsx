import { useEffect, useRef, type ReactNode } from "react";
import {
  CURRENT_USER_ID,
  communities,
  type Category,
  type CommunityId,
  type Post,
  type VehicleState,
} from "../domain/types";
import { Icon } from "./Icon";

export function AppLayout({
  children,
  vehicleState,
  time,
}: {
  children: ReactNode;
  vehicleState: VehicleState;
  time: string;
}) {
  return (
    <div className="app-shell">
      <div className="app-body">
        <header className="topbar">
          <div className="wordmark">
            GA<span>ZEE</span>
          </div>
          <span className="topbar-subtitle">도로 위의 커뮤니티</span>
          <div className="vehicle-status">
            <span className={`status-dot ${vehicleState === "driving" ? "amber" : ""}`} />
            <Icon name="car" size={19} />
            {vehicleState === "driving"
              ? "주행 제한 중"
              : vehicleState === "parked"
                ? "주차 중"
                : "정차 중"}
          </div>
          <span className="topbar-line" />
          <time>{time}</time>
        </header>
        {children}
      </div>
    </div>
  );
}

export function CommunityTabs({
  selected,
  onChange,
}: {
  selected: CommunityId;
  onChange: (id: CommunityId) => void;
}) {
  return (
    <nav className="community-tabs" aria-label="커뮤니티 선택">
      {communities.map((item) => (
        <button
          key={item.id}
          aria-current={item.id === selected ? "page" : undefined}
          className={`community-tab ${item.id === selected ? "selected" : ""}`}
          onClick={() => onChange(item.id)}
        >
          <div className="tab-icon">
            <Icon name={item.icon} size={26} />
          </div>
          <div>
            <strong>{item.name}</strong>
            <span>{item.subtitle}</span>
          </div>
          <div className="tab-check">{item.id === selected && <Icon name="check" size={14} />}</div>
        </button>
      ))}
    </nav>
  );
}

const categoryStyles: Record<Category, string> = {
  "도로 위험": "danger",
  교통: "traffic",
  주차: "parking",
  "지역 정보": "local",
  기타: "other",
};
export function CategoryLabel({ category }: { category: Category }) {
  return (
    <span className={`category ${categoryStyles[category]}`}>
      <span />
      {category}
    </span>
  );
}
export function PostCard({
  post,
  onDelete,
  compact = false,
}: {
  post: Post;
  onDelete?: (id: string) => void;
  compact?: boolean;
}) {
  const minutes = Math.max(0, Math.floor((Date.now() - post.createdAt) / 60000));
  return (
    <article className={`post-card ${compact ? "notification-post" : ""}`}>
      <div className="post-meta">
        <CategoryLabel category={post.category} />
        <div className="post-meta-right">
          {post.authorId === CURRENT_USER_ID && <span className="own-post">내 제보</span>}
          <span className="post-time">
            {minutes < 1
              ? "방금 전"
              : minutes < 60
                ? `${minutes}분 전`
                : `${Math.floor(minutes / 60)}시간 전`}
          </span>
          {onDelete && post.authorId === CURRENT_USER_ID && (
            <button
              className="delete-post"
              aria-label={`${post.summary} 삭제`}
              onClick={() => onDelete(post.id)}
            >
              삭제
            </button>
          )}
        </div>
      </div>
      <h3>{post.summary}</h3>
      {post.evidence && (
        <div className="post-evidence">
          <Icon name="spark" size={15} />
          <p>
            <span>제보 근거</span>
            {post.evidence}
          </p>
        </div>
      )}
    </article>
  );
}
export function NewPostNotification({ count, onApply }: { count: number; onApply: () => void }) {
  return count > 0 ? (
    <button className="new-posts" onClick={onApply}>
      <span>
        <span className="new-dot" />새 글 <b>{count}개</b>가 도착했어요
      </span>
      <span>
        확인하기 <Icon name="down" size={15} />
      </span>
    </button>
  ) : null;
}
export function StateMessage({
  type,
  onRetry,
}: {
  type: "loading" | "empty" | "error";
  onRetry?: () => void;
}) {
  const content = {
    loading: ["주변 소식을 불러오고 있어요", "잠시만 기다려 주세요."],
    empty: ["아직 등록된 글이 없습니다", "이 커뮤니티의 첫 소식을 전해 주세요."],
    error: ["네트워크에 연결할 수 없어요", "연결 상태를 확인하고 다시 시도해 주세요."],
  }[type];
  return (
    <div className="state-message" role="status">
      <div className={type === "loading" ? "spinner" : "state-icon"}>
        {type !== "loading" && <Icon name={type === "empty" ? "community" : "wifi"} size={32} />}
      </div>
      <h3>{content[0]}</h3>
      <p>{content[1]}</p>
      {type === "error" && (
        <button className="secondary-button" onClick={onRetry}>
          다시 시도
        </button>
      )}
    </div>
  );
}
export function PostList({
  posts,
  loading,
  empty,
  offline,
  scrollTop,
  onScroll,
  onMore,
  hasMore,
  loadingMore,
  community,
  onRetry,
  onDelete,
}: {
  posts: Post[];
  loading: boolean;
  empty: boolean;
  offline: boolean;
  scrollTop: number;
  onScroll: (value: number) => void;
  onMore: () => void;
  hasMore: boolean;
  loadingMore: boolean;
  community: CommunityId;
  onRetry: () => void;
  onDelete: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = scrollTop;
  }, [community, loading, empty, scrollTop]);
  return (
    <div
      className="post-scroll"
      ref={ref}
      onScroll={(event) => {
        if (loading || empty) return;
        const el = event.currentTarget;
        onScroll(el.scrollTop);
        if (el.scrollHeight - el.scrollTop - el.clientHeight < 70 && !loading && !empty && !offline)
          onMore();
      }}
    >
      {loading ? (
        <StateMessage type="loading" />
      ) : empty || posts.length === 0 ? (
        <StateMessage type={offline ? "error" : "empty"} onRetry={onRetry} />
      ) : (
        <>
          {posts.map((post) => (
            <PostCard post={post} key={post.id} onDelete={onDelete} />
          ))}
          <button
            className="load-more"
            disabled={loadingMore || offline || !hasMore}
            onClick={onMore}
          >
            {loadingMore
              ? "이전 게시글 불러오는 중…"
              : hasMore
                ? "이전 게시글 더 보기"
                : "최근 24시간의 소식을 모두 확인했어요"}
            {hasMore && <Icon name="down" size={16} />}
          </button>
        </>
      )}
    </div>
  );
}
export function ReportEntry({ onClick }: { onClick: () => void }) {
  return (
    <button className="primary-button" onClick={onClick}>
      <Icon name="plus" size={19} />글 작성
    </button>
  );
}
export function AISummaryToggle({ enabled, onChange }: { enabled: boolean; onChange: () => void }) {
  return (
    <button
      role="switch"
      aria-label="AI 게시글 제목 읽기"
      aria-checked={enabled}
      onClick={onChange}
      className={`toggle ${enabled ? "on" : ""}`}
    >
      <span />
    </button>
  );
}

export { AppLayout as CommunityLayout };
export function DrivingRestrictionOverlay({
  community,
  children,
}: {
  community: string;
  children?: ReactNode;
}) {
  return (
    <div className="driving-overlay">
      <div className="driving-layout">
        <div className="driving-restriction-message">
          <div className="lock-orbit">
            <Icon name="lock" size={38} />
          </div>
          <span className="eyebrow">SAFETY FIRST</span>
          <h2>주행 중 이용이 제한돼요</h2>
          <p>
            지금은 운전에 집중해 주세요.
            <br />
            정차하면 보던 화면으로 돌아갑니다.
          </p>
          <div className="voice-trigger-hint">
            <Icon name="mic" size={19} />
            <span>“제보할게”라고 말해 주세요</span>
          </div>
          <span className="voice-target">{community}에 제보 · 화면 바깥 발화 시연 버튼 사용</span>
        </div>
        {children}
      </div>
      <div className="policy-note">
        <Icon name="shield" size={16} />탭 조작·음성 제보·제목 읽기 제어는 Pleos 정책 검증이 필요한
        Mock 동작입니다.
      </div>
    </div>
  );
}
