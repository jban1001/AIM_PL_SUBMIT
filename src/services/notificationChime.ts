declare global {
  interface Window {
    GazeeChime?: { play(id: string): void; cancel(id: string): void };
  }
}

export class NotificationChimeError extends Error {
  code: "blocked" | "unsupported";
  constructor(code: "blocked" | "unsupported", message: string) {
    super(message);
    this.code = code;
  }
}
let sequence = 0;
export function playNotificationChime({ signal, onStart }: {
  signal: AbortSignal;
  onStart: (engine: string) => void;
}): Promise<string> {
  if (signal.aborted) return Promise.reject(new DOMException("Cancelled", "AbortError"));
  const bridge = window.GazeeChime;
  if (bridge) return new Promise((resolve, reject) => {
    const engine = "Android AudioTrack";
    const id = `chime-${Date.now()}-${++sequence}`;
    let settled = false;
    let started = false;
    const timer = setTimeout(() => finish(new NotificationChimeError("blocked", "오디오 응답이 없어요.")), 4000);
    function finish(error?: Error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      window.removeEventListener("gazee-chime", receive);
      if (error) {
        try { bridge!.cancel(id); } catch { /* Activity may have closed. */ }
        reject(error);
      } else resolve(engine);
    }
    function abort() { finish(new DOMException("Cancelled", "AbortError")); }
    function receive(event: Event) {
      const value = (event as CustomEvent<{id: string; phase: string; message: string}>).detail;
      if (value.id !== id) return;
      if (value.phase === "started") { started = true; onStart(engine); }
      else if (value.phase === "done") {
        finish(started ? undefined : new NotificationChimeError("blocked", "알림음 재생 시작을 확인하지 못했어요."));
      } else if (value.phase === "error") finish(new NotificationChimeError("blocked", value.message));
    }
    window.addEventListener("gazee-chime", receive);
    signal.addEventListener("abort", abort, {once: true});
    try {
      bridge.play(id);
    } catch { finish(new NotificationChimeError("blocked", "오디오를 호출하지 못했어요.")); }
  });
  if (typeof window.AudioContext !== "function")
    return Promise.reject(new NotificationChimeError("unsupported", "이 환경은 알림음을 지원하지 않아요."));
  // Browser preview uses an actual local audio waveform, never speech synthesis.
  return new Promise((resolve, reject) => {
    let context: AudioContext;
    let settled = false;
    const timer = setTimeout(() => finish(new NotificationChimeError("blocked", "알림음 테스트 버튼으로 오디오를 허용해 주세요.")), 4000);
    function finish(error?: Error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      if (context) void context.close().catch(() => {});
      if (error) reject(error); else resolve("브라우저 Web Audio");
    }
    function abort() { finish(new DOMException("Cancelled", "AbortError")); }
    signal.addEventListener("abort", abort, {once: true});
    void (async () => {
      try {
        context = new window.AudioContext();
        await context.resume();
        if (settled) return;
        if (context.state !== "running") throw new Error("오디오 재생이 허용되지 않았어요.");
        const now = context.currentTime;
        for (const [offset, hz, duration] of [[0, 660, .18], [.24, 880, .28]]) {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.frequency.value = hz;
          gain.gain.setValueAtTime(0, now + offset);
          gain.gain.linearRampToValueAtTime(.14, now + offset + .012);
          gain.gain.linearRampToValueAtTime(0, now + offset + duration);
          oscillator.connect(gain).connect(context.destination);
          if (offset > 0) oscillator.onended = () => finish();
          oscillator.start(now + offset);
          oscillator.stop(now + offset + duration);
        }
        onStart("브라우저 Web Audio");
      } catch (error) {
        finish(new NotificationChimeError("blocked", error instanceof Error ? error.message : "알림음 재생 실패"));
      }
    })();
  });
}
