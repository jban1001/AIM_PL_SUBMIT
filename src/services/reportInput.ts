import type { AIResult } from "../domain/types.ts";

export function normalizeReportBody(body: string) {
  return body
    .trim()
    .replace(/^[“"]?제보할게[”"]?[\s,.!，]*/u, "")
    .replace(/\s+/g, " ")
    .trim();
}
export function voiceCommandBody(transcript: string): string | null {
  const text = transcript.trim();
  const command = text.match(/^[“"‘']?\s*제\s*보\s*(?:할\s*[게께](?:요)?|해\s*줘(?:요)?)(?=$|[\s,.!?…"'”’。])/u);
  return command ? text.slice(command[0].length).replace(/^[\s,.!?…"'”’。]+/u, "").trim() : null;
}

// Gleo creates the title. This only removes command wrappers if they leak through;
// it does not infer traffic conditions or rewrite uncertainty/negation.
export function normalizeGleoReport(body: string): string {
  let text = normalizeReportBody(body);
  const app = String.raw`(?:(?:가지|가제|gazee)(?:\s*(?:앱|어플|커뮤니티))?|(?:까지|바지)\s*앱)\s*(?:에다가|에서|으로|에|로|의)`;
  for (let pass = 0; pass < 3; pass++) {
    const previous = text;
    text = text
      .replace(/^(?:글레오|글래오|gleo)(?:야|아)?(?=$|[\s,，:])\s*[,，:]?\s*/iu, "")
      .replace(new RegExp(`^(?:(?:지금|방금)[\\s,，:]*)?${app}(?=$|[\\s,，:])[\\s,，:]*`, "iu"), "");
    text = voiceCommandBody(text) ?? text;
    text = text.replace(new RegExp(
      `(?:\\s+${app})?\\s*(?:(?:도로|교통)\\s*)?(?:제보(?:를)?\\s*)?(?:제보|등록|공유)(?:를|을)?\\s*해\\s*(?:줘(?:요)?|주세요|주실래요|줄래(?:요)?)[\\s.!。]*$`,
      "iu",
    ), "").replace(/[을를]\s*제보[\s.!。]*$/u, "").trim();
    if (text === previous) break;
  }
  return text;
}

export type MissingReportField = "location" | "condition" | "both";
export type GleoReportDetails = { location: string; condition: string; utterance?: string };

// Free-form dictation and older Gleo payloads use recognizable place names.
// A bare reference such as '여기' or '주차장' is not a specific location.
const vaguePlaces = new Set([
  "가지", "가제", "gazee", "가지앱", "가제앱", "글레오", "현재도로", "주행중인도로", "지금있는도로",
  "여기", "거기", "저기", "이곳", "그곳", "전방", "앞", "근처", "주변", "현재위치", "내위치",
  "도로", "고속도로", "교차로", "진입로", "우회로", "대로", "그대로", "제대로", "터널", "사거리",
  "주차장", "충전소", "정류장", "휴게소", "가게", "국밥집", "식당", "학교", "구청", "장소", "지역",
]);
const placeholders = /^(?:미상|미정|없음|알수없음|모름|모르겠음|불명|불명확|정보없음|미입력|미확인|미제공|미지정|unknown|unspecified|none|null|na|notprovided|notmentioned)$/iu;
const placeName = /[가-힣A-Za-z0-9·.-]*(?:고속도로|대로|대교|교차로|사거리|삼거리|터널|주차장|충전소|휴게소|정류장|구청|대학교|학교|병원|공원|광장|아파트|국밥집|식당|마트|IC|JC|역|동|교|길|로)(?=$|[\s,.!?'”]|에서|에|은|는|이|가|를|을|쪽|부근|앞|뒤|근처|방향|정체|막힘)/giu;
const facilityName = /[가-힣A-Za-z0-9·.-]+\s+(?:주차장|충전소|구청|정류장|휴게소|국밥집|식당|병원)(?=$|[\s,.!?]|에서|에|은|는|이|가)/gu;
const namedArea = /(?:^|\s)(?:서울|인천|성수|부산|대전|대구|세종|광주|울산|수원|제주|강남)(?=$|\s|에서|에|은|는|이|가|[,.!?])/u;
const observation = /정체|막히|막힌|막혀|막힘|밀리|밀려|서행|멈추|멈춰|움직이(?:지|질)|차(?:량|들)?가\s*많|한산|원활|사고|충돌|추돌|낙하물|장애물|포트홀|파손|빙판|블랙아이스|미끄|결빙|얼어|고장|위험|공사|통제|폐쇄|우회|침수|낙석|균열|만차|빈\s*(?:자리|공간)|자리.{0,12}(?:있|없|남)|주차.{0,12}(?:가능|불가|어려|여유)|충전.{0,18}(?:안\s*(?:되|됨)|고장|불가|중단|시작되지|진행되지|느리)|혼잡|맛있|맛없|괜찮|추천|영업|휴무|행사|개최|축제|마라톤|플리마켓|새로\s*(?:열|생)/u;
const compact = (value: string) => value.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();

function concrete(value: string): boolean {
  const normalized = compact(value);
  return normalized.length >= 2 && !placeholders.test(normalized);
}

function namedLocation(text: string): string {
  for (const match of text.matchAll(facilityName)) {
    const first = match[0].split(/\s/u)[0];
    if (!vaguePlaces.has(first) && !/^(?:지금|이|그|저|근처의|주변의)$/u.test(first) && !observation.test(first)) return match[0];
  }
  for (const match of text.matchAll(placeName)) {
    const value = match[0];
    if (concrete(value) && !vaguePlaces.has(compact(value)) && !observation.test(value)) return value;
  }
  return text.match(namedArea)?.[0].trim() ?? "";
}

export function reportInputError(body: string, details?: GleoReportDetails): {
  missing: MissingReportField;
  message: string;
} | null {
  const text = normalizeReportBody(body);
  const source = details?.utterance === undefined ? text : normalizeGleoReport(details.utterance);
  const location = details?.location.trim() ?? namedLocation(text);
  const locationKey = compact(location);
  const hasLocation = concrete(location) && !vaguePlaces.has(locationKey)
    && (!details || (compact(text).includes(locationKey) && compact(source).includes(locationKey)
      && (!observation.test(location) || !!namedLocation(location))));
  const remainder = location ? text.replace(location, "") : text;
  const condition = details?.condition.trim();
  // Structured Gleo fields allow observations outside the local vocabulary.
  // Reject missing values, a repeated place name, or a bare request to report.
  const conditionText = condition === undefined ? remainder : condition.replace(location, "");
  const isSituation = (value: string) => concrete(value)
    && !/^(?:상황|제보|보고|등록|도로상황|교통상황|소식|이에요|입니다|에제보|에서제보)$/u.test(compact(value))
    && !vaguePlaces.has(compact(value));
  const sourceWithoutLocation = location ? source.replace(location, "") : source;
  const sourceHasCondition = details?.utterance === undefined || observation.test(sourceWithoutLocation)
    || (concrete(conditionText) && compact(sourceWithoutLocation).includes(compact(conditionText)));
  const hasCondition = condition === undefined
    ? observation.test(conditionText)
    : isSituation(conditionText) && isSituation(remainder) && compact(condition) !== locationKey && sourceHasCondition;

  if (!hasLocation && !hasCondition) return { missing: "both", message: "장소와 어떤 상황인지 함께 알려 주세요." };
  if (!hasLocation) return { missing: "location", message: "어느 도로나 장소인지 알려 주세요." };
  if (!hasCondition) return { missing: "condition", message: "그 장소에서 어떤 상황인지 알려 주세요." };
  return null;
}

export function validateGleoReportTitle(body: string) {
  return reportInputError(normalizeGleoReport(body)) === null;
}

export function validateReportBody(body: string) {
  return reportInputError(body) === null;
}
// Deterministic Mock fallback, not keyword classification: never invent a road,
// cause, vehicle observation, or scenario label for arbitrary user text.
export function conservativeResult(body: string): AIResult {
  const original = normalizeReportBody(body);
  return {
    summary: original.length > 65 ? `${original.slice(0, 64)}…` : original,
    evidence: "",
    category: "기타",
  };
}
