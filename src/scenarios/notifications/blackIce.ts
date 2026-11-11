import type { ScenarioEventHandler } from "../../domain/notifications.ts";
import { blackIce, BLACK_ICE_SUMMARY, BLACK_ICE_EVIDENCE } from "../blackIce.ts";

// A stable source-post ID, shared across deliveries, is the global TTS dedupe key.
// This fixture contains no sensor, location, backend, or Pleos SDK integration.
export const BlackIceScenario: ScenarioEventHandler = {
  id: "black-ice-approach",
  name: "도로 위험 시뮬레이션",
  createEvent: (community, now = Date.now()) => ({
    post: {
      id: "mock-front-car-inha-black-ice",
      community,
      category: blackIce.category,
      summary: BLACK_ICE_SUMMARY,
      evidence: BLACK_ICE_EVIDENCE,
      createdAt: now - 3 * 60_000,
      authorId: "mock-front-car",
      simulated: true,
    },
    speech: "전방 약 100미터, 인하대역 3번 출구 방면에 블랙아이스 의심 제보가 있어요. 차량들이 우회하고 있으니 주의해 주세요.",
    speechRate: 0.95 * 0.5,
    distanceMeters: 100,
    source: "앞차 제보 수신",
    receivedAt: now,
    simulated: true,
  }),
};
