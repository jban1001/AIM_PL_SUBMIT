import type { Scenario } from "../domain/types.ts";
import { conservativeResult, normalizeReportBody } from "../services/reportInput.ts";

// 상황: 운전자 A가 국밥집에서 식사를 마치고 주차된 차로 돌아와 제보합니다.
// 정차(P) 상황이므로 주행 제한 OFF에서 터치 작성 + 말로 입력으로 시연합니다.
// GPS 값은 이후 내 차 중심/내 목적지 중심 매칭에 쓸 Mock 좌표이며 근거로 표시하지 않습니다.
const exampleInput =
  "인하대학교에 볼일이 있어서 들렀는데 인하IC에서 미추홀 구청으로 가는 길에 괜찮은 국밥집이 있네. 미추홀 구청 방문하는 사람들이 한번 쯤 가면 좋을 것 같아.";
export const LOCAL_SUMMARY = "미추홀 구청 근처 국밥집 추천 제보";
export const local: Scenario = {
  id: "local",
  name: "지역 제보",
  exampleInput,
  vehicleData: {
    location: "인천 미추홀구 (모의 GPS)",
    latitude: 37.4636,
    longitude: 126.6503,
    gear: "P",
  },
  examples: [
    { category: "지역 정보", summary: LOCAL_SUMMARY, evidence: "" },
    { category: "지역 정보", summary: "인하대 후문 제육볶음 맛집 추천", evidence: "" },
    { category: "지역 정보", summary: "용현시장 안 분식집 떡볶이 추천", evidence: "" },
    { category: "지역 정보", summary: "인하대역 근처 늦게까지 여는 김밥집", evidence: "" },
    { category: "지역 정보", summary: "학익동 칼국수집 점심 웨이팅 짧아요", evidence: "" },
  ],
  process: (body) =>
    normalizeReportBody(body) === normalizeReportBody(exampleInput)
      ? {
          category: "지역 정보",
          summary: LOCAL_SUMMARY,
          // 맛집 추천은 차량 데이터로 확인할 수 없으므로 근거를 비웁니다.
          evidence: "",
        }
      : conservativeResult(body),
};
