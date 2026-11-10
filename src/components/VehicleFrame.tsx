import { useState, type ReactNode } from "react";

export function VehicleFrame({ children }: { children: ReactNode }) {
  const [halfWidth, setHalfWidth] = useState(false);

  return (
    <>
      <div className="preview-size">
        <span>시연 화면 크기</span>
        <div className="segmented" role="group" aria-label="시연 화면 크기">
          <button
            type="button"
            className={!halfWidth ? "active" : undefined}
            aria-pressed={!halfWidth}
            onClick={() => setHalfWidth(false)}
          >
            전체 영역
          </button>
          <button
            type="button"
            className={halfWidth ? "active" : undefined}
            aria-pressed={halfWidth}
            onClick={() => setHalfWidth(true)}
          >
            절반 영역
          </button>
        </div>
      </div>
      <section
        className={halfWidth ? "vehicle-frame half-width" : "vehicle-frame"}
        aria-label="Pleos 앱 미리보기"
      >
        <div className="roadtown-panel">{children}</div>
      </section>
    </>
  );
}
