import test from "node:test";
import assert from "node:assert/strict";
import { boardSeeds } from "../src/services/boardSeeds.ts";
import { createPosts, makeIncoming, nextPagePosts, pagePosts } from "../src/services/mockCommunity.ts";

test("각 게시판의 최신 예시 네 개에 네 범주가 모두 나온다", () => {
  const categories = new Set(["주차", "교통", "도로 위험", "지역 정보"]);
  for (const community of ["nearby", "destination", "direction"] as const) {
    const seed = boardSeeds[community];
    const newest = pagePosts(createPosts(seed, community), 0).slice(0, 4);
    assert.deepEqual(new Set(newest.map(({ category }) => category)), categories);
  }
});

test("목적지와 방향 게시판은 초기·추가 조회·새 글에 각각의 전용 예시를 사용한다", () => {
  const nearby = new Set(boardSeeds.nearby.examples.map((post) => post.summary));
  for (const community of ["destination", "direction"] as const) {
    const seed = boardSeeds[community];
    const summaries = new Set(seed.examples.map((post) => post.summary));
    const all = createPosts(seed, community);
    const first = pagePosts(all, 0);
    assert.equal(first.length, 20);
    assert.equal(nextPagePosts(all, first).length, 20);
    const generated = [...all, ...makeIncoming(seed, community, seed.examples.length * 2)];
    for (const post of generated) {
      assert.equal(post.community, community);
      assert.ok(!nearby.has(post.summary));
      assert.ok(summaries.has(post.summary));
      assert.doesNotMatch(post.summary, /인하대|용현시장|학익동|미추홀/);
    }
  }
  const destination = new Set(boardSeeds.destination.examples.map((post) => post.summary));
  assert.ok(boardSeeds.direction.examples.every((post) => !destination.has(post.summary)));
});
