import type { ScenarioEventHandler } from "../../domain/notifications.ts";

export const TrafficScenario: ScenarioEventHandler = {
  id: "traffic-approach",
  name: "교통 시뮬레이션",
  createEvent: (community, now = Date.now()) => ({
    post: {
      id: "mock-seongsu-traffic",
      community,
      category: "교통",
      summary: "인천대교 진입 구간 교통 정체 제보",
      evidence: "차량 데이터로 관측됨",
      createdAt: now - 3 * 60_000,
      authorId: "mock-traffic-driver",
      simulated: true,
    },
    speech: "전방 약 450미터, 인천대교 진입 구간에 교통 정체 제보가 있습니다.",
    distanceMeters: 450,
    source: "교통 제보 수신",
    receivedAt: now,
    simulated: true,
  }),
};
