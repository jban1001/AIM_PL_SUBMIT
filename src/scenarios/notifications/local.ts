import type { ScenarioEventHandler } from "../../domain/notifications.ts";
import { LOCAL_SUMMARY } from "../local.ts";

// 운전자 A의 국밥집 제보를, 미추홀 구청에 가는 운전자 B가 근처 맛집을 요청했을 때 받는 상황입니다.
// 음성은 제보 원문을 다시 정리한 문장이며 원문에 없는 내용은 넣지 않습니다.
export const LocalScenario: ScenarioEventHandler = {
  id: "local-approach",
  name: "지역 시뮬레이션",
  createEvent: (community, now = Date.now()) => ({
    post: {
      id: "mock-michuhol-gukbap",
      community,
      category: "지역 정보",
      summary: LOCAL_SUMMARY,
      // 근거가 비어 있으면 카드의 판단 근거 영역이 숨겨집니다.
      evidence: "",
      createdAt: now - 3 * 60_000,
      authorId: "mock-local-driver",
      simulated: true,
    },
    speech:
      "미추홀 구청 근처 맛집 제보가 있어요. 인하IC에서 미추홀 구청으로 가는 길에 괜찮은 국밥집이 있다고 해요. 구청에 들르신다면 한번 가 보셔도 좋겠어요.",
    distanceMeters: 450,
    source: "지역 제보 수신",
    receivedAt: now,
    simulated: true,
  }),
};
