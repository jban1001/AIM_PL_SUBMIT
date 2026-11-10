import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyNotificationHistory,
  recordNotification,
  upsertReceivedPost,
} from "../src/domain/notifications.ts";
import { BlackIceScenario } from "../src/scenarios/notifications/blackIce.ts";
import { communities } from "../src/domain/types.ts";
import { MockTTSError, playMockTTS } from "../src/services/mockTTS.ts";

test("탭 이름과 순서는 내 차·목적지·방향 중심이며 기존 community ID를 유지한다", () => {
  assert.deepEqual(
    communities.map((item) => item.name),
    ["내 차 중심", "내 목적지 중심", "내 방향 중심"],
  );
  assert.deepEqual(
    communities.map((item) => item.id),
    ["nearby", "destination", "direction"],
  );
});
test("블랙아이스 이벤트는 고정 ID, 450m, 3분 전 제보와 정확한 음성 문장을 만든다", () => {
  const event = BlackIceScenario.createEvent("nearby", 1_000_000);
  assert.equal(event.distanceMeters, 450);
  assert.equal(event.post.createdAt, 820_000);
  assert.equal(event.post.summary, "성수대교 진입부 블랙아이스 제보");
  assert.equal(event.post.category, "도로 위험");
  assert.equal(event.post.evidence, "차량 데이터로 관측됨");
  assert.equal(event.speech, "전방 약 450미터, 성수대교 진입부에 블랙아이스 제보가 있습니다.");
  assert.equal(event.simulated, true);
  assert.equal(event.post.simulated, true);
  assert.equal(event.post.id, BlackIceScenario.createEvent("destination").post.id);
});
test("수신 이력은 탭별로 독립적이며 같은 탭의 동일 ID는 중복 저장하지 않는다", () => {
  const initial = emptyNotificationHistory();
  const nearby = BlackIceScenario.createEvent("nearby");
  const first = recordNotification(initial, nearby);
  assert.equal(first.nearby.length, 1);
  assert.equal(first.destination.length, 0);
  assert.equal(first.direction.length, 0);
  assert.equal(recordNotification(first, nearby), first);
  const second = recordNotification(first, BlackIceScenario.createEvent("destination"));
  assert.equal(second.nearby[0], nearby);
  assert.equal(second.destination.length, 1);
  assert.equal(second.direction.length, 0);
  assert.deepEqual(initial, emptyNotificationHistory());
});
test("수신 글은 목록에 ID별 한 번만 존재하며 최신순을 유지한다", () => {
  const old = BlackIceScenario.createEvent("nearby", 1_000_000).post;
  const newer = { ...old, id: "newer", createdAt: old.createdAt + 60_000 };
  const result = upsertReceivedPost(upsertReceivedPost([newer], old), old);
  assert.equal(result.length, 2);
  assert.equal(result[0].id, "newer");
  assert.equal(result[1].id, old.id);
});

function withWindow(value: unknown, run: () => Promise<void>) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { value, configurable: true });
  return run().finally(() => {
    if (descriptor) Object.defineProperty(globalThis, "window", descriptor);
    else Reflect.deleteProperty(globalThis, "window");
  });
}
class FakeUtterance {
  lang = "";
  rate = 1;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  text: string;
  constructor(text: string) {
    this.text = text;
  }
}
test("브라우저 TTS 어댑터는 Mock 문장을 한 번 전달하고 종료를 반환한다", async () => {
  let calls = 0,
    starts = 0,
    cancels = 0;
  const event = BlackIceScenario.createEvent("nearby");
  await withWindow(
    {
      SpeechSynthesisUtterance: FakeUtterance,
      speechSynthesis: {
        speak: (utterance: FakeUtterance) => {
          calls++;
          assert.equal(utterance.text, event.speech);
          assert.equal(utterance.lang, "ko-KR");
          queueMicrotask(() => {
            utterance.onstart?.();
            utterance.onend?.();
          });
        },
        cancel: () => cancels++,
      },
    },
    async () => {
      const result = await playMockTTS(event.speech, {
        signal: new AbortController().signal,
        manual: false,
        onStart: () => starts++,
        onSilentFallback: () => assert.fail("unexpected fallback"),
      });
      assert.equal(result, "spoken");
    },
  );
  assert.equal(calls, 1);
  assert.equal(starts, 1);
  assert.equal(cancels, 0);
});
test("TTS 미지원 시 자동 재생은 실패를 반환하며 임의의 무음 시연을 시작하지 않는다", async () => {
  await withWindow({}, async () => {
    await assert.rejects(
      playMockTTS("테스트", {
        signal: new AbortController().signal,
        manual: false,
        onStart: () => assert.fail(),
        onSilentFallback: () => assert.fail(),
      }),
      (error: unknown) => error instanceof MockTTSError && error.code === "unsupported",
    );
  });
});
test("미지원 브라우저의 수동 버튼은 명시적 무음 시연을 시작하며 취소할 수 있다", async () => {
  const controller = new AbortController();
  let fallback = false;
  await withWindow({}, async () => {
    const promise = playMockTTS("테스트", {
      signal: controller.signal,
      manual: true,
      onStart: () => assert.fail(),
      onSilentFallback: () => {
        fallback = true;
        queueMicrotask(() => controller.abort());
      },
    });
    await assert.rejects(
      promise,
      (error: unknown) => error instanceof Error && error.name === "AbortError",
    );
  });
  assert.equal(fallback, true);
});
test("상태 해제·초기화의 AbortSignal은 진행 중 음성을 취소한다", async () => {
  let cancels = 0;
  const controller = new AbortController();
  await withWindow(
    {
      SpeechSynthesisUtterance: FakeUtterance,
      speechSynthesis: {
        speak: (utterance: FakeUtterance) =>
          queueMicrotask(() => {
            utterance.onstart?.();
            controller.abort();
          }),
        cancel: () => cancels++,
      },
    },
    async () => {
      await assert.rejects(
        playMockTTS("테스트", {
          signal: controller.signal,
          manual: false,
          onStart: () => {},
          onSilentFallback: () => assert.fail(),
        }),
        (error: unknown) => error instanceof Error && error.name === "AbortError",
      );
    },
  );
  assert.equal(cancels, 1);
});
