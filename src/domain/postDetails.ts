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

export type VehicleStatusTone = "red" | "amber" | "green" | "muted";

// lowSpeed: the car rolls in Drive below the 30 km/h restriction threshold.
export function vehicleStatus(
  state: "driving" | "parked" | "stopped",
  readOnly = false,
  observedMotion?: "driving" | "parked" | "stopped" | null,
  lowSpeed = false,
): { label: string; tone: VehicleStatusTone } {
  if (readOnly) return { label: "읽기 전용", tone: "muted" };
  if (state === "driving") return { label: "주행 제한 중", tone: "red" };
  if (state === "parked") return { label: "주차 중", tone: "green" };
  if (observedMotion === "driving") return { label: "주행 중", tone: "amber" };
  return lowSpeed ? { label: "저속 주행 중", tone: "amber" } : { label: "정차 중", tone: "green" };
}

export function vehicleStatusLabel(
  state: "driving" | "parked" | "stopped",
  readOnly = false,
  observedMotion?: "driving" | "parked" | "stopped" | null,
  lowSpeed = false,
) {
  return vehicleStatus(state, readOnly, observedMotion, lowSpeed).label;
}
