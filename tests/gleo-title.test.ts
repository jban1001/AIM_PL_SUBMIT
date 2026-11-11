import test from "node:test";
import assert from "node:assert/strict";
import { normalizeGleoReport, validateGleoReportTitle, validateReportBody } from "../src/services/reportInput.ts";
import { processReport } from "../src/services/mockCommunity.ts";
import { blackIce } from "../src/scenarios/blackIce.ts";
import { mockConfig } from "../src/domain/types.ts";

test("Gleo 제보에서 호출명·앱 대상·등록 명령만 제거한다", () => {
  assert.equal(normalizeGleoReport("글레오, 가지에 인천대교 막힌다고 제보해줘"), "인천대교 막힌다고");
  assert.equal(normalizeGleoReport("가지에 인천대교 막힌다고"), "인천대교 막힌다고");
  assert.equal(normalizeGleoReport("GAZEE 앱에 인천대교 정체 제보를 등록해줘"), "인천대교 정체");
  assert.equal(normalizeGleoReport("가제 앱에 제보해줘. 전방 낙하물이 있어요"), "전방 낙하물이 있어요");
});
test("내용 없는 등록 명령을 유효한 제보로 처리하지 않는다", () => {
  assert.equal(validateGleoReportTitle(normalizeGleoReport("글레오, 가지 앱에 제보해줘")), false);
});
test("짧게 요약한 Gleo 제목은 등록하고 원문 입력의 기존 길이 제한은 유지한다", async () => {
  mockConfig.aiDelayMs = 0;
  assert.equal(validateReportBody("인천대교 막힘"), false);
  assert.equal(validateGleoReportTitle("인천대교 막힘"), true);
  const post = await processReport(blackIce, "인천대교 막힘", "nearby", [], false, {gleoTitle:true, source:"voice"});
  assert.equal(post.summary, "인천대교 막힘");
  await assert.rejects(processReport(blackIce, "인천대교 막힘", "nearby", [], false), /어떤 상황/);
});
test("이미 정리한 제목과 도로 이름·부정·불확실성·시간을 보존한다", () => {
  for (const title of ["인천대교 정체 제보", "가지산 진입로는 막히지 않아요", "인천대교에 사고가 난 것 같아요", "어제 인천대교가 막혔지만 지금은 안 막혀요", "전방 우측 차로 통제 해제", "이번 제보는 사고가 아니라 공사예요"]) {
    assert.equal(normalizeGleoReport(title), title);
    assert.equal(normalizeGleoReport(normalizeGleoReport(title)), title);
  }
});
test("Gleo가 정리한 실제 제목을 예시 시나리오 내용으로 바꾸지 않고 저장한다", async () => {
  mockConfig.aiDelayMs = 0;
  const title = normalizeGleoReport("가지 앱에 인천대교 정체 제보");
  const post = await processReport(blackIce, title, "nearby", [], false, {vehicleDataAvailable:false, source:"voice"});
  assert.equal(post.summary, "인천대교 정체 제보");
  assert.equal(post.originalBody, title);
  assert.equal(post.evidence, "");
});
