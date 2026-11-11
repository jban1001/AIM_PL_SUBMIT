import type { Scenario } from "../domain/types.ts";
import { conservativeResult, normalizeReportBody } from "../services/reportInput.ts";

// 주차(충전) 중 상황이므로 주행 제한 OFF에서 터치 작성 + 말로 입력으로 시연합니다.
const exampleInput =
  "주차장 지하 2층에서 충전기를 연결했는데 충전이 시작되지 않네요. 몇 번 시도해도 충전이 진행되지 않아 제보합니다. 이용하실 분들은 참고하세요.";
export const PARKING_SUMMARY = "비룡 주차장 지하 2층 전기차 충전이 안됨 제보";
export const parking: Scenario = {
  id: "parking",
  category: "주차",
  name: "주차 제보",
  exampleInput,
  vehicleData: {
    location: "비룡 주차장 지하 2층",
    gear: "P",
    chargingCable: "연결됨",
    batteryLevel: 25,
    chargingStatus: "충전 진행 안 됨",
  },
  examples: [{ category: "주차", summary: "성수 공영주차장 여유 공간 제보", evidence: "" }],
  process: (body, context) =>
    normalizeReportBody(body) === normalizeReportBody(exampleInput)
      ? {
          category: "주차",
          summary: PARKING_SUMMARY,
          evidence:
            context.vehicleData.batteryLevel !== undefined
              ? `시뮬레이션: 차량 데이터 확인 결과, 충전 케이블이 연결된 상태이며 배터리 잔량은 ${context.vehicleData.batteryLevel}%이지만, 현재 충전이 진행되지 않는 것으로 확인되었습니다.`
              : "",
        }
      : conservativeResult(body),
};
