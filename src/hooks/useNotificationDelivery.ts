import { useEffect, useRef, useState } from "react";
import {
  compareNotificationPriority,
  emptyNotificationHistory,
  recordNotification,
  type MockNotificationData,
  type TTSPlaybackState,
} from "../domain/notifications";
import { NotificationChimeError, playNotificationChime } from "../services/notificationChime";

const idle: TTSPlaybackState = { status: "idle", detail: "새 제보를 기다리고 있어요." };
export function useNotificationDelivery({
  enabled,
  paused,
}: {
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
  automatic.current = enabled;
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
    void playNotificationChime({
      signal: controller.signal,
      onStart: (engine) => {
        if (alive.current && epoch === generation.current)
          update(id, { status: "playing", engine, detail: "새 제보 알림음 재생 중" });
      },
    })
      .then((engine) => {
        if (alive.current && epoch === generation.current)
          update(id, { status: "played", engine, detail: "알림음 전달 완료 · 제보 읽기는 Gleo에게 요청하세요." });
      })
      .catch((error) => {
        if (!alive.current || epoch !== generation.current) return;
        if (controller.signal.aborted)
          update(id, {
            status: "cancelled",
            detail: "알림음 중단 · 필요하면 알림음을 재시도하세요.",
          });
        else
          update(id, {
            status:
              error instanceof NotificationChimeError && error.code === "unsupported"
                ? "unsupported"
                : "blocked",
            detail: error instanceof Error ? error.message : "알림음 재시도 버튼을 눌러 주세요.",
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
    update(id, { status: "queued", detail: "새 제보 알림음을 준비하고 있어요." });
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
      update(id, { status: "muted", detail: "수신 알림음 꺼짐 · 제보는 Gleo에게 읽어달라고 요청하세요." });
  }
  function retryChime(notification: MockNotificationData) {
    if (!allowed.current) return;
    seen.current.add(notification.post.id);
    enqueue(notification, true);
  }
  useEffect(() => {
    if (!enabled) {
      active.current?.controller.abort();
      for (const item of queue.current)
        update(item.notification.post.id, {
          status: "cancelled",
          detail: "알림음이 중단됐어요. 알림음 재시도 버튼을 사용할 수 있어요.",
        });
      queue.current = [];
    } else if (paused) {
      // Do not play a chime over a report / microphone session. A newly received report
      // remains queued and is delivered when that session finishes.
      active.current?.controller.abort();
    } else {
      pump();
    }
  }, [enabled, paused]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      generation.current += 1;
      active.current?.controller.abort();
      queue.current = [];
    };
  }, []);
  return { history, playback, receive, retryChime, stateFor: (id: string) => playback[id] ?? idle };
}
