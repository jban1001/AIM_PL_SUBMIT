import { useEffect, useRef, useState } from "react";
import {
  mockConfig,
  type CommunityId,
  type InputMode,
  type Post,
  type Scenario,
  type SpeechFault,
} from "../domain/types";
import { processReport, type ReportOptions } from "../services/mockCommunity";
import { normalizeReportBody, validateReportBody } from "../services/reportInput";
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
}
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
      body: "",
      phase: mode === "voice" ? "listening" : "editing",
      error: "",
      voiceInput,
      speechFault: mode === "voice" && voiceInput === "mock" ? latest.current.consumeSpeechFault() : "none",
    });
    if (providedBody) void submit(providedBody);
    return true;
  }
  async function submit(text?: string) {
    const snapshot = current.current;
    if (!snapshot || busy.current) return;
    const body = normalizeReportBody(text ?? snapshot.body);
    if (!validateReportBody(body)) {
      patch({ body, phase: "insufficient", error: "어떤 상황인지 한 문장 더 말해 주세요" });
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
        { ...options, source: snapshot.mode },
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
    patch({
      body: "",
      phase: "listening",
      error: "",
      speechFault: current.current.voiceInput === "mock" ? latest.current.consumeSpeechFault() : "none",
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
        onPartial: (body) => { if (isCurrent()) patch({ body }); },
        onResult: (body) => { if (isCurrent()) void submit(body); },
        onError: (error) => { if (isCurrent()) patch({ phase: "stt-error", error }); },
      });
    }
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
            if (!validateReportBody(text))
              patch({ phase: "insufficient", error: "어떤 상황인지 한 문장 더 말해 주세요" });
            else if (snapshot.mode === "voice") void submit(text);
            else patch({ phase: "editing" });
          }, mockConfig.speechEndMs);
        }
      },
      snapshot.speechFault === "stt" ? 1300 : mockConfig.speechStepMs,
    );
    return () => {
      clearInterval(interval);
      clearTimeout(finishTimer);
    };
    // Body streaming must not restart recognition; only a new session/phase does.
  }, [session?.id, session?.phase]);
  useEffect(() => {
    if (session?.phase !== "success") return;
    const timeout = setTimeout(closeSession, mockConfig.successMs);
    return () => clearTimeout(timeout);
  }, [session?.phase, session?.id]);
  return {
    session,
    begin,
    listen,
    submit: () => void submit(),
    retry,
    cancel,
    setBody: (body: string) => patch({ body, phase: "editing", error: "" }),
  };
}
