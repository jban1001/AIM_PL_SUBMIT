import type { ScenarioEventHandler } from "../../domain/notifications.ts";
import { chargingEvidence, parking } from "../parking.ts";

export const ParkingScenario: ScenarioEventHandler = {
  id: "parking-approach",
  name: "주차 시뮬레이션",
  createEvent: (community, now = Date.now()) => ({
    post: {
      id: "mock-biryong-parking-ev-charging",
      community,
      category: parking.category,
      summary: "비룡 주차장 지하 2층 전기차 충전이 안됨 제보",
      evidence: chargingEvidence(parking.vehicleData.batteryLevel),
      createdAt: now - 3 * 60_000,
      authorId: "mock-parking-driver",
      simulated: true,
    },
    speech: "전방 약 450미터, 비룡 주차장 지하 2층 전기차 충전기가 작동하지 않는다는 제보가 있어요.",
    distanceMeters: 450,
    // 시연용 0.5배속 (기본 0.95의 절반)
    speechRate: 0.95 * 0.5,
    source: "주차 제보 수신",
    receivedAt: now,
    simulated: true,
  }),
};
