import type { ScenarioEventHandler } from "../../domain/notifications.ts";

export const LocalScenario: ScenarioEventHandler = {
  id: "local-approach",
  name: "지역 시뮬레이션",
  createEvent: (community, now = Date.now()) => ({
    post: {
      id: "mock-seongsu-local",
      community,
      category: "지역 정보",
      summary: "성수동 주말 플리마켓 개최 소식",
      evidence: "이용자 제보로 확인됨",
      createdAt: now - 3 * 60_000,
      authorId: "mock-local-driver",
      simulated: true,
    },
    speech: "전방 약 450미터, 성수동에서 주말 플리마켓이 열린다는 지역 소식이 있습니다.",
    distanceMeters: 450,
    source: "지역 제보 수신",
    receivedAt: now,
    simulated: true,
  }),
};
