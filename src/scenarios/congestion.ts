import type { Scenario } from "../domain/types.ts";
import { conservativeResult, matchesDemoUtterance, normalizeGleoReport } from "../services/reportInput.ts";

export const TRAFFIC_SUMMARY = "인천대교 진입 구간 교통 정체 제보";
export const INCHEON_CONGESTION_DESCRIPTION = "인천대교 진입지점이 지금 막히고 있어요";

export const TRAFFIC_EVIDENCE =
  "차량 데이터 확인 결과, 최근 5분간 평균 주행 속도가 시속 8km로 낮고 정지와 출발이 6회 반복되어 해당 구간의 정체가 확인되었습니다.";

const exampleInput =
  "인천대교 진입 지점에서 차가 너무 막혀요. 조금 움직이다가 다시 멈추는 상황이 반복되고 있어요.";

export function matchesIncheonCongestion(utterance: string | undefined, title: string) {
  if (utterance) {
    const normalized = utterance.replace(/진입\s*(?:지점|구간)\s*(?:에서는|에서|에선)(?:\s*지금)?/gu, "진입지점에서");
    return matchesDemoUtterance(normalized, exampleInput);
  }
  const compactTitle = normalizeGleoReport(title).replace(/[\s.!?。]+/gu, "");
  return /^인천대교진입(?:지점|구간)(?:에|에서|은|이)?(?:교통)?(?:정체|막힘)(?:관련)?(?:제보)?$/u.test(compactTitle)
    || matchesDemoUtterance(title, exampleInput);
}

export const congestion: Scenario = {
  id: "congestion",
  category: "교통",
  name: "도로 정체 제보",
  exampleInput,
  vehicleData: {
    averageSpeed: 8,
    stops: 6,
    observation: "모의 저속·반복 정지",
    location: "인천대교 진입 구간",
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
    matchesIncheonCongestion(body, "")
      ? {
          summary: TRAFFIC_SUMMARY,
          description: INCHEON_CONGESTION_DESCRIPTION,
          category: "교통",
          evidence: context.vehicleData.averageSpeed !== undefined ? TRAFFIC_EVIDENCE : "",
        }
      : conservativeResult(body),
};
