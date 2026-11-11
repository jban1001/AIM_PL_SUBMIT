import { useEffect, useRef, useState } from "react";
import {
  mockConfig,
  type Category,
  type CommunityId,
  type InputMode,
  type Post,
  type Scenario,
  type SpeechFault,
} from "../domain/types";
import { processReport, scenarioReportInputError, type ReportOptions } from "../services/mockCommunity";
import { normalizeReportBody, type GleoReportDetails } from "../services/reportInput";

import { listenWithPleos } from "../services/pleosMic";

export type ReportPhase =
  | "editing"
  | "listening"
  | "stt-error"
  | "insufficient"
  | "processing"
  | "ai-error"
  | "success";
export interface ReportSession {
  id: string;
  community: CommunityId;
  mode: InputMode;
  scenario: Scenario;
  body: string;
  phase: ReportPhase;
  error: string;
  speechFault: SpeechFault;
  voiceInput: "mock" | "mic" | "gleo";
  reportDetails?: GleoReportDetails;
  scriptedExample?: boolean;
  simulationCategory?: Category;
  microphoneReady?: boolean;
  // 받아쓰기 자동 시연: open(작성 화면) → dictating(말로 입력) → dictated(등록 대기)
  demo?: "open" | "dictating" | "dictated";
  // 자동 시연이 곧 누를 버튼을 강조합니다.
  demoPress?: "mic" | "submit";
  // 시연 속도 배율. 0.5면 받아쓰기·처리·완료 표시가 모두 2배 길어집니다. 생략 시 1.
  speed?: number;
}
const scaled = (session: Pick<ReportSession, "speed">, ms: number) => ms / (session.speed ?? 1);
const DEMO_PRESS_DELAY_MS = 900;
const DEMO_PRESS_HOLD_MS = 500;
interface FlowProps {
  getPosts: (community: CommunityId) => Post[];
  getOptions: () => ReportOptions & { fail: boolean; offline: boolean };
  consumeSpeechFault: () => SpeechFault;
  onPublished: (post: Post, mode: InputMode, voiceInput: ReportSession["voiceInput"]) => void;
}
export function useReportFlow(props: FlowProps) {
  const latest = useRef(props);
  latest.current = props;
  const [session, setSession] = useState<ReportSession | null>(null);
  const current = useRef<ReportSession | null>(null);
  const suspendedTouch = useRef<ReportSession | null>(null);
  const busy = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  function replace(value: ReportSession | null) {
    current.current = value;
    setSession(value);
  }
  function patch(value: Partial<ReportSession>) {
    if (current.current) replace({ ...current.current, ...value });
  }
  function closeSession() {
    const draft = current.current?.mode === "voice" ? suspendedTouch.current : null;
    suspendedTouch.current = null;
    replace(draft);
  }
  function begin(
    mode: InputMode,
    community: CommunityId,
    scenario: Scenario,
    providedBody?: string,
    voiceInput: ReportSession["voiceInput"] = providedBody === undefined ? "mock" : "mic",
    reportDetails?: GleoReportDetails,
    options: Pick<ReportSession, "demo" | "speed" | "scriptedExample" | "simulationCategory"> = {},
  ) {
    if (
      busy.current ||
      current.current?.phase === "listening" ||
      current.current?.phase === "success"
    )
      return false;
    if (mode === "voice" && current.current?.mode === "touch")
      suspendedTouch.current = current.current;
    replace({
      id: crypto.randomUUID(),
      mode,
      community,
      scenario,
      body: providedBody ?? "",
      phase: mode === "voice" ? "listening" : "editing",
      error: "",
      voiceInput,
      microphoneReady: false,
      reportDetails,
      ...options,
      speechFault: mode === "voice" && voiceInput === "mock" ? latest.current.consumeSpeechFault() : "none",
    });
    if (providedBody) void submit(providedBody);
    return true;
  }
  // 터치 작성 화면을 열고 말로 입력 → 받아쓰기 → 등록을 순서대로 자동 진행합니다.
  // 각 단계는 사용자가 직접 누르는 것과 같은 listen/submit 경로를 사용합니다.
  function beginDictationDemo(community: CommunityId, scenario: Scenario, speed = 1) {
    if (busy.current || current.current) return;
    begin("touch", community, scenario, undefined, "mock", undefined, {
      demo: "open", speed, scriptedExample: true, simulationCategory: scenario.category,
    });
  }
  function beginVoiceDemo(community: CommunityId, scenario: Scenario, speed?: number) {
    begin("voice", community, scenario, undefined, "mock", undefined, {
      speed, scriptedExample: true, simulationCategory: scenario.category,
    });
  }
  async function submit(text?: string) {
    const snapshot = current.current;
    if (!snapshot || busy.current) return;
    const body = normalizeReportBody(text ?? snapshot.body);
    const issue = scenarioReportInputError(snapshot.scenario, body, snapshot.reportDetails, snapshot.scriptedExample);
    if (issue) {
      patch({ body, phase: "insufficient", error: issue.message });
      return;
    }
    const options = latest.current.getOptions();
    if (options.offline) {
      patch({
        body,
        phase: "ai-error",
        error: "네트워크 연결이 끊겼어요. 연결 후 다시 시도해 주세요.",
      });
      return;
    }
    busy.current = true;
    patch({ body, phase: "processing", error: "" });
    try {
      const post = await processReport(
        snapshot.scenario,
        body,
        snapshot.community,
        latest.current.getPosts(snapshot.community),
        options.fail,
        {
          ...options,
          source: snapshot.mode,
          reportDetails: snapshot.reportDetails,
          scriptedExample: snapshot.scriptedExample,
          simulationCategory: snapshot.simulationCategory,
          aiDelayMs: scaled(snapshot, mockConfig.aiDelayMs),
        },
      );
      if (!alive.current || current.current?.id !== snapshot.id) return;
      latest.current.onPublished(post, snapshot.mode, snapshot.voiceInput);
      patch({ phase: "success", error: "" });
    } catch (err) {
      if (alive.current && current.current?.id === snapshot.id)
        patch({ phase: "ai-error", error: (err as Error).message });
    } finally {
      busy.current = false;
    }
  }
  function listen() {
    if (busy.current || !current.current || current.current.phase === "success") return;
    const demo = current.current.demo;
    const voiceInput = demo || !window.GazeeMic ? "mock" : "mic";
    patch({
      body: "",
      phase: "listening",
      error: "",
      voiceInput,
      microphoneReady: false,
      speechFault: voiceInput === "mock" ? latest.current.consumeSpeechFault() : "none",
      demo: demo === "open" ? "dictating" : demo,
      demoPress: undefined,
    });
  }
  function retry() {
    if (current.current?.phase === "ai-error") void submit();
    else listen();
  }
  function cancel() {
    if (!busy.current) closeSession();
  }

  useEffect(() => {
    if (session?.phase !== "listening") return;
    const snapshot = session;
    if (snapshot.voiceInput === "mic") {
      function isCurrent() {
        return current.current?.id === snapshot.id && current.current.phase === "listening";
      }
      return listenWithPleos({
        onReady: () => { if (isCurrent()) patch({ microphoneReady: true }); },
        onPartial: (body) => { if (isCurrent()) patch({ body }); },
        onResult: (body) => {
          if (!isCurrent()) return;
          if (snapshot.mode === "voice") void submit(body);
          else patch({ body, phase: "editing" });
        },
        onError: (error) => { if (isCurrent()) patch({ phase: "stt-error", error }); },
      });
    }
    if (snapshot.voiceInput === "gleo") return;
    let finishTimer: ReturnType<typeof setTimeout>;
    let index = 0;
    const text =
      snapshot.speechFault === "insufficient"
        ? "어…"
        : normalizeReportBody(snapshot.scenario.exampleInput);
    const interval = setInterval(
      () => {
        if (current.current?.id !== snapshot.id || current.current.phase !== "listening") {
          clearInterval(interval);
          return;
        }
        if (snapshot.speechFault === "stt") {
          clearInterval(interval);
          patch({ phase: "stt-error", error: "음성을 인식하지 못했어요" });
          return;
        }
        index += mockConfig.speechChunkSize;
        patch({ body: text.slice(0, index) });
        if (index >= text.length) {
          clearInterval(interval);
          finishTimer = setTimeout(() => {
            if (current.current?.id !== snapshot.id || current.current.phase !== "listening")
              return;
            const issue = scenarioReportInputError(snapshot.scenario, text, undefined, snapshot.scriptedExample);
            if (issue)
              patch({ phase: "insufficient", error: issue.message });
            else if (snapshot.mode === "voice") void submit(text);
            else
              patch({
                phase: "editing",
                demo: current.current.demo === "dictating" ? "dictated" : current.current.demo,
              });
          }, scaled(snapshot, mockConfig.speechEndMs));
        }
      },
      scaled(snapshot, snapshot.speechFault === "stt" ? 1300 : mockConfig.speechStepMs),
    );
    return () => {
      clearInterval(interval);
      clearTimeout(finishTimer);
    };
    // Body streaming must not restart recognition; only a new session/phase does.
  }, [session?.id, session?.phase]);
  useEffect(() => {
    const snapshot = session;
    if (!snapshot || snapshot.phase !== "editing") return;
    const press =
      snapshot.demo === "open" ? "mic" : snapshot.demo === "dictated" ? "submit" : null;
    if (!press) return;
    const stillHere = () =>
      current.current?.id === snapshot.id &&
      current.current.phase === "editing" &&
      current.current.demo === snapshot.demo;
    const pressTimer = setTimeout(() => {
      if (stillHere()) patch({ demoPress: press });
    }, scaled(snapshot, DEMO_PRESS_DELAY_MS));
    const actTimer = setTimeout(() => {
      if (!stillHere()) return;
      if (press === "mic") listen();
      else {
        patch({ demo: undefined, demoPress: undefined });
        void submit();
      }
    }, scaled(snapshot, DEMO_PRESS_DELAY_MS + DEMO_PRESS_HOLD_MS));
    return () => {
      clearTimeout(pressTimer);
      clearTimeout(actTimer);
    };
  }, [session?.id, session?.phase, session?.demo]);
  useEffect(() => {
    if (session?.phase !== "success") return;
    const timeout = setTimeout(closeSession, scaled(session, mockConfig.successMs));
    return () => clearTimeout(timeout);
  }, [session?.phase, session?.id]);
  return {
    session,
    begin,
    beginDictationDemo,
    beginVoiceDemo,
    listen,
    submit: () => void submit(),
    retry,
    cancel,
    setBody: (body: string) => patch({ body, phase: "editing", error: "" }),
  };
}
