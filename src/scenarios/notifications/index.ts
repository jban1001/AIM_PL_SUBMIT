import { BlackIceScenario } from "./blackIce.ts";
import { ParkingScenario } from "./parking.ts";
import { TrafficScenario } from "./traffic.ts";
import { LocalScenario } from "./local.ts";
import type { ScenarioEventHandler } from "../../domain/notifications.ts";

// Extend event rules here; the shared delivery UI never needs scenario branches.
export const notificationScenarios: ScenarioEventHandler[] = [
  ParkingScenario,
  TrafficScenario,
  LocalScenario,
  BlackIceScenario,
];
