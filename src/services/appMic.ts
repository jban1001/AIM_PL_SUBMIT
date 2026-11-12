type MicBridge = {
  listen(id: string): void;
  cancel(id: string): void;
};

declare global {
  interface Window { GazeeMic?: MicBridge; }
}

type MicCallbacks = {
  onReady?: () => void;
  onPreparing?: (message: string) => void;
  onPartial?: (text: string) => void;
  onDeadline?: (deadline: number) => void;
  onResult: (text: string) => void;
  onError: (message: string) => void;
};

export const REPORT_LISTEN_MS = 60_000;
export const REPORT_END_PHRASE = "제보해줘";
// Match a confirmed command at the end, allowing spacing and ASR punctuation.
const endPhrase = /제\s*보\s*해\s*줘[\s.!?。！？…]*$/u;
const join = (first: string, second: string) => [first.trim(), second.trim()].filter(Boolean).join(" ");
let nextMicId = 0;

function listenOnce(callbacks: MicCallbacks & { onIdle?: () => void }, listenMs = 30_000) {
  const bridge = window.GazeeMic;
  if (!bridge) {
    callbacks.onError("이 환경에서는 앱 마이크를 사용할 수 없어요.");
    return;
  }
  const id = String(++nextMicId);
  let stopped = false;
  let timeout: ReturnType<typeof setTimeout>;
  function stop() {
    if (stopped) return;
    stopped = true;
    window.removeEventListener("gazee-mic", receive);
    clearTimeout(timeout);
    bridge?.cancel(id);
  }
  function timedOut() {
    stop();
    callbacks.onError("마이크 응답 시간이 끝났어요. 다시 켜 주세요.");
  }
  function receive(event: Event) {
    const { id: requestId, phase, value } = (event as CustomEvent<{
      id: string; phase: string; value: string;
    }>).detail;
    if (stopped || id !== requestId) return;
    if (phase === "ready") {
      clearTimeout(timeout);
      timeout = setTimeout(timedOut, listenMs);
      callbacks.onReady?.();
    } else if (phase === "preparing") callbacks.onPreparing?.(value);
    else if (phase === "partial") callbacks.onPartial?.(value);
    else if (phase === "result" || phase === "error" || phase === "idle") {
      stop();
      if (phase === "result") callbacks.onResult(value);
      else if (phase === "idle" && callbacks.onIdle) callbacks.onIdle();
      else callbacks.onError(value);
    }
  }
  timeout = setTimeout(timedOut, 30_000); // Includes a possible first-use permission prompt.
  window.addEventListener("gazee-mic", receive);
  try { bridge.listen(id); }
  catch {
    stop();
    callbacks.onError("앱 마이크를 열지 못했어요.");
  }
  return stop;
}

/** Wake detection stays one utterance; only report dictation aggregates utterances. */
export function listenWithAppMic(
  callbacks: MicCallbacks,
  options: { report?: boolean; initialBody?: string } = {},
) {
  if (!options.report) return listenOnce(callbacks);

  let committed = options.initialBody?.trim() ?? "";
  let partial = "";
  let stopped = false;
  let deadline = 0;
  let stopRound: (() => void) | undefined;
  let limitTimer: ReturnType<typeof setTimeout> | undefined;
  let restartTimer: ReturnType<typeof setTimeout> | undefined;

  function stop() {
    if (stopped) return;
    stopped = true;
    clearTimeout(limitTimer);
    clearTimeout(restartTimer);
    stopRound?.();
    stopRound = undefined;
  }
  function fail(message: string) {
    if (stopped) return;
    callbacks.onPartial?.(join(committed, partial));
    stop();
    callbacks.onError(message);
  }
  function expire() {
    fail("60초가 지나 음성 입력을 멈췄어요. 내용은 보관했으며 등록하지 않았어요.");
  }
  function completeIfCommand(text: string) {
    if (!endPhrase.test(text)) return false;
    const body = text.replace(endPhrase, "").trim();
    if (!body) {
      fail("제보할 내용을 먼저 말한 뒤 ‘제보해줘’라고 말해 주세요.");
    } else {
      stop();
      callbacks.onResult(body);
    }
    return true;
  }
  function restart() {
    if (stopped) return;
    if (deadline && Date.now() >= deadline) { expire(); return; }
    callbacks.onPreparing?.("이어서 들을 준비 중이에요. 끝나면 ‘제보해줘’라고 말해 주세요.");
    // The native layer has stopped/released the previous utterance before sending its result.
    restartTimer = setTimeout(beginRound, 250);
  }
  function beginRound() {
    if (stopped) return;
    if (deadline && Date.now() >= deadline) { expire(); return; }
    const cleanup = listenOnce({
      onReady: () => {
        if (stopped) return;
        if (!deadline) {
          clearTimeout(limitTimer);
          deadline = Date.now() + REPORT_LISTEN_MS;
          limitTimer = setTimeout(expire, REPORT_LISTEN_MS);
          callbacks.onDeadline?.(deadline);
        }
        callbacks.onReady?.();
      },
      onPreparing: (message) => { if (!stopped) callbacks.onPreparing?.(message); },
      onPartial: (text) => {
        if (stopped) return;
        partial = text;
        callbacks.onPartial?.(join(committed, partial));
      },
      onResult: (text) => {
        if (stopped) return;
        const candidate = join(committed, text);
        // Wait for a confirmed result: an interim transcript may still revise the command.
        if (completeIfCommand(candidate)) return;
        committed = candidate;
        partial = "";
        callbacks.onPartial?.(committed);
        restart();
      },
      onIdle: () => {
        if (partial.trim()) fail("발화의 최종 결과를 확인하지 못했어요. 받아 적은 내용은 보관했어요.");
        else restart();
      },
      onError: fail,
    }, REPORT_LISTEN_MS + 5_000);
    // A synchronous bridge failure/result may already have ended the report.
    if (stopped) cleanup?.();
    else stopRound = cleanup;
  }

  if (!completeIfCommand(committed)) {
    limitTimer = setTimeout(() => fail("마이크를 준비하지 못했어요. 다시 시도해 주세요."), 30_000);
    beginRound();
  }
  return stop;
}
