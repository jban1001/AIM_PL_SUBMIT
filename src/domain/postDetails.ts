import type { MockNotificationData } from "./notifications.ts";
import type { Post } from "./types.ts";

export function notificationForPost(
  post: Post & { description?: string },
  received?: MockNotificationData,
): MockNotificationData {
  if (received) return { ...received, post };
  return {
    post,
    speech: [post.summary, post.description].filter(Boolean).join(". "),
    distanceMeters: 0,
    source: "커뮤니티 게시글",
    receivedAt: post.createdAt,
    simulated: true,
  };
}

export function vehicleStatusLabel(
  state: "driving" | "parked" | "stopped",
  readOnly = false,
  observedMotion?: "driving" | "parked" | "stopped" | null,
) {
  if (readOnly) return "읽기 전용";
  if (state === "driving") return "주행 제한 중";
  if (state === "parked") return "주차 중";
  return observedMotion === "driving" ? "주행 중" : "정차 중";
}
