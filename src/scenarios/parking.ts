import type { Scenario } from "../domain/types.ts";
import { conservativeResult, normalizeReportBody } from "../services/reportInput.ts";

// 주차(충전) 중 상황이므로 주행 제한 OFF에서 터치 작성 + 말로 입력으로 시연합니다.
const exampleInput =
  "주차장 지하 2층에서 충전기를 연결했는데 충전이 시작되지 않네요. 몇 번 시도해도 충전이 진행되지 않아 제보합니다. 이용하실 분들은 참고하세요.";
export const PARKING_SUMMARY = "비룡 주차장 지하 2층 전기차 충전이 안됨 제보";
export function chargingEvidence(batteryLevel: string | number) {
  return "충전 케이블이 연결됐지만 배터리 잔량 " + batteryLevel + "%에서 충전이 시작되지 않았습니다.";
}

export const parking: Scenario = {
  id: "parking",
  category: "주차",
  name: "주차 제보",
  exampleInput,
  simulation: { dictationSpeed: 0.1 },
  vehicleData: {
    location: "비룡 주차장 지하 2층",
    gear: "P",
    chargingCable: "연결됨",
    batteryLevel: 25,
    chargingStatus: "충전 진행 안 됨",
  },
  examples: [{ category: "주차", summary: "용현시장 제3공영주차장에 빈자리가 있어요", evidence: "" }],
  process: (body, context) =>
    normalizeReportBody(body) === normalizeReportBody(exampleInput)
      ? {
          category: "주차",
          summary: PARKING_SUMMARY,
          evidence:
            context.vehicleData.batteryLevel !== undefined
              ? chargingEvidence(context.vehicleData.batteryLevel)
              : "",
        }
      : conservativeResult(body),
};
