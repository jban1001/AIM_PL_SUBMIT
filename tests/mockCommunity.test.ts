import test from "node:test";
import assert from "node:assert/strict";
import {
  createPosts,
  deleteOwnPost,
  makeIncoming,
  nextPagePosts,
  pagePosts,
  processReport,
  scenarioIncoming,
} from "../src/services/mockCommunity.ts";
import { blackIce } from "../src/scenarios/blackIce.ts";
import { CURRENT_USER_ID, mockConfig } from "../src/domain/types.ts";
import { congestion } from "../src/scenarios/congestion.ts";
import { normalizeReportBody, validateReportBody } from "../src/services/reportInput.ts";

test("20개씩 최신순으로 조회하고 24시간이 지난 글을 제외한다", () => {
  const posts = createPosts(blackIce, "nearby");
  assert.equal(pagePosts(posts, 0).length, 20);
  assert.equal(pagePosts(posts, 1).length, 20);
  assert.equal(pagePosts(posts, 2).length, 5);
  assert.ok(pagePosts(posts, 0)[0].createdAt > pagePosts(posts, 0)[1].createdAt);
  assert.equal(pagePosts(posts, 0, Date.now() + 25 * 3600_000).length, 0);
  assert.equal(new Set([...pagePosts(posts, 0), ...pagePosts(posts, 1)].map((p) => p.id)).size, 40);
});
test("각 커뮤니티 데이터와 새 글은 해당 커뮤니티에만 속한다", () => {
  for (const id of ["nearby", "direction", "destination"] as const) {
    assert.ok(createPosts(blackIce, id).every((post) => post.community === id && post.simulated));
    assert.ok(
      makeIncoming(blackIce, id, 2).every((post) => post.community === id && post.simulated),
    );
  }
});
test("근거가 없는 게시글은 빈 문자열을 유지한다", () => {
  assert.equal(createPosts(blackIce, "nearby")[2].evidence, "");
});
test("시나리오의 모의 차량 조건에 따라 새 글 알림을 생성한다", () => {
  assert.equal(scenarioIncoming(blackIce, "nearby", []).length, 1);
  const warmScenario = {
    ...blackIce,
    vehicleData: { ...blackIce.vehicleData, outsideTemperature: 5 },
  };
  assert.equal(scenarioIncoming(warmScenario, "nearby", []).length, 0);
});
test("새 글을 반영한 후 이전 글을 조회해도 중복이 생기지 않는다", () => {
  const all = createPosts(blackIce, "nearby");
  const incoming = makeIncoming(blackIce, "nearby", 2);
  const visible = [...incoming, ...pagePosts(all, 0)];
  const next = nextPagePosts([...incoming, ...all], visible);
  assert.equal(next.length, 20);
  assert.equal(new Set([...visible, ...next].map((post) => post.id)).size, 42);
});
test("Mock AI는 원문과 모의 context를 처리해 선택한 커뮤니티에 결과를 만든다", async () => {
  mockConfig.aiDelayMs = 0;
  const post = await processReport(blackIce, blackIce.exampleInput, "destination", [], false);
  assert.equal(post.community, "destination");
  assert.equal(post.category, "도로 위험");
  assert.match(post.summary, /블랙아이스 의심/);
  assert.match(post.evidence, /시뮬레이션/);
  assert.equal(post.simulated, true);
});
test("AI 처리 실패 시 대체 게시글을 반환하지 않고 재시도할 수 있다", async () => {
  mockConfig.aiDelayMs = 0;
  await assert.rejects(
    processReport(blackIce, blackIce.exampleInput, "nearby", [], true),
    /제보를 정리하지 못했어요/,
  );
  const post = await processReport(blackIce, blackIce.exampleInput, "nearby", [], false);
  assert.equal(post.community, "nearby");
  await assert.rejects(processReport(blackIce, "  ", "nearby", [], false), /내용을 입력/);
});
test("호출어는 본문에서 제거하고 유효하지 않은 발화는 AI 호출 전에 거절한다", async () => {
  assert.equal(
    normalizeReportBody("제보할게 지금 도로에 정체가 심해요"),
    "지금 도로에 정체가 심해요",
  );
  assert.equal(validateReportBody("어…"), false);
  let calls = 0;
  await assert.rejects(
    processReport(congestion, "어…", "nearby", [], false, { onRequest: () => calls++ }),
    /한 문장 더/,
  );
  assert.equal(calls, 0);
});
test("등록 시도당 하나의 Mock 요청으로 원본과 context를 전달하고 소유권을 지정한다", async () => {
  mockConfig.aiDelayMs = 0;
  let calls = 0;
  const post = await processReport(
    congestion,
    `제보할게 ${congestion.exampleInput}`,
    "direction",
    createPosts(congestion, "direction"),
    false,
    {
      source: "voice",
      onRequest: (input) => {
        calls++;
        assert.equal(input.body, congestion.exampleInput);
        assert.ok(input.similarPosts.every((post) => post.community === "direction"));
        assert.equal(input.vehicleData.averageSpeed, 8);
      },
    },
  );
  assert.equal(calls, 1);
  assert.equal(post.category, "교통");
  assert.equal(post.community, "direction");
  assert.equal(post.authorId, CURRENT_USER_ID);
  assert.equal(post.source, "voice");
  assert.ok(!post.originalBody!.includes("제보할게"));
  assert.ok(!post.summary.includes("\n"));
});
test("차량 조회 실패와 유사 글 없음은 해당 입력만 제외하고 등록을 계속한다", async () => {
  mockConfig.aiDelayMs = 0;
  const post = await processReport(
    congestion,
    congestion.exampleInput,
    "destination",
    createPosts(congestion, "destination"),
    false,
    {
      vehicleDataAvailable: false,
      similarPostsAvailable: false,
      onRequest: (input) => {
        assert.deepEqual(input.vehicleData, {});
        assert.deepEqual(input.similarPosts, []);
      },
    },
  );
  assert.equal(post.evidence, "");
  assert.equal(post.category, "교통");
});
test("임의 입력에 예시 시나리오의 사고 원인이나 차량 관측을 덧붙이지 않는다", async () => {
  mockConfig.aiDelayMs = 0;
  const post = await processReport(
    blackIce,
    "목적지 주차장에 자리가 없습니다",
    "destination",
    [],
    false,
  );
  assert.equal(post.summary, "목적지 주차장에 자리가 없습니다");
  assert.equal(post.evidence, "");
  assert.equal(post.category, "기타");
});
test("AI 실패도 한 번의 요청이며 대체 게시글이 생성되지 않는다", async () => {
  let calls = 0;
  await assert.rejects(
    processReport(congestion, congestion.exampleInput, "nearby", [], true, {
      onRequest: () => calls++,
    }),
    /정리하지 못했어요/,
  );
  assert.equal(calls, 1);
});
test("차량 상태 입력 없이 본인 글을 삭제하며 다른 작성자 글은 보존한다", async () => {
  const own = await processReport(congestion, congestion.exampleInput, "nearby", [], false);
  const peer = createPosts(congestion, "nearby", 1)[0];
  const posts = [own, peer];
  assert.deepEqual(deleteOwnPost(posts, own.id), [peer]);
  assert.deepEqual(deleteOwnPost(posts, peer.id), posts);
  assert.deepEqual(deleteOwnPost(posts, own.id, "another-driver"), posts);
});
