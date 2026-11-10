export class MockTTSError extends Error {
  code: "unsupported" | "blocked";
  constructor(code: "unsupported" | "blocked", message: string) {
    super(message);
    this.code = code;
  }
}
type PleosSpeechBridge = {
  speak(id: string, text: string): void;
  cancel(id: string): void;
};

declare global {
  interface Window {
    GazeeSpeech?: PleosSpeechBridge;
  }
}

let nextSpeechId = 0;

function pleosSpeech(
  bridge: PleosSpeechBridge,
  text: string,
  signal: AbortSignal,
  onStart: () => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Cancelled", "AbortError"));
      return;
    }

    const id = String(++nextSpeechId);
    let watchdog = setTimeout(timeout, 10_000);
    function finish(error?: Error) {
      clearTimeout(watchdog);
      signal.removeEventListener("abort", abort);
      window.removeEventListener("gazee-speech", receive);
      if (error) {
        bridge.cancel(id);
        reject(error);
      } else resolve();
    }
    function timeout() {
      finish(new MockTTSError("blocked", "Pleos 음성 서비스의 응답이 없어요."));
    }
    function abort() {
      finish(new DOMException("Cancelled", "AbortError"));
    }
    function receive(event: Event) {
      const { id: requestId, phase, message } = (event as CustomEvent<{
        id: string;
        phase: string;
        message: string;
      }>).detail;
      if (requestId !== id) return;

      if (phase === "started") {
        clearTimeout(watchdog);
        watchdog = setTimeout(timeout, 30_000);
        onStart();
      } else if (phase === "done") {
        finish();
      } else if (phase === "error") {
        finish(new MockTTSError("blocked", message));
      }
    }
    signal.addEventListener("abort", abort, { once: true });
    window.addEventListener("gazee-speech", receive);
    try {
      bridge.speak(id, text);
    } catch {
      finish(new MockTTSError("blocked", "Pleos 음성 서비스를 호출하지 못했어요."));
    }
  });
}

function browserSpeech(text: string, signal: AbortSignal, onStart: () => void): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Cancelled", "AbortError"));
      return;
    }
    if (
      typeof window === "undefined" ||
      typeof window.speechSynthesis?.speak !== "function" ||
      typeof window.SpeechSynthesisUtterance !== "function"
    ) {
      reject(new MockTTSError("unsupported", "이 브라우저는 음성을 지원하지 않아요."));
      return;
    }
    const synth = window.speechSynthesis;
    const utterance = new window.SpeechSynthesisUtterance(text);
    utterance.lang = "ko-KR";
    utterance.rate = 0.95;
    let settled = false;
    let watchdog: ReturnType<typeof setTimeout>;
    function finish(error?: Error) {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      signal.removeEventListener("abort", abort);
      utterance.onstart = null;
      utterance.onend = null;
      utterance.onerror = null;
      if (error) {
        synth.cancel();
        reject(error);
      } else resolve();
    }
    function abort() {
      finish(new DOMException("Cancelled", "AbortError"));
    }
    signal.addEventListener("abort", abort, { once: true });
    utterance.onstart = () => {
      clearTimeout(watchdog);
      onStart();
      // Do not leave the UI stuck if an engine never emits an end event.
      watchdog = setTimeout(
        () =>
          finish(
            new MockTTSError(
              "blocked",
              "음성 엔진 응답이 없어 시연 버튼으로 다시 시작할 수 있어요.",
            ),
          ),
        30_000,
      );
    };
    utterance.onend = () => finish();
    utterance.onerror = () =>
      finish(new MockTTSError("blocked", "음성을 재생하지 못했어요. 시연 버튼을 눌러 주세요."));
    watchdog = setTimeout(
      () => finish(new MockTTSError("blocked", "자동 음성이 제한됐어요. 시연 버튼을 눌러 주세요.")),
      2200,
    );
    try {
      synth.speak(utterance);
    } catch {
      finish(new MockTTSError("blocked", "자동 음성이 제한됐어요. 시연 버튼을 눌러 주세요."));
    }
  });
}
function silentSimulation(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Cancelled", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, 4200);
    function abort() {
      clearTimeout(timer);
      reject(new DOMException("Cancelled", "AbortError"));
    }
    signal.addEventListener("abort", abort, { once: true });
  });
}
// The installed app uses Pleos TTS to read the same simulated report text.
// When speech is unavailable, only an explicit button starts the labelled silent demo.
export async function playMockTTS(
  text: string,
  options: {
    signal: AbortSignal;
    manual: boolean;
    onStart: () => void;
    onSilentFallback: () => void;
  },
): Promise<"spoken" | "simulated"> {
  try {
    const bridge = typeof window !== "undefined" ? window.GazeeSpeech : undefined;
    if (bridge) await pleosSpeech(bridge, text, options.signal, options.onStart);
    else await browserSpeech(text, options.signal, options.onStart);
    return "spoken";
  } catch (error) {
    if (options.signal.aborted || !options.manual) throw error;
    options.onSilentFallback();
    await silentSimulation(options.signal);
    return "simulated";
  }
}
