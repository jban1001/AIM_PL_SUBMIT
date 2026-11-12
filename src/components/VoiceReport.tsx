import { useEffect, useState } from "react";
import type { ReportSession } from "../hooks/useReportFlow";
import { Icon } from "./Icon";
import { CategoryLabel } from "./Community";

export function VoiceReport({
  session,
  community,
  onRetry,
  onCancel,
}: {
  session: ReportSession;
  community: string;
  onRetry: () => void;
  onCancel: () => void;
}) {
  const [remaining, setRemaining] = useState(60);
  const deadline = session.microphoneDeadline;
  useEffect(() => {
    if (session.phase !== "listening" || !deadline) {
      setRemaining(60);
      return;
    }
    const update = () => setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    update();
    const timer = setInterval(update, 250);
    return () => clearInterval(timer);
  }, [session.phase, deadline]);
  const failed = ["stt-error", "insufficient", "ai-error"].includes(session.phase);
  const processing = session.phase === "processing";
  const success = session.phase === "success";
  const transcript = session.voiceInput === "gleo" ? session.reportDetails?.utterance?.trim() : undefined;
  const micPreparing = session.phase === "listening" && session.voiceInput === "mic" && !session.microphoneReady;
  return (
    <section className={`voice-report ${failed ? "voice-failed" : ""}`} aria-label="음성 제보">
      <div className="voice-topline">
        <div className="report-tags">
          {session.simulationCategory && <CategoryLabel category={session.simulationCategory} />}
          <span className="target-badge">
            <Icon name="pin" size={15} />
            등록 대상 · {community}
          </span>
        </div>
        <span className="mock-badge">{session.voiceInput === "gleo" ? "Gleo Action" : session.voiceInput === "mic" ? "Pleos STT" : "MOCK STT"}</span>
      </div>
      <div className={`voice-orb ${session.phase === "listening" ? "listening" : ""}`}>
        <Icon name={success ? "check" : processing ? "spark" : failed ? "info" : "mic"} size={37} />
      </div>
      <span className="eyebrow">VOICE REPORT</span>
      <h2 role="status">
        {success
          ? "제보가 등록되었어요."
          : processing
            ? (session.voiceInput === "gleo" ? "제보를 등록하는 중이에요" : "제보를 정리하는 중이에요")
            : failed
              ? session.error
              : micPreparing ? (session.microphoneStatus || "마이크를 준비하고 있어요") : "듣고 있어요"}
      </h2>
      <p className="voice-subtitle">
        {success
          ? "등록 대상 커뮤니티에만 추가했어요."
          : processing
            ? "제보 내용을 등록하고 있어요."
            : failed
              ? "유효한 제보가 확보되기 전에는 게시하지 않습니다."
              : micPreparing ? "잠시 기다려 주세요."
                : session.voiceInput === "mic" ? "장소와 상황을 말하고, 끝나면 ‘제보해줘’라고 말해 주세요."
                  : session.allowIncompleteDemoSpeech ? "제보할 내용을 말해 주세요." : "어느 장소에서 어떤 상황인지 말해 주세요."}
      </p>
      {session.phase === "listening" && session.voiceInput === "mic" && (
        <p className="voice-subtitle" role="timer" aria-label="음성 입력 남은 시간">
          {deadline ? `남은 시간 ${remaining}초` : "최대 60초"} · 잠깐 쉬어도 이어서 들어요
        </p>
      )}
      {session.phase === "listening" && !micPreparing && (
        <div className="voice-wave" aria-hidden="true">
          {Array.from({ length: 33 }, (_, i) => (
            <i
              key={i}
              style={{ height: 10 + Math.sin(i * 1.7) ** 2 * 39, animationDelay: `${i * 0.06}s` }}
            />
          ))}
        </div>
      )}
      {!success && (
        <div className="recognized-text">
          <span>{session.voiceInput === "gleo" && !transcript ? "GLEO가 전달한 내용" : "인식된 발화"}</span>
          <p>{transcript || session.body || "발화를 기다리고 있어요…"}</p>
        </div>
      )}
      {processing && session.voiceInput !== "gleo" && (
        <div className="processing-steps">
          <span>
            <Icon name="check" size={14} />
            원본 확보
          </span>
          <span>
            <Icon name="check" size={14} />
            입력 준비
          </span>
          <span className="current">
            <span className="button-spinner" />
            Gemini Mock · 1회
          </span>
        </div>
      )}
      {failed && (
        <div className="voice-actions">
          <button className="secondary-button" onClick={onCancel}>
            취소
          </button>
          <button className="primary-button" onClick={onRetry}>
            <Icon name="refresh" size={17} />
            다시 시도
          </button>
        </div>
      )}
      {session.phase === "listening" && (
        <button className="voice-cancel" onClick={onCancel}>
          제보 취소
        </button>
      )}
      <p className="mock-caption">
        {session.voiceInput === "gleo"
          ? "GLEO가 앱에 전달한 제보예요."
          : session.voiceInput === "mic"
            ? "‘제보해줘’로 입력을 마쳐요. 60초가 지나면 등록하지 않고 내용을 보관해요."
            : "예시 발화로 음성 인식을 시연합니다."}
      </p>
    </section>
  );
}
