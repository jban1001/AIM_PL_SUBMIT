import type { ScenarioEventHandler } from "../../domain/notifications.ts";

// 수신 카드 아래에 "차량 근거는 시연용 Mock 데이터" 안내가 함께 표시됩니다.
export const ParkingScenario: ScenarioEventHandler = {
  id: "parking-approach",
  name: "주차 시뮬레이션",
  createEvent: (community, now = Date.now()) => ({
    post: {
      id: "mock-biryong-parking-ev-charging",
      community,
      category: "주차",
      summary: "비룡 주차장 지하 2층 전기차 충전이 안됨 제보",
      evidence:
        "차량 데이터 확인 결과, 충전 케이블이 연결된 상태이며 배터리 잔량은 25%이지만, 현재 충전이 진행되지 않는 것으로 확인되었습니다.",
      createdAt: now - 3 * 60_000,
      authorId: "mock-parking-driver",
      simulated: true,
    },
    speech: "전방 약 450미터, 비룡 주차장 지하 2층 전기차 충전기가 작동하지 않는다는 제보가 있습니다.",
    distanceMeters: 450,
    // 시연용 0.5배속 (기본 0.95의 절반)
    speechRate: 0.95 * 0.5,
    source: "주차 제보 수신",
    receivedAt: now,
    simulated: true,
  }),
};
