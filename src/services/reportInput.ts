import { mockConfig, type AIResult } from "../domain/types.ts";

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
  const app = String.raw`(?:가지|가제|gazee)(?:\s*(?:앱|어플|커뮤니티))?\s*(?:에다가|으로|에|로)`;
  for (let pass = 0; pass < 3; pass++) {
    const previous = text;
    text = text
      .replace(/^(?:글레오|글래오|gleo)(?:야|아)?(?=$|[\s,，:])\s*[,，:]?\s*/iu, "")
      .replace(new RegExp(`^${app}(?=$|[\\s,，:])[\\s,，:]*`, "iu"), "");
    text = voiceCommandBody(text) ?? text;
    text = text.replace(new RegExp(
      `(?:\\s+${app})?\\s*(?:(?:도로|교통)\\s*)?(?:제보(?:를)?\\s*)?(?:제보|등록|공유)(?:를|을)?\\s*해\\s*(?:줘(?:요)?|주세요|주실래요|줄래(?:요)?)[\\s.!。]*$`,
      "iu",
    ), "").trim();
    if (text === previous) break;
  }
  return text;
}

// Short, already summarized Gleo titles need fewer characters than raw reports.
export function validateGleoReportTitle(body: string) {
  return normalizeGleoReport(body).replace(/[\s.…!?]/g, "").length >= 4;
}

export function validateReportBody(body: string) {
  return normalizeReportBody(body).replace(/[\s.…!?]/g, "").length >= mockConfig.minReportChars;
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
