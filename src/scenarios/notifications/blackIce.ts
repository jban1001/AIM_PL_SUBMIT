import type { ScenarioEventHandler } from "../../domain/notifications.ts";

// A stable source-post ID, shared across deliveries, is the global TTS dedupe key.
// This fixture contains no sensor, location, backend, or Pleos SDK integration.
export const BlackIceScenario: ScenarioEventHandler = {
  id: "black-ice-approach",
  name: "도로 위험 시뮬레이션",
  createEvent: (community, now = Date.now()) => ({
    post: {
      id: "mock-front-car-seongsu-black-ice",
      community,
      category: "도로 위험",
      summary: "성수대교 진입부 블랙아이스 제보",
      evidence: "차량 데이터로 관측됨",
      createdAt: now - 3 * 60_000,
      authorId: "mock-front-car",
      simulated: true,
    },
    speech: "전방 약 450미터, 성수대교 진입부에 블랙아이스 제보가 있습니다.",
    distanceMeters: 450,
    source: "앞차 제보 수신",
    receivedAt: now,
    simulated: true,
  }),
};
