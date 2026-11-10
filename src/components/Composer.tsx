import type { ReportSession } from "../hooks/useReportFlow";
import { VoiceReport } from "./VoiceReport";
import { Icon } from "./Icon";

export function Composer({
  session,
  community,
  onBody,
  onBack,
  onSubmit,
  onListen,
  onRetry,
  onExample,
}: {
  session: ReportSession;
  community: string;
  onBody: (value: string) => void;
  onBack: () => void;
  onSubmit: () => void;
  onListen: () => void;
  onRetry: () => void;
  onExample: () => void;
}) {
  const processing = session.phase === "processing";
  if (session.phase === "listening" || session.phase === "stt-error" || session.phase === "success")
    return (
      <VoiceReport session={session} community={community} onRetry={onRetry} onCancel={onBack} />
    );
  return (
    <section className="composer">
      <button className="back-button" disabled={processing} onClick={onBack}>
        <Icon name="back" size={17} />
        커뮤니티로 돌아가기
      </button>
      <div className="composer-heading">
        <div>
          <span className="eyebrow">SHARE THE ROAD</span>
          <h2>어떤 소식을 전해주실 건가요?</h2>
        </div>
        <span className="mock-badge">MOCK AI</span>
      </div>
      <div className="target-badge">
        <Icon name="pin" size={15} />
        등록 대상 · {community}
        <Icon name="lock" size={13} />
      </div>
      <label htmlFor="report-body">제보 내용</label>
      <div className="body-input">
        <textarea
          id="report-body"
          value={session.body}
          disabled={processing}
          maxLength={1000}
          onChange={(e) => onBody(e.target.value)}
          placeholder="도로 상황을 직접 적거나 마이크로 말해 주세요."
        />
        <button
          className="microphone-button"
          aria-label="마이크로 본문 입력"
          disabled={processing}
          onClick={onListen}
        >
          <Icon name="mic" size={22} />
          <span>말로 입력</span>
        </button>
      </div>
      <div className="composer-input-footer">
        <button disabled={processing} onClick={onExample}>
          <Icon name="flask" size={14} />
          {session.scenario.name} 예시 불러오기
        </button>
        <span>{session.body.length} / 1,000</span>
      </div>
      <div className="composer-help">
        <Icon name="spark" size={21} />
        <div>
          <b>내용만 적어주세요. 나머지는 AI가 정리할게요.</b>
          <p>
            제목·근거 피드백·범주를 한 번의 Mock 호출로 생성합니다.
            <br />
            입력 방법과 관계없이 이 화면에서는 등록 버튼을 눌러야 게시됩니다.
          </p>
        </div>
      </div>
      {session.error && (
        <div className="inline-error" role="alert">
          <Icon name="info" size={18} />
          <div>
            {session.error}
            {session.phase === "ai-error" && (
              <p>원본은 게시되지 않았습니다. 내용은 그대로 보관했어요.</p>
            )}
          </div>
        </div>
      )}
      {processing && (
        <div className="processing-banner" role="status">
          <span className="spinner" />
          <div>
            <b>제보를 정리하는 중이에요</b>
            <span>Gemini Mock · 등록 시도당 한 번의 호출</span>
          </div>
        </div>
      )}
      <div className="composer-actions">
        <span>등록 대상은 작성 도중 탭을 바꿔도 유지됩니다.</span>
        <button
          className="primary-button"
          disabled={!session.body.trim() || processing}
          onClick={onSubmit}
        >
          <Icon name={session.phase === "ai-error" ? "refresh" : "plus"} size={18} />
          {processing ? "처리 중" : session.phase === "ai-error" ? "다시 시도" : "등록"}
        </button>
      </div>
    </section>
  );
}
