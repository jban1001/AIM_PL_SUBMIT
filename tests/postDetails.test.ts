import test from "node:test";
import assert from "node:assert/strict";
import { notificationForPost, vehicleStatusLabel } from "../src/domain/postDetails.ts";
import { boardSeeds } from "../src/services/boardSeeds.ts";
import { createPosts } from "../src/services/mockCommunity.ts";

test("제한 OFF에서 관측된 주행 상태만 표시를 보정하고 다른 상태는 유지한다", () => {
  assert.equal(vehicleStatusLabel("stopped", false, "driving"), "주행 중");
  assert.equal(vehicleStatusLabel("stopped", false, "stopped"), "정차 중");
  assert.equal(vehicleStatusLabel("stopped"), "정차 중");
  assert.equal(vehicleStatusLabel("parked", false, "driving"), "주차 중");
  assert.equal(vehicleStatusLabel("driving", false, "driving"), "주행 제한 중");
  assert.equal(vehicleStatusLabel("stopped", true, "driving"), "읽기 전용");
});

test("수신 이력이 없는 모든 게시판 글을 임의 거리 없이 상세 카드로 연다", () => {
  for (const community of ["nearby", "destination", "direction"] as const) {
    for (const post of createPosts(boardSeeds[community], community)) {
      const detail = notificationForPost(post);
      assert.equal(detail.post, post);
      assert.equal(detail.distanceMeters, 0);
      assert.ok(detail.speech.includes(post.summary));
    }
  }
});

test("수신된 글의 상세는 원래 거리와 음성 안내를 유지한다", () => {
  const post = createPosts(boardSeeds.nearby, "nearby", 1)[0];
  const received = { post, distanceMeters: 450, speech: "원래 음성", source: "제보 수신", receivedAt: 100, simulated: true as const };
  const detail = notificationForPost(post, received);
  assert.equal(detail.distanceMeters, 450);
  assert.equal(detail.speech, "원래 음성");
  assert.equal(detail.receivedAt, 100);
});
