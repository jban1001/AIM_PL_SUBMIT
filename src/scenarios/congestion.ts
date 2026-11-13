import type { Scenario } from "../domain/types.ts";
import { conservativeResult, matchesDemoUtterance, normalizeGleoReport } from "../services/reportInput.ts";

export const TRAFFIC_SUMMARY = "인천대교 진입 구간 교통 정체 제보";
export const INCHEON_CONGESTION_DESCRIPTION = "인천대교 진입지점이 지금 막히고 있어요";

export const TRAFFIC_EVIDENCE =
  "차량 데이터 확인 결과, 최근 5분간 평균 주행 속도가 시속 8km로 낮고 정지와 출발이 6회 반복되어 해당 구간의 정체가 확인되었습니다.";

const exampleInput =
  "인천대교 진입 지점에서 차가 너무 막혀요. 조금 움직이다가 다시 멈추는 상황이 반복되고 있어요.";

export function matchesIncheonCongestion(utterance: string | undefined, title: string) {
  const shortReport = normalizeGleoReport(utterance || title)
    .replace(/^(?:지금|방금)\s+/u, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
  // The demo's speech input can shorten 인천대교 to 인천대로.
  if (/^인천(?:대교(?:진입(?:지점|구간))?|대로)(?:에서는|에서|에선|에는|은|는|이|가|에)?(?:지금)?(?:교통)?정체(?:중)?(?:이라고|라고|이에요|예요|입니다|관련)?(?:제보)?$/u.test(shortReport)) {
    return true;
  }

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
  simulation: { dictationSpeed: 0.1 },
  vehicleData: {
    averageSpeed: 8,
    stops: 6,
    observation: "모의 저속·반복 정지",
    location: "인천대교 진입 구간",
  },
  examples: [
    {
      category: "교통",
      summary: "인하대 정문 앞 인하로, 퇴근길 정체 제보",
      evidence:
        "시뮬레이션: 저속 주행과 반복적인 정지가 설정되었습니다. 실제 차량 관측이 아닙니다.",
    },
    { category: "도로 위험", summary: "학익동 이면도로, 그늘진 구간 결빙 의심 제보", evidence: "" },
    { category: "주차", summary: "용현시장 제1공영주차장 만차 제보", evidence: "" },
    { category: "지역 정보", summary: "인하대 후문 근처, 늦게까지 여는 편의점 안내", evidence: "" },
    { category: "기타", summary: "용현시장 입구, 물건 내리는 차량이 있어요", evidence: "" },
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
