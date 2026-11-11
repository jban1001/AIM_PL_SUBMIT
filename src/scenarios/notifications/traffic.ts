import type { ScenarioEventHandler } from "../../domain/notifications.ts";
import { congestion, INCHEON_CONGESTION_DESCRIPTION, TRAFFIC_EVIDENCE, TRAFFIC_SUMMARY } from "../congestion.ts";

export const TrafficScenario: ScenarioEventHandler = {
  id: "traffic-approach",
  name: "교통 시뮬레이션",
  createEvent: (community, now = Date.now()) => ({
    post: {
      id: "mock-seongsu-traffic",
      community,
      category: congestion.category,
      summary: TRAFFIC_SUMMARY,
      description: INCHEON_CONGESTION_DESCRIPTION,
      evidence: TRAFFIC_EVIDENCE,
      createdAt: now - 3 * 60_000,
      authorId: "mock-traffic-driver",
      simulated: true,
    },
    speech: "전방 약 450미터, 인천대교 진입 구간에 교통 정체 제보가 있어요.",
    distanceMeters: 450,
    source: "교통 제보 수신",
    receivedAt: now,
    simulated: true,
  }),
};
