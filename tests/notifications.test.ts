import test from "node:test";
import assert from "node:assert/strict";
import {
  compareNotificationPriority,
  emptyNotificationHistory,
  makeFrontDemoPost,
  makeRearNotification,
  recordNotification,
  upsertReceivedPost,
} from "../src/domain/notifications.ts";
import { BLACK_ICE_SUMMARY, BLACK_ICE_EVIDENCE } from "../src/scenarios/blackIce.ts";
import { LocalScenario } from "../src/scenarios/notifications/local.ts";
import { ParkingScenario } from "../src/scenarios/notifications/parking.ts";
import { TrafficScenario } from "../src/scenarios/notifications/traffic.ts";
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
test("블랙아이스 이벤트는 고정 ID, 100m, 3분 전 제보와 정확한 음성 문장을 만든다", () => {
  const event = BlackIceScenario.createEvent("nearby", 1_000_000);
  assert.equal(event.distanceMeters, 100);
  assert.equal(event.post.createdAt, 820_000);
  assert.equal(event.post.summary, BLACK_ICE_SUMMARY);
  assert.equal(event.post.category, "도로 위험");
  assert.equal(event.post.evidence, BLACK_ICE_EVIDENCE);
  assert.equal(event.speech, "전방 약 100미터, 인하대역 3번 출구 방면에 블랙아이스 의심 제보가 있어요. 차량들이 우회하고 있으니 주의해 주세요.");
  assert.equal(event.simulated, true);
  assert.equal(event.post.simulated, true);
  assert.equal(event.post.id, BlackIceScenario.createEvent("destination").post.id);
});
test("앞차 제보 내용과 범주가 달라도 뒤차는 선택된 시나리오의 카드와 대사를 사용한다", () => {
  for (const [scenario, category] of [
    [TrafficScenario, "교통"],
    [BlackIceScenario, "도로 위험"],
    [ParkingScenario, "주차"],
    [LocalScenario, "지역 정보"],
  ] as const) {
    const direct = scenario.createEvent("nearby", 1_000_000);
    assert.equal(direct.post.category, category);
    assert.match(direct.speech, /제보가 있어요\./u);
    const report = {
      ...direct.post,
      id: "front-report",
      category: "기타" as const,
      summary: "강남역 앞 공사 제보",
      evidence: "앞차 제보의 근거",
      description: "앞차 제보의 상세 내용",
    };
    const spoken = { ...report, originalBody: "강남역 앞 공사 제보", authorId: "demo-driver", createdAt: 1_000_000 };
    const front = makeFrontDemoPost(spoken, scenario);
    assert.deepEqual(front, {
      ...spoken,
      category,
      summary: direct.post.summary,
      description: direct.post.description,
      evidence: direct.post.evidence,
    });
    assert.equal(makeFrontDemoPost(spoken, scenario, false).evidence, "");
    assert.equal(makeRearNotification(front, 850, scenario, 1_000_000), null);
    assert.equal(makeRearNotification(report, direct.distanceMeters + 1, scenario, 1_000_000), null);
    const rear = makeRearNotification(front, direct.distanceMeters, scenario, 1_000_000);
    assert.deepEqual(rear, { ...direct, post: { ...direct.post, id: report.id } });
  }
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
      });
      assert.equal(result, "브라우저 TTS");
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
      }),
      (error: unknown) => error instanceof MockTTSError && error.code === "unsupported",
    );
  });
});
test("TTS 미지원 시 수동 재시도도 오류를 반환한다", async () => {
  await withWindow({}, async () => {
    await assert.rejects(playMockTTS("테스트", {
      signal: new AbortController().signal,
      manual: true,
      onStart: () => assert.fail("무음 재생을 성공으로 표시하면 안 된다"),
    }), (error: unknown) => error instanceof MockTTSError && error.code === "unsupported");
  });
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
        }),
        (error: unknown) => error instanceof Error && error.name === "AbortError",
      );
    },
  );
  assert.equal(cancels, 1);
});

test("대기 제보는 도로 위험, 교통 순서이며 같은 범주는 가까운 거리 우선이다", () => {
  const base = BlackIceScenario.createEvent("nearby");
  const parking = { ...base, post: { ...base.post, category: "주차" as const } };
  const traffic = { ...base, post: { ...base.post, category: "교통" as const } };
  const closeHazard = { ...base, distanceMeters: 50 };
  assert.deepEqual([parking, base, traffic, closeHazard].sort(compareNotificationPriority),
    [closeHazard, base, traffic, parking]);
});

function nativeWindow(speak: (id: string, text: string, emit: (phase: string, message?: string) => void) => void) {
  const target = new EventTarget();
  return Object.assign(target, {
    GazeeSpeech: {
      speak(id: string, text: string) {
        speak(id, text, (phase, message = "") => target.dispatchEvent(
          new CustomEvent("gazee-speech", { detail: { id, phase, message } }),
        ));
      },
      cancel() {},
    },
  });
}

test("네이티브 TTS는 대체 엔진 진행 상태와 실제 사용 엔진을 반환한다", async () => {
  const progress: string[] = [];
  const engines: string[] = [];
  const failures: string[] = [];
  const host = nativeWindow((_id, text, emit) => {
    assert.equal(text, "테스트");
    emit("fallback", "ON_DEVICE_ENGINE_ERROR");
    emit("preparing", "Pleos 합성 오류 · ON_DEVICE_ENGINE_ERROR → Android TTS");
    emit("started", "Android TTS · com.reecedunn.espeak");
    emit("done", "Android TTS · com.reecedunn.espeak");
  });
  await withWindow(host, async () => {
    const engine = await playMockTTS("테스트", {
      signal: new AbortController().signal, manual: false,
      onStart: value => engines.push(value), onProgress: value => progress.push(value),
      onFallback: value => failures.push(value),
    });
    assert.equal(engine, "Android TTS · com.reecedunn.espeak");
  });
  assert.equal(progress.length, 1);
  assert.deepEqual(failures, ["ON_DEVICE_ENGINE_ERROR"]);
  assert.deepEqual(engines, ["Android TTS · com.reecedunn.espeak"]);
});

test("재생 시작 없이 완료 이벤트만 받으면 성공으로 처리하지 않는다", async () => {
  await withWindow(nativeWindow((_id, _text, emit) => emit("done")), async () => {
    await assert.rejects(playMockTTS("테스트", {
      signal: new AbortController().signal, manual: false, onStart: () => assert.fail(),
    }), /재생 시작/);
  });
});

test("네이티브 실패 원인을 유지하며 중복 완료 이벤트를 무시한다", async () => {
  const host = nativeWindow((_id, _text, emit) => {
    emit("error", "ON_DEVICE_ENGINE_ERROR / 한국어 음성 데이터 없음");
    emit("done");
  });
  await withWindow(host, async () => {
    await assert.rejects(playMockTTS("테스트", {
      signal: new AbortController().signal, manual: true, onStart: () => assert.fail(),
    }), /ON_DEVICE_ENGINE_ERROR \/ 한국어 음성 데이터 없음/);
  });
});

test("네이티브 취소 도중 들어오는 동기 오류도 한 번만 정리한다", async () => {
  const controller = new AbortController();
  const host = nativeWindow((_id, _text, _emit) => queueMicrotask(() => controller.abort()));
  let cancels = 0;
  host.GazeeSpeech.cancel = () => {
    cancels++;
    host.dispatchEvent(new CustomEvent("gazee-speech", {
      detail: {id: "other", phase: "error", message: "취소됨"},
    }));
  };
  await withWindow(host, async () => {
    await assert.rejects(playMockTTS("테스트", {
      signal: controller.signal, manual: false, onStart: () => assert.fail(),
    }), (error: unknown) => error instanceof Error && error.name === "AbortError");
  });
  assert.equal(cancels, 1);
});
