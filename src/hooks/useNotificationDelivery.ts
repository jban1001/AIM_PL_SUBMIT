import { useEffect, useRef, useState } from "react";
import {
  compareNotificationPriority,
  emptyNotificationHistory,
  recordNotification,
  type MockNotificationData,
  type TTSPlaybackState,
} from "../domain/notifications";
import { MockTTSError, playMockTTS } from "../services/mockTTS";

const idle: TTSPlaybackState = { status: "idle", detail: "새 제보를 기다리고 있어요." };
export function useNotificationDelivery({
  restricted,
  enabled,
  paused,
}: {
  restricted: boolean;
  enabled: boolean;
  paused: boolean;
}) {
  const [history, setHistory] = useState(emptyNotificationHistory);
  const historyRef = useRef(history);
  const [playback, setPlayback] = useState<Record<string, TTSPlaybackState>>({});
  const states = useRef<Record<string, TTSPlaybackState>>({});
  const seen = useRef(new Set<string>());
  const queue = useRef<{ notification: MockNotificationData; manual: boolean }[]>([]);
  const active = useRef<{ id: string; controller: AbortController } | null>(null);
  const allowed = useRef(false);
  allowed.current = enabled && !paused;
  const automatic = useRef(false);
  automatic.current = restricted && enabled;
  const generation = useRef(0);
  const alive = useRef(true);
  function update(id: string, value: TTSPlaybackState) {
    states.current = { ...states.current, [id]: value };
    if (alive.current) setPlayback(states.current);
  }
  function pump() {
    if (!allowed.current || active.current || !queue.current.length) return;
    const item = queue.current.shift()!;
    const id = item.notification.post.id;
    const controller = new AbortController();
    const epoch = generation.current;
    active.current = { id, controller };
    let fallbackReason: string | undefined;
    void playMockTTS(item.notification.speech, {
      signal: controller.signal,
      manual: item.manual,
      onStart: (engine) => {
        if (alive.current && epoch === generation.current)
          update(id, { status: "playing", engine, fallbackReason, detail: `음성 안내 중 · ${engine}` });
      },
      onProgress: (detail) => {
        if (alive.current && epoch === generation.current)
          update(id, { status: "queued", detail, fallbackReason });
      },
      onFallback: (reason) => { fallbackReason = reason; },
    })
      .then((engine) => {
        if (alive.current && epoch === generation.current)
          update(id, { status: "played", engine, fallbackReason, detail: `음성 안내 완료 · ${engine}` });
      })
      .catch((error) => {
        if (!alive.current || epoch !== generation.current) return;
        if (controller.signal.aborted)
          update(id, {
            status: "cancelled",
            detail: "안내 중단 · 필요한 경우 버튼으로 시작하세요.",
          });
        else
          update(id, {
            status:
              error instanceof MockTTSError && error.code === "unsupported"
                ? "unsupported"
                : "blocked",
            detail: error instanceof Error ? error.message : "시연 음성 재생 버튼을 눌러 주세요.",
          });
      })
      .finally(() => {
        if (epoch !== generation.current) return;
        active.current = null;
        pump();
      });
  }
  function enqueue(notification: MockNotificationData, manual: boolean) {
    const id = notification.post.id;
    const status = states.current[id]?.status;
    if (
      (!manual && status === "played") ||
      active.current?.id === id ||
      queue.current.some((item) => item.notification.post.id === id)
    )
      return;
    update(id, { status: "queued", detail: "음성 안내를 준비하고 있어요." });
    queue.current.push({ notification, manual });
    queue.current.sort((a, b) => compareNotificationPriority(a.notification, b.notification));
    pump();
  }
  function receive(notification: MockNotificationData) {
    const next = recordNotification(historyRef.current, notification);
    historyRef.current = next;
    setHistory(next);
    const id = notification.post.id;
    if (seen.current.has(id)) return;
    // Mark at event time, not in a tab/render effect (also safe in StrictMode).
    seen.current.add(id);
    if (automatic.current) enqueue(notification, false);
    else
      update(id, { status: "muted", detail: "자동 안내 대기 없음 · 버튼으로 시작할 수 있어요." });
  }
  function playManual(notification: MockNotificationData) {
    if (!allowed.current) return;
    seen.current.add(notification.post.id);
    enqueue(notification, true);
  }
  useEffect(() => {
    if (!enabled || !restricted) {
      active.current?.controller.abort();
      for (const item of queue.current)
        update(item.notification.post.id, {
          status: "cancelled",
          detail: "자동 안내가 중단됐어요. 다시 듣기 버튼을 사용할 수 있어요.",
        });
      queue.current = [];
    } else if (paused) {
      // Do not speak over a Gleo / microphone session. A newly received report
      // remains queued and is delivered when that session finishes.
      active.current?.controller.abort();
    } else {
      pump();
    }
  }, [restricted, enabled, paused]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      generation.current += 1;
      active.current?.controller.abort();
      queue.current = [];
    };
  }, []);
  return { history, playback, receive, playManual, stateFor: (id: string) => playback[id] ?? idle };
}
