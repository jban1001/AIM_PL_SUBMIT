import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { listenWithAppMic, REPORT_LISTEN_MS } from "../src/services/appMic.ts";

function setup(t: TestContext) {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  const target = new EventTarget();
  const ids: string[] = [];
  const cancelled: string[] = [];
  const host = Object.assign(target, { GazeeMic: {
    listen(id: string) { ids.push(id); },
    cancel(id: string) { cancelled.push(id); },
  } });
  Object.defineProperty(globalThis, "window", { value: host, configurable: true });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  });
  function emit(phase: string, value = "", id = ids.at(-1)) {
    target.dispatchEvent(new CustomEvent("gazee-mic", { detail: { id, phase, value } }));
  }
  const results: string[] = [];
  const errors: string[] = [];
  const partials: string[] = [];
  const deadlines: number[] = [];
  const callbacks = {
    onResult: (value: string) => results.push(value),
    onError: (value: string) => errors.push(value),
    onPartial: (value: string) => partials.push(value),
    onDeadline: (value: number) => deadlines.push(value),
  };
  return { ids, cancelled, emit, results, errors, partials, deadlines, callbacks };
}

test("문장별 결과를 이어 받고 종료 명령에서만 결과를 한 번 전달한다", (t) => {
  const h = setup(t);
  listenWithAppMic(h.callbacks, { report: true });
  h.emit("ready");
  h.emit("result", "인천대교에서");
  assert.deepEqual(h.results, []);
  t.mock.timers.tick(250);
  h.emit("ready");
  h.emit("partial", "차가 막히고 있어요 제보해줘");
  assert.deepEqual(h.results, [], "중간 결과는 수정될 수 있으므로 등록하지 않는다");
  h.emit("result", "차가 막히고 있어요. 제보 해 줘.");
  h.emit("result", "중복 이벤트");
  assert.deepEqual(h.results, ["인천대교에서 차가 막히고 있어요."]);
  assert.deepEqual(h.errors, []);
  t.mock.timers.tick(REPORT_LISTEN_MS);
  assert.equal(h.ids.length, 2);
  assert.equal(h.results.length, 1);
});

test("SDK가 여러 문장을 끝내도 60초 전체 제한은 다시 시작되지 않는다", (t) => {
  const h = setup(t);
  listenWithAppMic(h.callbacks, { report: true });
  h.emit("ready");
  t.mock.timers.tick(20_000);
  h.emit("result", "인천대교에서");
  t.mock.timers.tick(250);
  h.emit("ready");
  h.emit("partial", "차가 막히고 있어요");
  t.mock.timers.tick(39_749);
  assert.deepEqual(h.errors, []);
  t.mock.timers.tick(1);
  assert.equal(h.errors.length, 1);
  assert.match(h.errors[0], /60초/);
  assert.equal(h.partials.at(-1), "인천대교에서 차가 막히고 있어요");
  assert.deepEqual(h.results, []);
  assert.equal(h.deadlines.length, 1);
  assert.ok(h.cancelled.includes(h.ids.at(-1)!));
});

test("취소 후 늦은 결과나 재시작 타이머가 새 마이크를 열지 않는다", (t) => {
  const h = setup(t);
  const cancel = listenWithAppMic(h.callbacks, { report: true });
  h.emit("ready");
  const oldId = h.ids[0];
  h.emit("result", "인천대교");
  cancel?.();
  h.emit("result", "제보해줘", oldId);
  t.mock.timers.tick(70_000);
  assert.equal(h.ids.length, 1);
  assert.deepEqual(h.results, []);
  assert.deepEqual(h.errors, []);
});

test("비어 있는 쉼은 이어 듣고 실제 SDK 오류는 즉시 중단한다", (t) => {
  const h = setup(t);
  listenWithAppMic(h.callbacks, { report: true });
  h.emit("ready");
  h.emit("idle", "들은 말이 없어요");
  t.mock.timers.tick(250);
  assert.equal(h.ids.length, 2);
  h.emit("error", "Pleos STT 인식 실패 · MIC_ERROR");
  t.mock.timers.tick(1_000);
  assert.deepEqual(h.errors, ["Pleos STT 인식 실패 · MIC_ERROR"]);
  assert.equal(h.ids.length, 2);
});

test("호출어 감지는 한 문장 결과로 즉시 끝나며 종료 단어를 요구하지 않는다", (t) => {
  const h = setup(t);
  listenWithAppMic(h.callbacks);
  h.emit("ready");
  h.emit("result", "제보할게");
  t.mock.timers.tick(60_000);
  assert.deepEqual(h.results, ["제보할게"]);
  assert.equal(h.ids.length, 1);
});

test("종료 명령만 말하면 빈 제보를 등록하지 않는다", (t) => {
  const h = setup(t);
  listenWithAppMic(h.callbacks, { report: true });
  h.emit("ready");
  h.emit("result", "제보해줘.");
  assert.deepEqual(h.results, []);
  assert.match(h.errors[0], /먼저/);
});

test("호출어와 함께 전달된 본문과 종료 명령도 새 마이크 없이 처리한다", (t) => {
  const h = setup(t);
  listenWithAppMic(h.callbacks, { report: true, initialBody: "인천대교 정체 제보해줘." });
  assert.deepEqual(h.results, ["인천대교 정체"]);
  assert.equal(h.ids.length, 0);
});

test("중간에 인용된 종료 문구 뒤에 말이 이어지면 종료하지 않는다", (t) => {
  const h = setup(t);
  listenWithAppMic(h.callbacks, { report: true });
  h.emit("ready");
  h.emit("result", "제보해줘 라는 문구가 안내판에 있어요");
  assert.deepEqual(h.results, []);
  t.mock.timers.tick(250);
  assert.equal(h.ids.length, 2);
});

test("중간 결과 후 긴 쉼에도 입력을 유지하고 종료 명령까지 이어 듣는다", (t) => {
  const h = setup(t);
  listenWithAppMic(h.callbacks, { report: true });
  h.emit("ready");
  h.emit("partial", "인천대교 정체");
  h.emit("idle");
  t.mock.timers.tick(250);
  h.emit("ready");
  t.mock.timers.tick(20_000);
  h.emit("idle");
  t.mock.timers.tick(250);
  h.emit("ready");
  assert.deepEqual(h.errors, []);
  assert.deepEqual(h.results, []);
  h.emit("result", "제보해줘.");
  assert.deepEqual(h.results, ["인천대교 정체"]);
  assert.equal(h.deadlines.length, 1);
});

test("중간 종료 문구만 남고 침묵해도 자동 등록하지 않고 60초에 끝난다", (t) => {
  const h = setup(t);
  listenWithAppMic(h.callbacks, { report: true });
  h.emit("ready");
  h.emit("partial", "인천대교 정체 제보해줘");
  h.emit("idle");
  t.mock.timers.tick(250);
  h.emit("ready");
  t.mock.timers.tick(REPORT_LISTEN_MS - 250);
  assert.deepEqual(h.results, []);
  assert.equal(h.errors.length, 1);
  assert.match(h.errors[0], /60초/);
  assert.equal(h.partials.at(-1), "인천대교 정체 제보해줘");
});
