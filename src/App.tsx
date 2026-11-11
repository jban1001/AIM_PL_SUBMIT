import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  CommunityLayout,
  CommunityTabs,
  NewPostNotification,
  PostList,
  ReportEntry,
} from "./components/Community";
import { DrivingRestrictionPanel } from "./components/DrivingRestrictionPanel";
import { Composer } from "./components/Composer";
import { VoiceReport } from "./components/VoiceReport";
import { VehicleFrame } from "./components/VehicleFrame";
import { Icon } from "./components/Icon";
import {
  communities,
  mockConfig,
  type CommunityId,
  type FeedView,
  type Post,
  type SpeechFault,
  type VehicleState,
} from "./domain/types";
import { scenarios } from "./scenarios";
import {
  createPosts,
  deleteOwnPost,
  makeIncoming,
  nextPagePosts,
  pagePosts,
  scenarioIncoming,
  wait,
  type ReportAIInput,
} from "./services/mockCommunity";
import { useReportFlow } from "./hooks/useReportFlow";
import { listenWithPleos } from "./services/pleosMic";
import { playNotificationChime } from "./services/notificationChime";
import { normalizeGleoReport, validateGleoReportTitle, voiceCommandBody } from "./services/reportInput";
import { useNotificationDelivery } from "./hooks/useNotificationDelivery";
import {
  makeRearNotification,
  upsertReceivedPost,
  type CommunitySelectionState,
  type DrivingRestrictionState,
  type MockNotificationData,
} from "./domain/notifications";
import { notificationScenarios } from "./scenarios/notifications";

declare global {
  interface Window {
    GazeeGleo?: {
      ready(): void;
      complete(requestId: string, success: boolean): void;
      completeRead(requestId: string, speech: string): void;
    };
  }
}

type RelayDemo = {
  role: "front" | "rear";
  report: Post | null;
  distance: number;
  publish: (post: Post) => void;
  showRear: () => void;
  approach: () => void;
};

type Feed = { all: Post[]; visible: Post[]; pending: Post[]; scroll: number };
type CommunityPostData = Record<CommunityId, Feed>;
const ids: CommunityId[] = ["nearby", "direction", "destination"];
const communityName = (id: CommunityId) => communities.find((item) => item.id === id)!.name;
function initialFeeds(scenario = scenarios[0]) {
  return Object.fromEntries(
    ids.map((id) => {
      const all = createPosts(scenario, id);
      return [
        id,
        {
          all,
          visible: pagePosts(all, 0),
          pending:
            id === "nearby"
              ? makeIncoming(scenario, id, scenario.simulation?.initialPendingCount ?? 2)
              : [],
          scroll: 0,
        },
      ];
    }),
  ) as Record<CommunityId, Feed>;
}
function RoadtownPrototype({ onReset, relay }: { onReset: () => void; relay: RelayDemo }) {
  const [selected, setSelected] = useState<CommunitySelectionState>(relay.report?.community ?? "nearby");
  const receivedRelayId = useRef<string | null>(null);
  const gleoRequest = useRef<string | null>(null);
  const [scenarioId, setScenarioId] = useState(scenarios[0].id);
  const scenario = scenarios.find((item) => item.id === scenarioId)!;
  const [feeds, setFeeds] = useState<CommunityPostData>(initialFeeds);
  const [vehicleState, setVehicleState] = useState<VehicleState>("driving");
  const driving = vehicleState === "driving";
  const drivingRestrictionState: DrivingRestrictionState = driving
    ? "DRIVING_RESTRICTED"
    : "UNRESTRICTED";
  const [tts, setTts] = useState(true);
  const [wakeListening, setWakeListening] = useState(false);
  const [wakeStatus, setWakeStatus] = useState("");
  const [ttsTestStatus, setTtsTestStatus] = useState("");
  const [ttsTesting, setTtsTesting] = useState(false);
  const ttsTestController = useRef<AbortController | null>(null);
  const [offline, setOffline] = useState(false);
  const [viewState, setViewState] = useState<FeedView>(
    scenario.simulation?.initialView ?? "normal",
  );
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [speechFault, setSpeechFault] = useState<SpeechFault>("none");
  const [failAI, setFailAI] = useState(scenario.simulation?.failFirstReport ?? false);
  const [vehicleUnavailable, setVehicleUnavailable] = useState(false);
  const [noSimilar, setNoSimilar] = useState(false);
  const [demoOpen, setDemoOpen] = useState(true);
  const [toast, setToast] = useState("");
  const [calls, setCalls] = useState(0);
  const [lastInput, setLastInput] = useState<ReportAIInput | null>(null);
  const [clock, setClock] = useState(new Date());
  const generation = useRef(0);
  const moreBusy = useRef(false);
  const online = useRef(!offline);
  online.current = !offline;
  const feed = feeds[selected];
  const community = communities.find((item) => item.id === selected)!;
  function updateFeed(id: CommunityId, update: (feed: Feed) => Feed) {
    setFeeds((prev) => ({ ...prev, [id]: update(prev[id]) }));
  }
  const flow = useReportFlow({
    getPosts: (id) => feeds[id].all,
    getOptions: () => {
      const fail = failAI;
      if (!offline) setFailAI(false);
      return {
        fail,
        offline,
        vehicleDataAvailable: !vehicleUnavailable,
        similarPostsAvailable: !noSimilar,
        onRequest: (input) => {
          setCalls((value) => value + 1);
          setLastInput(input);
        },
      };
    },
    consumeSpeechFault: () => {
      const fault = speechFault;
      setSpeechFault("none");
      return fault;
    },
    onPublished: (post, mode, voiceInput) => {
      updateFeed(post.community, (current) => ({
        ...current,
        all: [post, ...current.all],
        visible: [post, ...current.visible],
        scroll: 0,
      }));
      if (relay.role === "front") relay.publish(post);
      if (voiceInput === "gleo" && gleoRequest.current) {
        window.GazeeGleo?.complete(gleoRequest.current, true);
        gleoRequest.current = null;
      }
      if (mode === "touch") setSelected(post.community);
      setViewState(scenario.simulation?.afterReportView ?? "normal");
      setToast("제보가 등록되었어요.");
    },
  });
  const session = flow.session;
  const voiceSession = session?.mode === "voice" ? session : null;
  const touchSession = session?.mode === "touch" ? session : null;
  const blocked = driving || !!voiceSession;
  const busy = !!session && ["listening", "processing", "success"].includes(session.phase);
  const speechActive = session?.phase === "listening" || session?.phase === "processing";
  const delivery = useNotificationDelivery({
    enabled: tts,
    paused: !!speechActive || wakeListening || ttsTesting,
  });
  const acceptGleo = useEffectEvent((requestId: string, body: string) => {
    const title = normalizeGleoReport(body);
    if (relay.role !== "front" || !validateGleoReportTitle(title)
        || !flow.begin("voice", selected, scenario, title, "gleo")) {
      window.GazeeGleo?.complete(requestId, false);
      return;
    }
    gleoRequest.current = requestId;
    setWakeListening(false);
  });
  const readForGleo = useEffectEvent((requestId: string) => {
    const received = Object.values(delivery.history).flat();
    const latest = received.sort((a, b) => b.receivedAt - a.receivedAt)[0];
    window.GazeeGleo?.completeRead(requestId, latest?.speech ?? "");
  });
  useEffect(() => {
    const bridge = window.GazeeGleo;
    if (!bridge) return;
    function receive(event: Event) {
      const { id, body } = (event as CustomEvent<{ id: string; body: string }>).detail;
      acceptGleo(id, body);
    }
    function read(event: Event) {
      readForGleo((event as CustomEvent<{ id: string }>).detail.id);
    }
    window.addEventListener("gazee-gleo-report", receive);
    window.addEventListener("gazee-gleo-read", read);
    bridge.ready();
    return () => {
      window.removeEventListener("gazee-gleo-report", receive);
      window.removeEventListener("gazee-gleo-read", read);
      if (gleoRequest.current) bridge.complete(gleoRequest.current, false);
    };
  }, []);
  useEffect(() => {
    if (session?.voiceInput !== "gleo" || !["insufficient", "ai-error"].includes(session.phase)) return;
    if (gleoRequest.current) window.GazeeGleo?.complete(gleoRequest.current, false);
    gleoRequest.current = null;
  }, [session?.voiceInput, session?.phase]);

  const acceptWake = useEffectEvent((text: string) => {
    setWakeListening(false);
    const body = voiceCommandBody(text);
    if (body === null) {
      setWakeStatus("“제보할게”라고 말하면 제보 화면을 열어요.");
      return;
    }
    setWakeStatus("");
    flow.begin("voice", selected, scenario, body);
  });
  const canListenForWake = driving && !voiceSession && !busy;
  useEffect(() => {
    if (!wakeListening) return;
    if (!canListenForWake) {
      setWakeListening(false);
      return;
    }
    return listenWithPleos({
      onReady: () => setWakeStatus("듣는 중 · “제보할게”라고 말해 주세요."),
      onPreparing: setWakeStatus,
      onResult: acceptWake,
      onError: (error) => {
        setWakeStatus(error);
        setWakeListening(false);
      },
    });
  }, [wakeListening, canListenForWake]);

  const notification = delivery.history[selected][0];
  const receivedCount = Object.values(delivery.history).reduce(
    (count, items) => count + items.length,
    0,
  );
  function receiveScenario(eventId: string) {
    const handler = notificationScenarios.find((item) => item.id === eventId);
    if (!handler || offline) return;
    const incoming = handler.createEvent(selected);
    const event =
      delivery.history[selected].find((item) => item.post.id === incoming.post.id) ?? incoming;
    receivePost(event);
  }

  function receivePost(event: MockNotificationData) {
    updateFeed(event.post.community, (current) => ({
      ...current,
      all: upsertReceivedPost(current.all, event.post),
      visible: upsertReceivedPost(current.visible, event.post),
      pending: current.pending.filter((post) => post.id !== event.post.id),
    }));
    delivery.receive(event);
  }

  const receiveRelay = useEffectEvent((post: Post, distance: number) => {
    if (receivedRelayId.current === post.id) return;
    const event = makeRearNotification(post, distance);
    if (!event) return;
    receivedRelayId.current = post.id;
    receivePost(event);
  });
  useEffect(() => {
    if (relay.role === "rear" && relay.report && !offline) receiveRelay(relay.report, relay.distance);
  }, [relay.role, relay.report, relay.distance, offline]);

  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    if (offline) return;
    const id = setInterval(
      () =>
        setFeeds((prev) => ({
          ...prev,
          [selected]: {
            ...prev[selected],
            pending: [
              ...scenarioIncoming(scenario, selected, prev[selected].all),
              ...prev[selected].pending,
            ].slice(0, 8),
          },
        })),
      mockConfig.refreshMs,
    );
    return () => clearInterval(id);
  }, [selected, offline, scenario]);
  useEffect(() => {
    if (offline) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const id = setTimeout(() => setLoading(false), mockConfig.delayMs);
    return () => clearTimeout(id);
  }, [selected, offline, scenarioId]);
  async function loadMore() {
    if (moreBusy.current || offline || loading || viewState !== "normal" || blocked) return;
    const target = selected;
    if (!nextPagePosts(feeds[target].all, feeds[target].visible).length) return;
    const version = generation.current;
    moreBusy.current = true;
    setLoadingMore(true);
    await wait(mockConfig.delayMs);
    if (version === generation.current && online.current)
      updateFeed(target, (current) => ({
        ...current,
        visible: [...current.visible, ...nextPagePosts(current.all, current.visible)],
      }));
    moreBusy.current = false;
    setLoadingMore(false);
  }
  function applyNew() {
    if (offline || blocked) return;
    updateFeed(selected, (current) => ({
      ...current,
      all: [...current.pending, ...current.all],
      visible: [...current.pending, ...current.visible],
      pending: [],
      scroll: 0,
    }));
    setToast("새로운 소식을 목록에 반영했어요.");
  }
  function removePost(id: string) {
    updateFeed(selected, (current) => ({
      ...current,
      all: deleteOwnPost(current.all, id),
      visible: deleteOwnPost(current.visible, id),
      pending: deleteOwnPost(current.pending, id),
    }));
    setToast("제보가 삭제되었습니다.");
  }
  function changeScenario(id: string) {
    if (session) return;
    generation.current += 1;
    setScenarioId(id);
    const next = scenarios.find((item) => item.id === id)!;
    const nextFeeds = initialFeeds(next);
    for (const id of ids)
      for (const item of delivery.history[id]) {
        nextFeeds[id].all = upsertReceivedPost(nextFeeds[id].all, item.post);
        nextFeeds[id].visible = upsertReceivedPost(nextFeeds[id].visible, item.post);
      }
    setFeeds(nextFeeds);
    setViewState(next.simulation?.initialView ?? "normal");
    setFailAI(next.simulation?.failFirstReport ?? false);
  }
  function testTtsOutput() {
    if (ttsTestController.current || busy || wakeListening) return;
    const controller = new AbortController();
    ttsTestController.current = controller;
    setTtsTesting(true);
    setTtsTestStatus("알림음 준비 중…");
    void playNotificationChime({
      signal: controller.signal,
      onStart: (engine) => setTtsTestStatus(`재생 중 · ${engine}`),
    })
      .then((engine) => setTtsTestStatus(`알림음 재생 완료 · ${engine}`))
      .catch((error: unknown) => setTtsTestStatus(
        `알림음 실패 · ${error instanceof Error ? error.message : "알 수 없는 오류"}`,
      ))
      .finally(() => {
        if (ttsTestController.current === controller) {
          ttsTestController.current = null;
          if (!controller.signal.aborted) setTtsTesting(false);
        }
      });
  }
  useEffect(() => () => ttsTestController.current?.abort(), []);
  const inPleos = window.GazeeSpeech !== undefined;
  const DemoControls = inPleos ? "details" : "section";

  return (
    <div className={inPleos ? "prototype-page pleos-app" : "prototype-page"}>
      <header className="prototype-heading">
        <div>
          <span className="eyebrow">GAZEE / LOCAL PREVIEW</span>
          <h1>어디가지? 여기가지!</h1>
          <p>차량 커뮤니티 · 개발 미리보기</p>
        </div>
        <span className="environment-badge">
          <span className="status-dot" />
          시뮬레이션 모드
        </span>
      </header>
      <VehicleFrame>
        {inPleos && (
          <div className="vehicle-relay-bar">
            <div>
              <span className="vehicle-relay-badge">{relay.role === "front" ? "앞차 · 제보 차량" : "뒤차 · 수신 차량"}</span>
              <span className="vehicle-relay-status" role="status">
                {relay.role === "front"
                  ? relay.report ? `등록 완료 · ${relay.report.summary}` : "같은 경로의 앞차와 뒤차 시연"
                  : relay.distance > 500 ? "전방 850m · 수신 대기" : "전방 450m · 알림 구간 진입"}
              </span>
            </div>

          </div>
        )}
        <CommunityLayout
          vehicleState={vehicleState}
          time={clock.toLocaleTimeString("ko-KR", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })}
        >
          <main className="main-content" data-restriction-state={drivingRestrictionState}>
            <div className="page-heading">
              <div>
                <span className="eyebrow">
                  {driving ? "주행 모드" : "커뮤니티"}
                </span>
                <h1>{driving ? "운전에 집중하세요" : "지금, 내 주변 소식"}</h1>
                <p className="state-subtitle">
                  {driving
                    ? "새 제보는 알림음으로, 내용은 Gleo에게 요청해 들으세요."
                    : "같은 길을 지나는 운전자들의 제보를 확인하세요."}
                </p>
              </div>
              <span className="live-badge">
                <span className={`status-dot ${offline ? "muted" : ""}`} />
                {offline ? "연결 끊김" : "커뮤니티 연결됨"}
              </span>
            </div>
            <CommunityTabs selected={selected} onChange={setSelected} />
            <div className="community-description">
              <Icon name="info" size={14} />
              {community.description}
            </div>
            <div className={`workspace ${blocked ? "has-overlay" : ""}`}>
              <div
                className="workspace-content"
                inert={blocked ? true : undefined}
                aria-hidden={blocked || undefined}
              >
                {touchSession ? (
                  <Composer
                    session={touchSession}
                    community={communityName(touchSession.community)}
                    onBody={flow.setBody}
                    onBack={flow.cancel}
                    onSubmit={flow.submit}
                    onListen={flow.listen}
                    onRetry={flow.retry}
                    onExample={() => flow.setBody(touchSession.scenario.exampleInput)}
                  />
                ) : (
                  <section className="feed-panel">
                    <div className="feed-heading">
                      <div>
                        <h2>지금, 이곳의 소식</h2>
                        <span>
                          최신순 <i />
                          최근 {mockConfig.historyHours}시간{" "}
                          <span className="setting-note">Mock</span>
                        </span>
                      </div>
                      <ReportEntry onClick={() => flow.begin("touch", selected, scenario)} />
                    </div>
                    {offline && (
                      <div className="offline-banner" role="status">
                        <Icon name="wifi" size={17} />
                        <span>네트워크 연결 끊김 · 마지막 목록 유지</span>
                        <button onClick={() => setOffline(false)}>다시 연결</button>
                      </div>
                    )}
                    {!offline && viewState === "normal" && (
                      <NewPostNotification count={feed.pending.length} onApply={applyNew} />
                    )}
                    <PostList
                      community={selected}
                      posts={feed.visible}
                      loading={loading || viewState === "loading"}
                      empty={viewState === "empty"}
                      offline={offline}
                      scrollTop={feed.scroll}
                      onScroll={(value) => {
                        if (!blocked)
                          updateFeed(selected, (current) => ({ ...current, scroll: value }));
                      }}
                      onMore={loadMore}
                      hasMore={nextPagePosts(feed.all, feed.visible).length > 0}
                      loadingMore={loadingMore}
                      onRetry={() => setOffline(false)}
                      onDelete={removePost}
                    />
                    <div className="feed-footer">
                      <Icon name="refresh" size={12} />
                      {offline
                        ? "자동 갱신 일시 중단"
                        : `${mockConfig.refreshMs / 1000}초마다 새 소식 확인`}
                      <span>모든 글과 차량 근거는 시연용 Mock 데이터입니다.</span>
                    </div>
                  </section>
                )}
              </div>
              {voiceSession ? (
                <div className="report-overlay">
                  <VoiceReport
                    session={voiceSession}
                    community={communityName(voiceSession.community)}
                    onRetry={flow.retry}
                    onCancel={flow.cancel}
                  />
                </div>
              ) : (
                driving && (
                  <DrivingRestrictionPanel
                    voiceWake={
                      window.GazeeMic
                        ? {
                            active: wakeListening,
                            status: wakeStatus,
                            onToggle: () => {
                              setWakeStatus(wakeListening ? "" : "마이크 준비 중…");
                              setWakeListening(!wakeListening);
                            },
                          }
                        : undefined
                    }
                    communityName={community.name}
                    notification={notification}
                    playback={delivery.stateFor(notification?.post.id ?? "")}
                    enabled={tts}
                    onToggle={() => setTts((value) => !value)}
                    offline={offline}
                    onPlay={() => {
                      if (notification) delivery.retryChime(notification);
                    }}
                  />
                )
              )}
            </div>
            <footer className="app-footer">
              <span>
                <Icon name="shield" size={13} />
                이용자 제보는 검증된 사실이 아닙니다.
              </span>
              <span>
                GAZEE <i />
                COMMUNITY
              </span>
            </footer>
          </main>
        </CommunityLayout>
      </VehicleFrame>
      <DemoControls className="simulation-console" aria-label="시연 조작 영역">
        {inPleos && <summary>시연 조작 열기</summary>}
        {inPleos && (
          <div className="relay-demo-controls" aria-label="앞차와 뒤차 시연 제어">
            <strong>{relay.role === "front" ? "앞차 시연" : "뒤차 시연"}</strong>
            {relay.role === "front" ? (
              <button type="button" className="secondary-button" disabled={!relay.report} onClick={relay.showRear}>
                뒤차로 전환
              </button>
            ) : (
              <button type="button" className="secondary-button" disabled={relay.distance <= 500} onClick={relay.approach}>
                450m로 접근
              </button>
            )}
          </div>
        )}
        <div className="console-top">
          <div className="console-label">
            <span className="console-icon">
              <Icon name="flask" size={21} />
            </span>
            <div>
              <h2>시뮬레이션</h2>
              <p>이 영역은 차량 디스플레이에 포함되지 않습니다.</p>
            </div>
          </div>
          <div className="vehicle-control">
            <span>주행 UX 제한</span>
            <div className="segmented">
              {(
                [
                  ["driving", "주행 제한 ON"],
                  ["stopped", "주행 제한 OFF"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  className={(value === "driving" ? driving : !driving) ? "active" : ""}
                  aria-pressed={value === "driving" ? driving : !driving}
                  onClick={() => setVehicleState(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="notification-demo-actions">
            <button
              type="button"
              className="receive-scenario-button"
              onClick={testTtsOutput}
              disabled={ttsTesting || busy || wakeListening}
            >
              <Icon name="speaker" size={17} />
              알림음 테스트
            </button>
            {notificationScenarios.map((item) => (
              <button
                key={item.id}
                className="receive-scenario-button"
                disabled={offline}
                onClick={() => receiveScenario(item.id)}
              >
                <Icon name="spark" size={17} />
                {item.name}
              </button>
            ))}
            <button className="reset-demo-button" onClick={onReset}>
              <Icon name="refresh" size={16} />
              시연 초기화
            </button>
          </div>
          {ttsTestStatus && (
            <div role="status" className="notification-event-trace">
              <span>{ttsTestStatus}</span>
            </div>
          )}
          <button
            className="speech-trigger"
            disabled={!driving || busy}
            onClick={() => flow.begin("voice", selected, scenario)}
          >
            <Icon name="mic" size={19} />
            ‘제보할게’ 발화 시연
            <Icon name="arrow" size={16} />
          </button>
          <button
            className="settings-toggle"
            onClick={() => setDemoOpen((value) => !value)}
            aria-expanded={demoOpen}
          >
            예외 상태 설정
            <Icon name="down" size={15} />
          </button>
        </div>
        {demoOpen && (
          <div className="console-details">
            <div className="notification-event-trace">
              <span>
                <Icon name="info" size={14} />
                수신 시뮬레이션은 현재 선택된 탭에만 전달합니다.
              </span>
              <span>Mock 게시글 생성 → 450 m 접근 이벤트 → 알림음 1회 · 카드 유지 · 읽기는 Gleo 요청</span>
              <b>수신 {receivedCount}건</b>
            </div>
            <div className="demo-options">
              <label>
                기존 작성 시연 · 차량 상태
                <select
                  value={vehicleState}
                  onChange={(e) => setVehicleState(e.target.value as VehicleState)}
                >
                  <option value="driving">주행 제한</option>
                  <option value="stopped">정차 D</option>
                  <option value="parked">주차 P</option>
                </select>
              </label>
              <label>
                음성 인식 · 다음 1회
                <select
                  value={speechFault}
                  disabled={speechActive}
                  onChange={(e) => setSpeechFault(e.target.value as SpeechFault)}
                >
                  <option value="none">정상 인식</option>
                  <option value="stt">음성 인식 실패</option>
                  <option value="insufficient">발화 내용 부족</option>
                </select>
              </label>
              <label>
                Gemini · 다음 1회
                <select
                  value={failAI ? "fail" : "success"}
                  disabled={session?.phase === "processing"}
                  onChange={(e) => setFailAI(e.target.value === "fail")}
                >
                  <option value="success">처리 성공</option>
                  <option value="fail">처리 실패</option>
                </select>
              </label>
              <label>
                시나리오
                <select
                  value={scenarioId}
                  disabled={!!session}
                  onChange={(e) => changeScenario(e.target.value)}
                >
                  {scenarios.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                목록 상태
                <select
                  value={viewState}
                  onChange={(e) => setViewState(e.target.value as FeedView)}
                >
                  <option value="normal">기본 목록</option>
                  <option value="empty">게시글 없음</option>
                  <option value="loading">불러오는 중</option>
                </select>
              </label>
              <label className="checkbox-option">
                <input
                  type="checkbox"
                  checked={vehicleUnavailable}
                  disabled={session?.phase === "processing"}
                  onChange={(e) => setVehicleUnavailable(e.target.checked)}
                />
                차량 데이터 조회 실패
              </label>
              <label className="checkbox-option">
                <input
                  type="checkbox"
                  checked={noSimilar}
                  disabled={session?.phase === "processing"}
                  onChange={(e) => setNoSimilar(e.target.checked)}
                />
                유사 글 없음
              </label>
              <label className="checkbox-option">
                <input
                  type="checkbox"
                  checked={offline}
                  onChange={(e) => setOffline(e.target.checked)}
                />
                네트워크 연결 끊김
              </label>
            </div>
            <div className="trace-strip">
              <span>
                <Icon name="spark" size={14} />
                Gemini Mock 호출 <b data-testid="ai-call-count">{calls}회</b>
              </span>
              <span>
                {lastInput
                  ? `최근 입력 · 본문 ${lastInput.body.length}자 / 차량 ${Object.keys(lastInput.vehicleData).length}개 필드 / 유사 글 ${lastInput.similarPosts.length}개`
                  : "원본 본문·모의 차량 데이터·같은 커뮤니티의 기존 글을 한 번에 전달합니다."}
              </span>
              <button
                disabled={offline}
                onClick={() =>
                  updateFeed(selected, (current) => ({
                    ...current,
                    pending: [...makeIncoming(scenario, selected, 2), ...current.pending],
                  }))
                }
              >
                새 글 2개 도착
                <Icon name="plus" size={13} />
              </button>
            </div>
          </div>
        )}
      </DemoControls>
      <div className="journey-guide">
        <span>
          <b>01</b>주행 제한 ON → 블랙아이스 수신
        </span>
        <span>
          <b>02</b>탭 전환 → 기존 카드 복구 · 중복 알림음 없음
        </span>
        <span>
          <b>03</b>주행 제한 OFF → 커뮤니티 목록
        </span>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Icon name="check" size={18} />
          {toast}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [demoVersion, setDemoVersion] = useState(0);
  const [role, setRole] = useState<RelayDemo["role"]>("front");
  const [report, setReport] = useState<Post | null>(null);
  const [distance, setDistance] = useState(850);
  function reset() {
    setRole("front");
    setReport(null);
    setDistance(850);
    setDemoVersion((value) => value + 1);
  }
  return (
    <RoadtownPrototype
      key={`${demoVersion}-${role}`}
      onReset={reset}
      relay={{
        role,
        report,
        distance,
        publish: setReport,
        showRear: () => { setRole("rear"); window.scrollTo(0, 0); },
        approach: () => { setDistance(450); window.scrollTo(0, 0); },
      }}
    />
  );
}
