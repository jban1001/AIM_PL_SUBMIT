import { simulationTabs } from "../scenarios/notifications";
import { Icon } from "./Icon";

export function SimulationWorkspace({ scenarioId, disabled, canReport, canReceive, onSelect, onReport, onReceive }: {
  scenarioId: string;
  disabled: boolean;
  canReport: boolean;
  canReceive: boolean;
  onSelect: (id: string) => void;
  onReport: () => void;
  onReceive: (eventId: string) => void;
}) {
  const active = simulationTabs.find((tab) => tab.reportScenarioId === scenarioId)!;
  return (
    <div className="simulation-workspace">
      <div className="simulation-tabs" role="tablist" aria-label="시뮬레이션 유형">
        {simulationTabs.map((tab, index) => (
          <button key={tab.id} id={`simulation-tab-${tab.id}`} type="button" role="tab"
            aria-selected={tab.id === active.id} aria-controls={`simulation-panel-${tab.id}`}
            tabIndex={tab.id === active.id ? 0 : -1}
            onKeyDown={(event) => {
              const next = event.key === "ArrowRight" ? (index + 1) % simulationTabs.length
                : event.key === "ArrowLeft" ? (index + simulationTabs.length - 1) % simulationTabs.length
                : event.key === "Home" ? 0 : event.key === "End" ? simulationTabs.length - 1 : -1;
              if (next < 0) return;
              event.preventDefault();
              onSelect(simulationTabs[next].reportScenarioId);
              event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
            }}
            disabled={disabled} onClick={() => onSelect(tab.reportScenarioId)}>
            {tab.name} 시뮬레이션
          </button>
        ))}
      </div>
      <section key={active.id} id={`simulation-panel-${active.id}`} role="tabpanel"
        aria-labelledby={`simulation-tab-${active.id}`} className="simulation-scenario-panel">
        <div className="simulation-scenario-heading">
          <h3>{active.name} 제보 시연</h3>
          <p>제보자와 수신자 상황을 각각 실행해 보세요. 현재 선택된 커뮤니티에 반영됩니다.</p>
        </div>
        <div className="simulation-steps">
          <div className="simulation-step">
            <span className="simulation-step-label">01 · 제보자</span>
            <p>
              {active.reportMode === "dictation"
                ? "글 작성 · 말로 입력부터 제보 등록까지"
                : "음성 인식부터 처리, 제보 등록까지"}
            </p>
            <button type="button" className="speech-trigger" disabled={!canReport} onClick={onReport}>
              <Icon name="mic" size={19} />‘제보할게’ 발화 시연<Icon name="arrow" size={16} />
            </button>
            <small>
              {active.reportMode === "dictation"
                ? "주행 제한 OFF 상태에서 실행할 수 있습니다."
                : "주행 제한 ON/OFF 모두 음성 제보를 실행할 수 있습니다."}
            </small>
          </div>
          <div className="simulation-step">
            <span className="simulation-step-label">02 · 수신자</span>
            <p>주변 제보 수신과 알림음</p>
            <button type="button" className="receive-scenario-button" disabled={!canReceive}
              onClick={() => onReceive(active.notification.id)}>
              <Icon name="speaker" size={18} />{active.name} 제보 수신 시연
            </button>
            <small>카드를 확인하고 Gleo에게 제보를 읽어달라고 요청하세요.</small>
          </div>
        </div>
      </section>
    </div>
  );
}
