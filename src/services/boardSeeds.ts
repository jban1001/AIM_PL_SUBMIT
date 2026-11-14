import { scenarios } from "../scenarios/index.ts";
import type { AIResult, Category, CommunityId, Scenario } from "../domain/types.ts";

// Fixed navigation demo: Incheon → Gyeyang-gu → Gimpo International Airport.
// These reports are simulated, not live traffic or parking information.
export const navigationDestination = "김포국제공항";

const destinationExamples: AIResult[] = [
  { category: "주차", summary: "국내선 제1주차장 입구에 대기 줄이 생겼어요", evidence: "" },
  { category: "교통", summary: "송정역 사거리, 우회전 신호 두 번 기다렸어요", evidence: "" },
  { category: "도로 위험", summary: "국제선 진입로 합류 지점, 갑자기 끼어드는 차 조심하세요", evidence: "" },
  { category: "지역 정보", summary: "롯데몰 지하에서 점심 먹고 왔어요. 혼밥하기 괜찮네요", evidence: "" },
  { category: "주차", summary: "국제선 주차장에 방금 빈자리 몇 군데 보였어요", evidence: "" },
  { category: "교통", summary: "국내선 출발층 앞에서 캐리어 내리는 차가 많네요", evidence: "" },
  { category: "교통", summary: "공항시장역 쪽 골목, 배달 차량 때문에 잠깐 밀려요", evidence: "" },
  { category: "지역 정보", summary: "송정역 근처에서 따뜻한 국수 먹을 곳 찾았어요", evidence: "" },
  { category: "주차", summary: "롯데몰 주차장 내려가는 길은 지금 여유 있어요", evidence: "" },
  { category: "도로 위험", summary: "방화동 골목길에 보행자가 많아요. 천천히 지나가세요", evidence: "" },
  { category: "지역 정보", summary: "마중 나오신 분들, 국내선인지 국제선인지 먼저 확인하세요", evidence: "" },
  { category: "지역 정보", summary: "김포국제공항 전망 보러 왔는데 아이가 좋아하네요", evidence: "" },
  { category: "교통", summary: "국내선 도착층 앞, 마중 차량이 길게 서 있어요", evidence: "" },
  { category: "주차", summary: "공항시장 주변은 빈자리 찾기가 쉽지 않네요", evidence: "" },
  { category: "도로 위험", summary: "주차장 출구 횡단보도에 여행객이 많아요", evidence: "" },
  { category: "지역 정보", summary: "비행기 기다리면서 롯데몰에서 커피 한 잔 하기 좋아요", evidence: "" },
  { category: "지역 정보", summary: "국제선 앞에서 일행 기다리는 중인데 바람이 꽤 차네요", evidence: "" },
  { category: "교통", summary: "공항 입구에서 터미널 갈림길까지 서행 중이에요", evidence: "" },
  { category: "지역 정보", summary: "송정역 주변 빵집에서 간단히 아침 해결했어요", evidence: "" },
  { category: "주차", summary: "국내선 주차장 출구 정산 줄이 조금 길어요", evidence: "" },
];

const directionExamples: AIResult[] = [
  { category: "교통", summary: "계양대로 작전역 지나는 쪽, 신호 대기 줄이 길어요", evidence: "" },
  { category: "도로 위험", summary: "봉오대로 우측 차로에 상자가 떨어져 있어요", evidence: "" },
  { category: "교통", summary: "봉오대로 부천 방향, 교차로 하나 지나는 데 오래 걸리네요", evidence: "" },
  { category: "도로 위험", summary: "공항로 합류 구간에서 급하게 차선 바꾸는 차가 있어요", evidence: "" },
  { category: "지역 정보", summary: "작전역 근처에서 포장 커피 사서 출발했어요", evidence: "" },
  { category: "주차", summary: "계양대로 주변에 잠깐 쉬어 갈 주차 공간 찾았어요", evidence: "" },
  { category: "교통", summary: "공항로에 구급차 지나갑니다. 길 비워 주세요", evidence: "" },
  { category: "교통", summary: "고강동 지나 공항 가는 쪽, 아까보다 흐름이 좋아졌어요", evidence: "" },
  { category: "도로 위험", summary: "효성동 지나는 구간, 공사 차량이 천천히 진입하고 있어요", evidence: "" },
  { category: "교통", summary: "작전동 교차로 좌회전 대기 줄이 길게 늘어섰어요", evidence: "" },
  { category: "지역 정보", summary: "봉오대로 타기 전에 주유하고 가기 괜찮네요", evidence: "" },
  { category: "주차", summary: "고강동에서 잠시 쉬었다 갈 만한 주차장 있나요?", evidence: "" },
  { category: "도로 위험", summary: "오정동 지나는 길에 물 고인 구간 있어요. 감속하세요", evidence: "" },
  { category: "교통", summary: "봉오대로 합류 지점만 지나니 다시 잘 움직여요", evidence: "" },
  { category: "도로 위험", summary: "부천 구간 지나시는 분들, 화물차와 간격 충분히 두세요", evidence: "" },
  { category: "지역 정보", summary: "효성동에서 간단히 김밥 포장했어요. 이동 전에 먹고 갑니다", evidence: "" },
  { category: "교통", summary: "김포국제공항 방면, 터미널 갈림길 앞부터 속도가 줄어요", evidence: "" },
  { category: "도로 위험", summary: "공항로 버스 정차 구간, 앞차가 갑자기 멈춰요", evidence: "" },
  { category: "주차", summary: "작전동 공영주차장에서 동승자 기다리고 있어요", evidence: "" },
  { category: "도로 위험", summary: "공항 가는 길에 비가 조금씩 내려요. 안전운전하세요", evidence: "" },
];

function interleaveCategories(examples: AIResult[]): AIResult[] {
  const groups = new Map<Category, AIResult[]>();
  for (const post of examples) {
    const group = groups.get(post.category) ?? [];
    group.push(post);
    groups.set(post.category, group);
  }

  const mixed: AIResult[] = [];
  for (let index = 0; mixed.length < examples.length; index++) {
    for (const group of groups.values()) {
      const post = group[index];
      if (post) mixed.push(post);
    }
  }
  return mixed;
}

export const boardSeeds: Record<CommunityId, Scenario> = {
  nearby: {
    ...scenarios[0],
    id: "board-nearby",
    examples: interleaveCategories(scenarios.flatMap((scenario) => scenario.examples)),
  },
  destination: {
    ...scenarios[0],
    id: "board-destination",
    examples: interleaveCategories(destinationExamples),
  },
  direction: {
    ...scenarios[0],
    id: "board-direction",
    examples: interleaveCategories(directionExamples),
  },
};
