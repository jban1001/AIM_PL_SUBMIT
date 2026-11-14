import type { Scenario } from "../domain/types.ts";
import { conservativeResult, matchesDemoUtterance, normalizeGleoReport, normalizeReportBody } from "../services/reportInput.ts";

export const BLACK_ICE_SUMMARY = "인하대역 3번 출구 방면 1차선 도로 블랙아이스 제보";
export const BLACK_ICE_EVIDENCE = "인하대역 3번 출구 인근을 통과한 차량에서 결빙 위험 신호가 감지돼 블랙아이스가 의심됩니다.";

export function matchesInhaBlackIce(utterance: string | undefined, title: string) {
  const body = utterance || title;
  if (matchesDemoUtterance(body, blackIce.exampleInput)) return true;
  const compact = normalizeGleoReport(body).replace(/^(?:지금|방금|현재)\s+/u, "").replace(/[^\p{L}\p{N}]/gu, "");
  return /^인하대역3번출구(?:쯤|부근|근처|방면|인근)?(?:에|에서)?(?:지금|현재)?블랙아이스(?:가?있(?:어요|다고|습니다)|(?:현상)?발생(?:했어요|했다고)?|의심(?:돼요)?)?(?:제보)?$/u.test(compact);
}

export const blackIce: Scenario = {
  id: "black-ice",
  category: "도로 위험",
  name: "블랙아이스 제보",
  exampleInput:
    "인하대역 3번 출구쯤 블랙아이스 현상 발생해서 차들이 우회하고 있어요. 조심하세요",
  // Fixed demonstration data, not an actual SDK measurement.
  vehicleData: { outsideTemperature: -3, Icy_Road: "결빙 위험", location: "인하대역 3번 출구" },
  simulation: {
    initialView: "normal",
    afterReportView: "normal",
    incomingCount: ({ vehicleData }) => (Number(vehicleData.outsideTemperature) < 0 ? 1 : 0),
  },
  examples: [
    {
      category: "도로 위험",
      summary: BLACK_ICE_SUMMARY,
      evidence: BLACK_ICE_EVIDENCE,
    },
    {
      category: "교통",
      summary: "독배로 인하대역 방면, 차량 흐름이 느려요.\n평소보다 여유 있게 이동하세요.",
      evidence: "독배로 인하대역 방면에서 최근 5분간 평균 주행 속도는 18 km/h였습니다.",
    },
    {
      category: "주차",
      summary: "학익시장 공영주차장, 만차 제보가 있어요.\n주변 주차장도 함께 확인해 주세요.",
      evidence: "",
    },
    {
      category: "지역 정보",
      summary: "인하대역 근처에 늦게까지 여는\n편의점이 있어요.",
      evidence: "",
    },
    {
      category: "도로 위험",
      summary: "안전거리를 충분히 두고 이동해 주세요.\n오늘도 안전한 귀갓길 되세요.",
      evidence: "",
    },
  ],
  process: (body, context) =>
    normalizeReportBody(body) === normalizeReportBody(blackIce.exampleInput)
      ? {
          category: "도로 위험",
          summary: BLACK_ICE_SUMMARY,
          evidence:
            context.vehicleData.Icy_Road === "결빙 위험"
              ? BLACK_ICE_EVIDENCE
              : "",
        }
      : conservativeResult(body),
};
