type MicBridge = {
  listen(id: string): void;
  cancel(id: string): void;
};

declare global {
  interface Window {
    GazeeMic?: MicBridge;
  }
}

type MicCallbacks = {
  onReady?: () => void;
  onPreparing?: (message: string) => void;
  onPartial?: (text: string) => void;
  onResult: (text: string) => void;
  onError: (message: string) => void;
};

let nextMicId = 0;

export function listenWithAppMic(callbacks: MicCallbacks) {
  const bridge = window.GazeeMic;
  if (!bridge) {
    callbacks.onError("이 환경에서는 앱 마이크를 사용할 수 없어요.");
    return;
  }
  const id = String(++nextMicId);
  let stopped = false;
  function stop() {
    if (stopped) return;
    stopped = true;
    window.removeEventListener("gazee-mic", receive);
    clearTimeout(timeout);
    bridge?.cancel(id);
  }
  function receive(event: Event) {
    const { id: requestId, phase, value } = (event as CustomEvent<{
      id: string;
      phase: string;
      value: string;
    }>).detail;
    if (id !== requestId) return;
    if (phase === "ready") callbacks.onReady?.();
    else if (phase === "preparing") callbacks.onPreparing?.(value);
    else if (phase === "partial") callbacks.onPartial?.(value);
    else if (phase === "result" || phase === "error") {
      stop();
      if (phase === "result") callbacks.onResult(value);
      else callbacks.onError(value);
    }
  }
  const timeout = setTimeout(() => {
    stop();
    callbacks.onError("마이크 듣기 시간이 끝났어요. 다시 켜 주세요.");
  }, 30_000);
  window.addEventListener("gazee-mic", receive);
  try {
    bridge.listen(id);
  } catch {
    stop();
    callbacks.onError("앱 마이크를 열지 못했어요.");
  }
  return stop;
}
