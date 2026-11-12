import type { Category, CommunityId, Post } from "./types.ts";

export type DrivingRestrictionState = "DRIVING_RESTRICTED" | "UNRESTRICTED";
export type CommunitySelectionState = CommunityId;
export interface MockNotificationData {
  post: Post;
  speech: string;
  speechRate?: number;
  distanceMeters: number;
  source: string;
  receivedAt: number;
  simulated: true;
}
export type NotificationHistory = Record<CommunityId, MockNotificationData[]>;
export type TTSStatus =
  | "idle"
  | "muted"
  | "queued"
  | "playing"
  | "played"
  | "blocked"
  | "unsupported"
  | "cancelled";
export interface TTSPlaybackState {
  status: TTSStatus;
  detail: string;
  engine?: string;
  fallbackReason?: string;
}
export interface ScenarioEventHandler {
  id: string;
  name: string;
  createEvent: (community: CommunityId, now?: number) => MockNotificationData;
}
export function makeFrontDemoPost(
  post: Post,
  scenario: ScenarioEventHandler,
  includeEvidence = true,
): Post {
  const { category, summary, description, evidence } = scenario.createEvent(post.community, post.createdAt).post;
  return { ...post, category, summary, description, evidence: includeEvidence ? evidence : "" };
}

export function makeRearNotification(
  frontPost: Pick<Post, "id" | "community">,
  distanceMeters: number,
  scenario: ScenarioEventHandler,
  now = Date.now(),
): MockNotificationData | null {
  if (!Number.isFinite(distanceMeters) || distanceMeters < 0) return null;
  const event = scenario.createEvent(frontPost.community, now);
  if (distanceMeters > event.distanceMeters) return null;
  return { ...event, post: { ...event.post, id: frontPost.id } };
}

const categoryPriority: Record<Category, number> = {
  "도로 위험": 3,
  "교통": 2,
  "주차": 1,
  "지역 정보": 0,
  "기타": 0,
};

// Finish the current chime, then alert for hazards first and nearer reports next.
export function compareNotificationPriority(a: MockNotificationData, b: MockNotificationData): number {
  return categoryPriority[b.post.category] - categoryPriority[a.post.category]
    || a.distanceMeters - b.distanceMeters
    || a.receivedAt - b.receivedAt;
}

export function emptyNotificationHistory(): NotificationHistory {
  return { nearby: [], destination: [], direction: [] };
}
export function recordNotification(
  history: NotificationHistory,
  incoming: MockNotificationData,
): NotificationHistory {
  const community = incoming.post.community;
  if (history[community].some((item) => item.post.id === incoming.post.id)) return history;
  return { ...history, [community]: [incoming, ...history[community]] };
}
export function upsertReceivedPost(posts: Post[], incoming: Post): Post[] {
  return [...posts.filter((post) => post.id !== incoming.id), incoming].sort(
    (a, b) => b.createdAt - a.createdAt,
  );
}
