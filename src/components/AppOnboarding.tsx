import { useEffect, useRef, useState } from "react";
import type { Category } from "../domain/types";
import { Icon } from "./Icon";
import "../styles/onboarding.css";

const preferences = [
  { category: "주차", label: "주차", icon: "parking", description: "주차 공간과 이용 정보" },
  { category: "교통", label: "교통", icon: "traffic", description: "정체와 도로 흐름" },
  { category: "지역 정보", label: "지역", icon: "pin", description: "내 주변의 새로운 소식" },
  { category: "도로 위험", label: "도로 위험", icon: "warning", description: "안전한 주행을 위한 제보" },
] satisfies { category: Category; label: string; icon: string; description: string }[];

export function AppOnboarding({ onComplete }: { onComplete: (categories: Category[]) => void }) {
  const [step, setStep] = useState<"launch" | "preferences">("launch");
  const [selected, setSelected] = useState<Category[]>([]);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (step === "preferences") heading.current?.focus();
  }, [step]);

  if (step === "launch") return (
    <main className="launch-screen" aria-label="GAZEE 시작 화면">
      <h1 className="launch-logo">GAZEE</h1>
      <button type="button" className="launch-button" onClick={() => setStep("preferences")}>
        앱 실행하기 <Icon name="arrow" size={20} />
      </button>
    </main>
  );

  return (
    <main className="preferences-screen">
      <header className="preferences-topbar">
        <button type="button" className="preferences-back" onClick={() => setStep("launch")} aria-label="시작 화면으로 돌아가기">
          <Icon name="back" size={24} />
        </button>
        <span className="preferences-brand">GAZEE</span>
      </header>
      <form className="preferences-form" onSubmit={(event) => {
        event.preventDefault();
        if (selected.length) onComplete(selected);
      }}>
        <div className="preferences-heading">
          <span className="preferences-kicker">어디가지? 여기가지!</span>
          <h1 ref={heading} tabIndex={-1}>어떤 소식에 관심 있으세요?</h1>
          <p id="preferences-help">관심 있는 범주를 모두 선택해 주세요. 여러 개를 선택할 수 있어요.</p>
        </div>
        <fieldset className="preference-options" aria-describedby="preferences-help">
          <legend className="sr-only">선호하는 범주 선택</legend>
          {preferences.map((item) => {
            const checked = selected.includes(item.category);
            return (
              <label key={item.category} className={`preference-option ${checked ? "is-selected" : ""}`}>
                <input type="checkbox" name="categories" value={item.category} checked={checked}
                  onChange={() => setSelected((current) => checked
                    ? current.filter((category) => category !== item.category)
                    : [...current, item.category])} />
                <span className="preference-check" aria-hidden="true">{checked && <Icon name="check" size={17} />}</span>
                <span className="preference-icon"><Icon name={item.icon} size={48} /></span>
                <strong>{item.label}</strong>
                <span className="preference-description">{item.description}</span>
              </label>
            );
          })}
        </fieldset>
        <div className="preferences-bottom">
          <p role="status">{selected.length ? `${selected.length}개 범주를 선택했어요` : "1개 이상 선택해 주세요"}</p>
          <button type="submit" className="preferences-submit" disabled={!selected.length}>
            선택 완료하고 시작하기 <Icon name="arrow" size={20} />
          </button>
        </div>
      </form>
    </main>
  );
}
