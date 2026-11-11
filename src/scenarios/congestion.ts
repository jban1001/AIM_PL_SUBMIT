import type { Scenario } from "../domain/types.ts";
import { conservativeResult, normalizeReportBody } from "../services/reportInput.ts";

const exampleInput =
  "지금 인천대로 진입 지점에서 차가 너무 막혀요. 조금 움직이다가 다시 멈추는 상황이 반복되고 있어요.";
export const congestion: Scenario = {
  id: "congestion",
  name: "도로 정체 제보",
  exampleInput,
  vehicleData: {
    averageSpeed: 8,
    stops: 6,
    observation: "모의 저속·반복 정지",
    location: "강변북로 성수 방면",
  },
  examples: [
    {
      category: "교통",
      summary: "강변북로 성수 방면, 정체 관련 제보",
      evidence:
        "시뮬레이션: 저속 주행과 반복적인 정지가 설정되었습니다. 실제 차량 관측이 아닙니다.",
    },
    { category: "도로 위험", summary: "성수대교 북단, 블랙아이스 의심 제보", evidence: "" },
    { category: "주차", summary: "서울숲 공영주차장 만차 관련 제보", evidence: "" },
    { category: "지역 정보", summary: "성수역 주변 24시간 편의시설 안내", evidence: "" },
    { category: "기타", summary: "한강공원 진입로 주변 상황 제보", evidence: "" },
  ],
  process: (body, context) =>
    normalizeReportBody(body) === normalizeReportBody(exampleInput)
      ? {
          summary:
            typeof context.vehicleData.location === "string" && context.vehicleData.location.trim()
              ? `${context.vehicleData.location.trim()} 정체 관련 제보`
              : "정체 관련 제보",
          category: "교통",
          evidence:
            context.vehicleData.averageSpeed !== undefined
              ? "시뮬레이션: 제보 차량의 저속 주행과 반복적인 정지가 설정되었습니다. 실제 차량 관측이 아닙니다."
              : "",
        }
      : conservativeResult(body),
};
