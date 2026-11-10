import { useEffect, useRef, useState } from "react";
import {
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
  allowed.current = restricted && enabled && !paused;
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
    void playMockTTS(item.notification.speech, {
      signal: controller.signal,
      manual: item.manual,
      onStart: () => {
        if (alive.current && epoch === generation.current)
          update(id, { status: "playing", detail: "음성 안내 중 · Mock TTS" });
      },
      onSilentFallback: () => {
        if (alive.current && epoch === generation.current)
          update(id, { status: "simulating", detail: "브라우저 음성 미지원 · 무음 시연 중" });
      },
    })
      .then((result) => {
        if (alive.current && epoch === generation.current)
          update(id, {
            status: "played",
            detail:
              result === "spoken"
                ? "음성 안내 완료 · 카드는 유지됩니다."
                : "무음 시연 완료 · 실제 음성은 재생되지 않았습니다.",
          });
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
      status === "played" ||
      active.current?.id === id ||
      queue.current.some((item) => item.notification.post.id === id)
    )
      return;
    update(id, { status: "queued", detail: "음성 안내를 준비하고 있어요." });
    queue.current.push({ notification, manual });
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
    if (allowed.current) enqueue(notification, false);
    else
      update(id, { status: "muted", detail: "자동 안내 대기 없음 · 버튼으로 시작할 수 있어요." });
  }
  function playManual(notification: MockNotificationData) {
    if (!allowed.current) return;
    seen.current.add(notification.post.id);
    enqueue(notification, true);
  }
  useEffect(() => {
    if (restricted && enabled && !paused) return;
    active.current?.controller.abort();
    for (const item of queue.current)
      update(item.notification.post.id, {
        status: "cancelled",
        detail: "자동 안내가 중단됐어요. 카드는 유지됩니다.",
      });
    queue.current = [];
    // Intentionally no playback when restrictions/toggle are re-enabled.
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
