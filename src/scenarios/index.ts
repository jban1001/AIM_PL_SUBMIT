import { blackIce } from "./blackIce";
import { congestion } from "./congestion";
import type { Scenario } from "../domain/types";

// 새 시나리오는 이 레지스트리에 추가합니다. 공통 화면 수정은 필요하지 않습니다.
export const scenarios: Scenario[] = [congestion, blackIce];
