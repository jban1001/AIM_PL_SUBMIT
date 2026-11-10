import type { Scenario } from "../domain/types.ts";
import { conservativeResult, normalizeReportBody } from "../services/reportInput.ts";

export const blackIce: Scenario = {
  id: "black-ice",
  name: "블랙아이스 제보",
  exampleInput:
    "성수대교 북단 진입로가 얼어 있어요. 차가 살짝 미끄러졌고 도로가 젖은 것처럼 보여요. 조심하세요.",
  vehicleData: { outsideTemperature: -3, tractionControl: "모의 작동", location: "성수대교 북단" },
  simulation: {
    initialView: "normal",
    afterReportView: "normal",
    incomingCount: ({ vehicleData }) => (Number(vehicleData.outsideTemperature) < 0 ? 1 : 0),
  },
  examples: [
    {
      category: "도로 위험",
      summary: "성수대교 북단, 블랙아이스가 의심돼요.\n진입 시 서행해 주세요.",
      evidence: "모의 차량 데이터에서 외기온 −3°C, 미끄럼 방지 장치 작동이 설정되었습니다.",
    },
    {
      category: "교통",
      summary: "강변북로 성수 방면, 차량 흐름이 느려요.\n평소보다 여유 있게 이동하세요.",
      evidence: "모의 주행 속도가 최근 5분간 평균 18km/h로 설정되었습니다.",
    },
    {
      category: "주차",
      summary: "서울숲 공영주차장, 만차 제보가 있어요.\n주변 주차장도 함께 확인해 주세요.",
      evidence: "",
    },
    {
      category: "지역 정보",
      summary: "성수역 인근에 잠시 쉬어갈 수 있는\n24시간 편의시설이 있어요.",
      evidence: "",
    },
    {
      category: "기타",
      summary: "안전거리를 충분히 두고 이동해 주세요.\n오늘도 안전한 귀갓길 되세요.",
      evidence: "",
    },
  ],
  process: (body, context) =>
    normalizeReportBody(body) === normalizeReportBody(blackIce.exampleInput)
      ? {
          category: "도로 위험",
          summary: "성수대교 북단 블랙아이스 의심 제보",
          evidence:
            context.vehicleData.outsideTemperature !== undefined
              ? `시뮬레이션: 외기온 ${context.vehicleData.outsideTemperature}°C, 미끄럼 방지 장치 모의 작동. 실제 차량 관측이 아닙니다.`
              : "",
        }
      : conservativeResult(body),
};
