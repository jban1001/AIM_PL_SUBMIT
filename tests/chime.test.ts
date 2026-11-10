import test from "node:test";
import assert from "node:assert/strict";
import { playNotificationChime, NotificationChimeError } from "../src/services/notificationChime.ts";

async function withHost(host: unknown, run: () => Promise<void>) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {value: host, configurable: true});
  try { await run(); } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  }
}
function host(play: (id: string, emit: (phase: string, message?: string, otherId?: string) => void) => void) {
  const target = new EventTarget();
  let cancels = 0;
  return Object.assign(target, {
    GazeeChime: {
      play(id: string) { play(id, (phase, message = "", otherId = id) => target.dispatchEvent(
        new CustomEvent("gazee-chime", {detail: {id: otherId, phase, message}}),
      )); },
      cancel() { cancels++; },
    },
    GazeeSpeech: {speak() { assert.fail("수신 알림에 TTS를 사용하면 안 된다"); }},
    speechSynthesis: {speak() { assert.fail("브라우저에서도 제보를 자동 낭독하면 안 된다"); }},
    getCancels: () => cancels,
  });
}
test("알림음은 TTS 호출 없이 실제 네이티브 시작·완료를 기다린다", async () => {
  let starts = 0;
  await withHost(host((_id, emit) => {
    emit("error", "다른 요청의 오류", "unrelated");
    emit("started"); emit("done"); emit("done");
  }), async () => {
    assert.equal(await playNotificationChime({signal: new AbortController().signal, onStart: () => starts++}), "Android AudioTrack");
  });
  assert.equal(starts, 1);
});
test("알림음 시작 없는 완료 이벤트는 성공으로 표시하지 않는다", async () => {
  await withHost(host((_id, emit) => emit("done")), async () => {
    await assert.rejects(playNotificationChime({signal: new AbortController().signal, onStart() {assert.fail();}}), /재생 시작/);
  });
});
test("오디오 포커스 거절은 오류 원인을 보존하며 다음 요청으로 재시도할 수 있다", async () => {
  let attempts = 0;
  await withHost(host((_id, emit) => {
    if (++attempts === 1) emit("error", "차량 오디오 사용을 허용받지 못했어요.");
    else { emit("started"); emit("done"); }
  }), async () => {
    const options = {signal: new AbortController().signal, onStart() {}};
    await assert.rejects(playNotificationChime(options), /차량 오디오/);
    assert.equal(await playNotificationChime(options), "Android AudioTrack");
  });
});
test("활성 알림음 취소는 네이티브 취소를 보내고 늦은 완료를 무시한다", async () => {
  const controller = new AbortController();
  const value = host((_id, emit) => { emit("started"); queueMicrotask(() => {controller.abort(); emit("done");}); });
  await withHost(value, async () => {
    await assert.rejects(playNotificationChime({signal: controller.signal, onStart() {}}), {name: "AbortError"});
  });
  assert.equal(value.getCancels(), 1);
});
test("알림음 미지원은 실패이며 TTS 대체 낭독이나 무음 성공을 만들지 않는다", async () => {
  await withHost({speechSynthesis: {speak() {assert.fail();}}}, async () => {
    await assert.rejects(playNotificationChime({signal: new AbortController().signal, onStart() {assert.fail();}}),
      (error: unknown) => error instanceof NotificationChimeError && error.code === "unsupported");
  });
});
