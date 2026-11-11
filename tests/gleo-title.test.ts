import test from "node:test";
import assert from "node:assert/strict";
import { matchesDemoUtterance, normalizeGleoReport, validateGleoReportTitle, validateReportBody } from "../src/services/reportInput.ts";
import { processReport } from "../src/services/mockCommunity.ts";
import { blackIce, matchesInhaBlackIce } from "../src/scenarios/blackIce.ts";
import { congestion, matchesIncheonCongestion } from "../src/scenarios/congestion.ts";
import { mockConfig } from "../src/domain/types.ts";

test("Gleo 제보에서 호출명·앱 대상·등록 명령만 제거한다", () => {
  assert.equal(normalizeGleoReport("글레오, 가지에 인천대교 막힌다고 제보해줘"), "인천대교 막힌다고");
  assert.equal(normalizeGleoReport("가지에 인천대교 막힌다고"), "인천대교 막힌다고");
  assert.equal(normalizeGleoReport("지금까지 앱의 인천대교 정체를 제보"), "인천대교 정체");
  assert.equal(normalizeGleoReport("GAZEE 앱에 인천대교 정체 제보를 등록해줘"), "인천대교 정체");
  assert.equal(normalizeGleoReport("가제 앱에 제보해줘. 전방 낙하물이 있어요"), "전방 낙하물이 있어요");
});
test("내용 없는 등록 명령을 유효한 제보로 처리하지 않는다", () => {
  assert.equal(validateGleoReportTitle(normalizeGleoReport("글레오, 가지 앱에 제보해줘")), false);
});
test("장소와 상황이 포함된 짧은 제목과 일반 입력을 등록한다", async () => {
  mockConfig.aiDelayMs = 0;
  assert.equal(validateReportBody("인천대교 막힘"), true);
  assert.equal(validateGleoReportTitle("인천대교 막힘"), true);
  const post = await processReport(blackIce, "인천대교 막힘", "nearby", [], false, {source:"voice"});
  assert.equal(post.summary, "인천대교 막힘");
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

test("교통 시연 예시는 Gleo가 첫 문장에서 듣기를 마쳐도 매칭된다", () => {
  assert.ok(matchesDemoUtterance(congestion.exampleInput, congestion.exampleInput));
  assert.ok(matchesDemoUtterance("지금까지 앱에 제보해 줘. 인천대교 진입 지점에서 차가 너무 막혀요.", congestion.exampleInput));
  assert.equal(matchesDemoUtterance("차가 너무 막혀요", congestion.exampleInput), false);
  assert.equal(matchesDemoUtterance("지금 차가 너무 막혀요. 경부고속도로예요.", congestion.exampleInput), false);
  assert.equal(validateGleoReportTitle("지금 차가 너무 막혀요."), false);
});

test("인천대교 고정 발화는 띄어쓰기와 진입 구간 표기가 달라도 같은 시연 제보다", () => {
  assert.ok(matchesIncheonCongestion("지금 가지 앱에 제보해줘. 인천 대교 진입 구간에서는 차가 너무 막혀요.", "인천대교 정체"));
  assert.ok(matchesIncheonCongestion(undefined, "인천대교 진입지점 교통 정체"));
  assert.ok(matchesIncheonCongestion("지금 가지 앱에 제보해 저 인천대교 진입 지점에서 차가 너무 막혀요.", "인천대교 진입 지점에서 차가 너무 막혀요"));
  assert.ok(matchesIncheonCongestion("지금까지 앱에 제보해저인천대교 진입 지점에서 차가 너무 막혀요.", "인천대교 진입 지점에서 차가 너무 막혀요"));
  assert.equal(matchesIncheonCongestion("인천대교 진입지점에서 차가 막히지 않아요.", "인천대교 진입지점 정체"), false);
  assert.equal(matchesIncheonCongestion("인천대로 진입지점에서 차가 너무 막혀요.", "인천대교 진입지점 정체"), false);
});

test("인하대역 블랙아이스 시연은 원본 발화와 실제 GLEO의 짧은 발화를 처리한다", () => {
  assert.ok(matchesInhaBlackIce(blackIce.exampleInput, ""));
  assert.ok(matchesInhaBlackIce("지금까지 앱에 인하대역 3번 출구에 블랙아이스가 있다고 제보해줘.", ""));
  assert.equal(matchesInhaBlackIce("인하대역 3번 출구에 블랙아이스가 없어요.", ""), false);
  assert.equal(matchesInhaBlackIce("인하대역 2번 출구에 블랙아이스가 있어요.", ""), false);
});
