import { BlackIceScenario } from "./blackIce.ts";
import { ParkingScenario } from "./parking.ts";
import { TrafficScenario } from "./traffic.ts";
import { LocalScenario } from "./local.ts";
import type { ScenarioEventHandler } from "../../domain/notifications.ts";
import { blackIce, matchesInhaBlackIce } from "../blackIce.ts";
import { congestion, matchesIncheonCongestion } from "../congestion.ts";
import { parking } from "../parking.ts";
import { local } from "../local.ts";
import { matchesDemoUtterance, normalizeGleoReport } from "../../services/reportInput.ts";

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
  gleoExample?: string;
}
export const DICTATION_REQUIRES_STOPPED = "이 시나리오는 주행 제한 OFF 상태에서 테스트할 수 있습니다.";
export const simulationTabs: SimulationTab[] = [
  { id: "parking", name: "주차", reportScenarioId: "parking", notification: ParkingScenario, reportMode: "dictation", speed: 0.5 },
  { id: "traffic", name: "교통", reportScenarioId: "congestion", notification: TrafficScenario, reportMode: "voice", speed: 0.5, gleoExample: `지금 가지 앱에 제보해 줘. ${congestion.exampleInput}` },
  { id: "local", name: "지역", reportScenarioId: "local", notification: LocalScenario, reportMode: "dictation", speed: 0.5 },
  { id: "road-hazard", name: "도로 위험", reportScenarioId: "black-ice", notification: BlackIceScenario, reportMode: "voice", speed: 0.5, gleoExample: `지금 가지 앱에 제보해 줘. ${blackIce.exampleInput}` },
];

export function matchReportSimulation(body: string, utterance?: string) {
  const speech = (utterance || body).replace(
    /(?:[\s,.!?。！？…]*(?:제\s*보|[재제]\s*고|내\s*보\s*호|제\s*오)\s*해\s*줘(?:요)?)+[\s,.!?。！？…]*$/u,
    "",
  );
  const spoken = normalizeGleoReport(speech)
    .replace(/^(?:지금|방금|현재)\s+/u, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
  if (!spoken) return undefined;

  if (matchesIncheonCongestion(utterance ? speech : undefined, utterance ? body : speech)
      || /^인천대교진입(?:지점|구간)(?:에서는|에서|에선)?(?:지금|현재)?차가(?:너무)?막혀요/u.test(spoken)) return congestion;
  if (matchesInhaBlackIce(speech, "")
      || /^인하대역3번출구(?:쯤|부근|근처|방면|인근)?(?:에서|에)?블랙아이스현상발생해서/u.test(spoken)) return blackIce;

  if (/^비룡주차장(?:지하2층)?(?:에서|에|의)?(?:전기차)?충전(?:기(?:가|는)?|이|은)?(?:안(?:돼요|되네요|됩니다|됨|된다고)|(?:진행|시작)되지않(?:아요|네요|습니다)|(?:오류|고장)(?:이에요|났어요)?)(?:제보)?$/u.test(spoken)) return parking;
  if (/^미추홀구청(?:근처|인근|주변)(?:에|에서|의)?(?:괜찮은|맛있는)?국밥집(?:추천(?:해요|합니다)?|이?있어요)(?:제보)?$/u.test(spoken)) return local;

  return [parking, local].find((scenario) => {
    if (matchesDemoUtterance(speech, scenario.exampleInput)) return true;
    const opening = scenario.exampleInput.split(/[.!?。！？]/u, 1)[0].replace(/[^\p{L}\p{N}]/gu, "");
    return spoken.startsWith(opening);
  });
}

// Extend event rules here; the shared delivery UI never needs scenario branches.
export const notificationScenarios: ScenarioEventHandler[] = [
  ParkingScenario,
  TrafficScenario,
  LocalScenario,
  BlackIceScenario,
];
