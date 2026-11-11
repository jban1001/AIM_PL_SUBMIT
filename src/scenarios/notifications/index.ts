import { BlackIceScenario } from "./blackIce.ts";
import { ParkingScenario } from "./parking.ts";
import { TrafficScenario } from "./traffic.ts";
import { LocalScenario } from "./local.ts";
import type { ScenarioEventHandler } from "../../domain/notifications.ts";

// reportMode
// - "voice": 주행 중 '제보할게' 음성 제보 (주행 제한 ON/OFF 모두)
// - "dictation": 글 작성 → 말로 입력 → 받아쓰기 → 등록 자동 시연 (주행 제한 OFF 전용)
export type ReportMode = "voice" | "dictation";
export interface SimulationTab {
  id: string;
  name: string;
  reportScenarioId: string;
  notification: ScenarioEventHandler;
  reportMode: ReportMode;
  // 제보자 시연 속도 배율 (1 = 기본, 0.5 = 절반 속도). 수신 음성 속도는 각 수신 시나리오 파일에서 지정합니다.
  speed?: number;
}
export const DICTATION_REQUIRES_STOPPED = "이 시나리오는 주행 제한 OFF 상태에서 테스트할 수 있습니다.";
export const simulationTabs: SimulationTab[] = [
  { id: "parking", name: "주차", reportScenarioId: "parking", notification: ParkingScenario, reportMode: "dictation", speed: 0.5 },
  { id: "traffic", name: "교통", reportScenarioId: "congestion", notification: TrafficScenario, reportMode: "voice" },
  { id: "local", name: "지역", reportScenarioId: "local", notification: LocalScenario, reportMode: "dictation" },
  { id: "road-hazard", name: "도로 위험", reportScenarioId: "black-ice", notification: BlackIceScenario, reportMode: "voice" },
];

// Extend event rules here; the shared delivery UI never needs scenario branches.
export const notificationScenarios: ScenarioEventHandler[] = [
  ParkingScenario,
  TrafficScenario,
  LocalScenario,
  BlackIceScenario,
];
