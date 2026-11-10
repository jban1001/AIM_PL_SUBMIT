import type { ScenarioEventHandler } from "../../domain/notifications.ts";

export const ParkingScenario: ScenarioEventHandler = {
  id: "parking-approach",
  name: "주차 시뮬레이션",
  createEvent: (community, now = Date.now()) => ({
    post: {
      id: "mock-seongsu-parking",
      community,
      category: "주차",
      summary: "성수 공영주차장 여유 공간 제보",
      evidence: "이용자 제보로 확인됨",
      createdAt: now - 3 * 60_000,
      authorId: "mock-parking-driver",
      simulated: true,
    },
    speech: "전방 약 450미터, 성수 공영주차장에 여유 공간이 있다는 제보가 있습니다.",
    distanceMeters: 450,
    source: "주차 제보 수신",
    receivedAt: now,
    simulated: true,
  }),
};
