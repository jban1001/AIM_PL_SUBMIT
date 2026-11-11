import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

export function VehicleFrame({ children }: { children: ReactNode }) {
  const [halfWidth, setHalfWidth] = useState(false);
  const frame = useRef<HTMLElement>(null);
  const [scale, setScale] = useState(0);
  const panelWidth = halfWidth ? 841 : 1707;
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setScale(Math.min(entry.contentRect.width / panelWidth, entry.contentRect.height / 1210));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [panelWidth]);

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
        ref={frame}
        className={halfWidth ? "vehicle-frame half-width" : "vehicle-frame"}
        aria-label="Pleos 앱 미리보기"
        style={{ "--preview-scale": scale } as CSSProperties}
      >
        <div className="roadtown-panel">{children}</div>
      </section>
    </>
  );
}
