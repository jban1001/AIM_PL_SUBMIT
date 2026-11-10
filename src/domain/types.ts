export type CommunityId = "nearby" | "direction" | "destination";
export type Category = "교통" | "도로 위험" | "주차" | "지역 정보" | "기타";
export type FeedView = "normal" | "empty" | "loading";
export type VehicleState = "parked" | "stopped" | "driving";
export type InputMode = "touch" | "voice";
export type SpeechFault = "none" | "stt" | "insufficient";
export const CURRENT_USER_ID = "demo-driver";
export interface Post {
  id: string;
  community: CommunityId;
  category: Category;
  summary: string;
  evidence: string;
  createdAt: number;
  simulated: true;
  authorId?: string;
  source?: InputMode;
  originalBody?: string;
}
export interface AIResult {
  summary: string;
  evidence: string;
  category: Category;
}
export interface Scenario {
  id: string;
  name: string;
  exampleInput: string;
  vehicleData: Record<string, string | number>;
  examples: AIResult[];
  simulation?: {
    initialView?: FeedView;
    afterReportView?: FeedView;
    failFirstReport?: boolean;
    initialPendingCount?: number;
    incomingCount?: (context: {
      community: CommunityId;
      posts: Post[];
      vehicleData: Record<string, string | number>;
    }) => number;
  };
  process: (
    body: string,
    context: { vehicleData: Record<string, string | number>; similarPosts: Post[] },
  ) => AIResult;
}
export const communities: {
  id: CommunityId;
  name: string;
  subtitle: string;
  description: string;
  icon: "pin" | "route" | "flag";
}[] = [
  {
    id: "nearby",
    name: "내 차 중심",
    subtitle: "현재 차량 주변 10km",
    description: "현재 위치에서 10km 이내의 지역 커뮤니티입니다.",
    icon: "pin",
  },
  {
    id: "destination",
    name: "내 목적지 중심",
    subtitle: "도착하기 전에 미리",
    description: "목적지 주변의 소식을 확인하세요. 조회 반경은 미확정입니다.",
    icon: "flag",
  },
  {
    id: "direction",
    name: "내 방향 중심",
    subtitle: "같은 방향으로 가는 길",
    description: "내비게이션 경로를 따라 만나는 커뮤니티입니다. 조회 범위는 미확정입니다.",
    icon: "route",
  },
];
export const mockConfig = {
  refreshMs: 20_000,
  pageSize: 20,
  historyHours: 24,
  delayMs: 650,
  aiDelayMs: 1500,
  minReportChars: 8,
  speechStepMs: 65,
  speechChunkSize: 4,
  speechEndMs: 650,
  successMs: 1400,
};
