import assert from "node:assert/strict";
import test from "node:test";
import { reportInputError } from "../src/services/reportInput.ts";
import { processReport } from "../src/services/mockCommunity.ts";
import { blackIce } from "../src/scenarios/blackIce.ts";

test("상황만 있거나 장소만 있는 제보는 처리에 들어가지 않는다", async () => {
  let calls = 0;
  for (const [body, message] of [
    ["막히고 있음", /어느 도로나 장소/],
    ["인천대교", /어떤 상황/],
    ["여기 주차장 만차", /어느 도로나 장소/],
    ["사고로 차량이 막혀요", /어느 도로나 장소/],
  ] as const) {
    await assert.rejects(processReport(blackIce, body, "nearby", [], false, {
      onRequest: () => calls++,
      aiDelayMs: 0,
    }), message);
  }
  assert.equal(calls, 0);
});

test("Gleo가 빠진 정보에 빈 값이나 같은 장소를 보내도 등록하지 않는다", async () => {
  for (const [body, details, missing] of [
    ["막히고 있음", { location: "", condition: "막히고 있음" }, "location"],
    ["인천대교", { location: "인천대교", condition: "" }, "condition"],
    ["인천대교 제보", { location: "인천대교", condition: "인천대교" }, "condition"],
    ["여기 막힘", { location: "여기", condition: "막힘" }, "location"],
    ["지금 가지에 차가 막히고 있다고 제보", { location: "가지", condition: "차가 막히고 있다고 제보" }, "location"],
    ["인천대교 정체", { location: "인천대교", condition: "정체", utterance: "지금 가지 앱에 인천대교를 제보해 줘" }, "condition"],
    ["인천대교 정체", { location: "인천대교", condition: "정체", utterance: "지금 가지 앱에 차가 막힌다고 제보해 줘" }, "location"],
  ] as const) {
    assert.equal(reportInputError(body, details)?.missing, missing);
    await assert.rejects(processReport(blackIce, body, "nearby", [], false, {
      reportDetails: details,
      aiDelayMs: 0,
    }));
  }
});

test("장소와 상황이 갖춰지면 Gleo 제목과 일반 본문 모두 등록할 수 있다", async () => {
  const report = await processReport(blackIce, "인천대교 정체", "nearby", [], false, {
    reportDetails: { location: "인천대교", condition: "교통 정체", utterance: "지금 가지 앱에 인천대교 정체를 제보해 줘" },
    aiDelayMs: 0,
  });
  assert.equal(report.summary, "인천대교 정체");
  assert.equal(reportInputError("인천대교에서 차가 막히고 있어요"), null);
  assert.equal(reportInputError("비룡 주차장 지하 2층에서 충전이 시작되지 않아요"), null);
  assert.equal(reportInputError("미추홀 구청 근처 국밥집이 괜찮아요"), null);
});
