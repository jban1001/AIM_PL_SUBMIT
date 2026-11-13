export type CommunityId = "nearby" | "direction" | "destination";
export type Category = "교통" | "도로 위험" | "주차" | "지역 정보" | "기타";
export type FeedView = "normal" | "empty" | "loading";
export type VehicleState = "parked" | "stopped" | "driving";
export type InputMode = "touch" | "voice";
export type SpeechFault = "none" | "stt" | "insufficient";
export const CURRENT_USER_ID = "demo-driver";
export interface Post extends AIResult {
  id: string;
  community: CommunityId;
  createdAt: number;
  simulated: true;
  authorId?: string;
  source?: InputMode;
  originalBody?: string;
}
export interface AIResult {
  summary: string;
  description?: string;
  evidence: string;
  category: Category;
}
export interface Scenario {
  id: string;
  name: string;
  category: Category;
  exampleInput: string;
  vehicleData: Record<string, string | number>;
  examples: AIResult[];
  simulation?: {
    dictationSpeed?: number;
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
    subtitle: "목적지 · 김포국제공항",
    description: "내비게이션 목적지인 김포국제공항 주변의 소식입니다.",
    icon: "flag",
  },
  {
    id: "direction",
    name: "내 방향 중심",
    subtitle: "김포국제공항으로 가는 길",
    description: "내비게이션의 김포국제공항 방면 이동 경로에서 공유된 소식입니다.",
    icon: "route",
  },
];
export const mockConfig = {
  refreshMs: 20_000,
  pageSize: 20,
  historyHours: 24,
  delayMs: 650,
  aiDelayMs: 1500,
  speechStepMs: 65,
  speechChunkSize: 4,
  speechEndMs: 650,
  successMs: 1400,
};
