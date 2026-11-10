import {
  CURRENT_USER_ID,
  mockConfig,
  type CommunityId,
  type InputMode,
  type Post,
  type Scenario,
} from "../domain/types.ts";
import { normalizeReportBody, validateReportBody } from "./reportInput.ts";

export const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createPosts(scenario: Scenario, community: CommunityId, count = 45): Post[] {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => ({
    ...scenario.examples[i % scenario.examples.length],
    id: `${scenario.id}-${community}-${i}`,
    community,
    createdAt: now - (i * 3 + 3) * 60_000,
    simulated: true,
  }));
}

export function pagePosts(posts: Post[], page: number, now = Date.now()) {
  return posts
    .filter((post) => now - post.createdAt < mockConfig.historyHours * 3600_000)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(page * mockConfig.pageSize, (page + 1) * mockConfig.pageSize);
}

// An ID cursor avoids duplicates when newly published posts shift page offsets.
export function nextPagePosts(all: Post[], visible: Post[]) {
  const seen = new Set(visible.map((post) => post.id));
  return pagePosts(
    all.filter((post) => !seen.has(post.id)),
    0,
  );
}

export function makeIncoming(scenario: Scenario, community: CommunityId, count: number): Post[] {
  return Array.from({ length: count }, (_, i) => ({
    ...scenario.examples[i % scenario.examples.length],
    id: `incoming-${community}-${Date.now()}-${i}`,
    community,
    createdAt: Date.now() - i * 1000,
    simulated: true,
  }));
}

export function scenarioIncoming(scenario: Scenario, community: CommunityId, posts: Post[]) {
  const count =
    scenario.simulation?.incomingCount?.({
      community,
      posts,
      vehicleData: scenario.vehicleData,
    }) ?? 1;
  return makeIncoming(scenario, community, Math.max(0, Math.min(20, Math.floor(count))));
}

export interface ReportAIInput {
  body: string;
  vehicleData: Record<string, string | number>;
  similarPosts: Post[];
}
export interface ReportOptions {
  vehicleDataAvailable?: boolean;
  similarPostsAvailable?: boolean;
  source?: InputMode;
  onRequest?: (input: ReportAIInput) => void;
}
export async function processReport(
  scenario: Scenario,
  body: string,
  community: CommunityId,
  similarPosts: Post[],
  fail: boolean,
  options: ReportOptions = {},
): Promise<Post> {
  if (!body.trim()) throw new Error("내용을 입력해 주세요.");
  const originalBody = normalizeReportBody(body);
  if (!validateReportBody(originalBody)) throw new Error("어떤 상황인지 한 문장 더 말해 주세요");
  // Snapshot inputs at report time, before the simulated single Gemini call.
  const input: ReportAIInput = {
    body: originalBody,
    vehicleData: options.vehicleDataAvailable === false ? {} : { ...scenario.vehicleData },
    similarPosts:
      options.similarPostsAvailable === false
        ? []
        : similarPosts.filter((post) => post.community === community).map((post) => ({ ...post })),
  };
  options.onRequest?.(input);
  await wait(mockConfig.aiDelayMs);
  if (fail) throw new Error("제보를 정리하지 못했어요");
  const result = scenario.process(input.body, input);
  return {
    ...result,
    summary: result.summary.replace(/\s+/g, " ").trim(),
    evidence: Object.keys(input.vehicleData).length === 0 ? "" : result.evidence,
    id: `report-${crypto.randomUUID()}`,
    community,
    createdAt: Date.now(),
    simulated: true,
    authorId: CURRENT_USER_ID,
    source: options.source ?? "touch",
    originalBody,
  };
}

export function deleteOwnPost(posts: Post[], id: string, actor = CURRENT_USER_ID) {
  return posts.filter((post) => post.id !== id || post.authorId !== actor);
}
