import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
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
import { AppOnboarding } from "./components/AppOnboarding";
import { SimulationWorkspace } from "./components/SimulationWorkspace";
import { Icon } from "./components/Icon";
import {
  communities,
  CURRENT_USER_ID,
  mockConfig,
  type CommunityId,
  type Category,
  type FeedView,
  type Post,
  type SpeechFault,
  type VehicleState,
} from "./domain/types";
import { scenarios } from "./scenarios";
import { congestion, matchesIncheonCongestion } from "./scenarios/congestion";
import { blackIce, matchesInhaBlackIce } from "./scenarios/blackIce";
import {
  createPosts,
  deleteOwnPost,
  makeIncoming,
  nextPagePosts,
  pagePosts,
  wait,
  type ReportAIInput,
} from "./services/mockCommunity";
import { useReportFlow } from "./hooks/useReportFlow";
import { useNotificationDelivery } from "./hooks/useNotificationDelivery";
import {
  makeFrontDemoPost,
  makeRearNotification,
  type MockNotificationData,
  upsertReceivedPost,
  type CommunitySelectionState,
  type DrivingRestrictionState,
} from "./domain/notifications";
import {
  DICTATION_REQUIRES_STOPPED,
  notificationScenarios,
  simulationTabs,
  type SimulationTab,
} from "./scenarios/notifications";
import { preferredPosts } from "./domain/preferences";

import { listenWithAppMic } from "./services/appMic";
import { playMockTTS } from "./services/mockTTS";
import { playNotificationChime } from "./services/notificationChime";
import { matchesDemoUtterance, normalizeGleoReport, voiceCommandBody, type MissingReportField } from "./services/reportInput";

declare global {
  interface Window {
    GazeeVehicle?: { ready(): void };
    applyGazeeVehicleScreen?: (mode: VehicleScreen) => true;
    applyGazeeDemoMotion?: (state: VehicleState) => void;
    selectGazeeDemoRole?: (role: RelayDemo["role"]) => "ok" | "app-not-ready" | "report-required";
    GazeeGleo?: {
      ready(): void;
      complete(requestId: string, success: boolean): void;
      requestDetails(requestId: string, missing: MissingReportField): void;
      completeRead(requestId: string, announcement: string): void;
    };
  }
}

type VehicleScreen = "NORMAL" | "LIMITED" | "DRIVING";
const silentPlayback = { status: "idle", detail: "" } as const;

function VehicleRestrictionScreen({
  mode,
  selected = "nearby",
  onSelect,
  notification,
  relay,
}: {
  mode: Exclude<VehicleScreen, "NORMAL">;
  selected?: CommunityId;
  onSelect?: (id: CommunityId) => void;
  notification?: MockNotificationData;
  relay?: RelayDemo;
}) {
  const community = communities.find((item) => item.id === selected)!;
  const driving = mode === "DRIVING";
  return (
    <div className="prototype-page pleos-app vehicle-restriction-screen" inert={onSelect ? undefined : true}>
      <VehicleFrame>
        <main className="main-content" data-vehicle-screen={mode}>
          <div className="page-heading">
            <div>
              {driving && <span className="eyebrow">주행 모드</span>}
              <h1>{driving ? "운전에 집중하세요" : "게시글 목록이 제한돼요"}</h1>
              <p className="state-subtitle">
                {driving ? "새 제보는 수신 카드로 확인하세요." : "게시글은 주차 후 확인할 수 있어요."}
              </p>
            </div>
          </div>
          {driving && (
            <>
              <CommunityTabs selected={selected} onChange={onSelect ?? (() => {})} />
              <div className="community-description">
                <Icon name="info" size={14} />
                {community.description}
              </div>
              <DrivingRestrictionPanel
                communityName={community.name}
                notification={notification}
                playback={silentPlayback}
                enabled={false}
                onPlay={() => {}}
                readOnly
              />
              <footer className="app-footer">
                <span><Icon name="shield" size={13} />이용자 제보는 검증된 사실이 아닙니다.</span>
                <span>GAZEE <i /> COMMUNITY</span>
              </footer>
            </>
          )}
        </main>
      </VehicleFrame>
      {relay && (
        <details className="simulation-console" aria-label="시연 조작 영역">
          <summary>시연 조작 열기</summary>
          <DemoVehicleControls relay={relay} />
        </details>
      )}
    </div>
  );
}

type GleoReportPayload = { body: string; location?: string; condition?: string; utterance?: string };

const REAR_APPROACH_DELAY_MS = 15_000;

type RelayReport = { post: Post; simulation: SimulationTab };

type RelayDemo = {
  role: "front" | "rear";
  report: RelayReport | null;
  publishedReports: RelayReport[];
  distance: number;
  publish: (report: RelayReport) => void;
  removePublished: (id: string) => void;
  selectRole: (role: RelayDemo["role"]) => void;
};

function DemoVehicleControls({ relay }: { relay: RelayDemo }) {
  const front = relay.role === "front";
  return (
    <div className="relay-demo-controls" aria-label="앞차와 뒤차 시연 제어">
      <span className="vehicle-relay-badge">{front ? "앞차 · 제보 차량" : "뒤차 · 수신 차량"}</span>
      <span className="vehicle-relay-status" role="status">
        {front
          ? relay.report ? "등록 완료 · " + relay.report.post.summary : "앞차 제보를 등록하면 뒤차로 전환할 수 있어요."
          : `전방 ${relay.distance}m · ${relay.distance > 500 ? "접근 중" : "수신 완료"}`}
      </span>
      <button
        type="button"
        className="secondary-button"
        disabled={front && !relay.report}
        onClick={() => relay.selectRole(front ? "rear" : "front")}
      >
        {front ? "뒤차로 전환" : "앞차로 전환"}
      </button>
    </div>
  );
}

type Feed = { all: Post[]; visible: Post[]; pending: Post[]; scroll: number };
type CommunityPostData = Record<CommunityId, Feed>;
const ids: CommunityId[] = ["nearby", "direction", "destination"];
const communityName = (id: CommunityId) => communities.find((item) => item.id === id)!.name;
// Board content is independent of the selected report simulation.
const boardExamples = scenarios.flatMap((scenario) => scenario.examples);
const boardSeeds = Object.fromEntries(
  ids.map((id, index) => [id, {
    ...scenarios[0],
    id: `board-${id}`,
    examples: [...boardExamples.slice(index), ...boardExamples.slice(0, index)],
  }]),
) as Record<CommunityId, (typeof scenarios)[number]>;
function initialFeeds(preferredCategories: Category[], relay: RelayDemo) {
  return Object.fromEntries(
    ids.map((id) => {
      const scenario = boardSeeds[id];
      const published = relay.publishedReports
        .filter(({ post }) => post.community === id)
        .map(({ post }) => relay.role === "front" ? post : { ...post, authorId: undefined });
      const all = [...published, ...createPosts(scenario, id)]
        .sort((a, b) => b.createdAt - a.createdAt);
      return [
        id,
        {
          all,
          visible: pagePosts(preferredPosts(all, preferredCategories), 0),
          pending:
            id === "nearby"
              ? makeIncoming(scenario, id, 2)
              : [],
          scroll: 0,
        },
      ];
    }),
  ) as Record<CommunityId, Feed>;
}
function RoadtownPrototype({ onReset, preferredCategories, relay, vehicleScreen, vehicleState, setVehicleState }: {
  vehicleScreen: VehicleScreen;
  vehicleState: VehicleState;
  setVehicleState: (state: VehicleState) => void;
  relay: RelayDemo;
  onReset: () => void;
  preferredCategories: Category[];
}) {
  const [selected, setSelected] = useState<CommunitySelectionState>(relay.report?.post.community ?? "nearby");
  const receivedRelayId = useRef<string | null>(null);
  const gleoRequest = useRef<string | null>(null);
  const [scenarioId, setScenarioId] = useState(relay.report?.simulation.reportScenarioId ?? scenarios[0].id);
  const [gleoDemo, setGleoDemo] = useState<{ scenarioId: string; community: CommunityId } | null>(null);
  const scenario = scenarios.find((item) => item.id === scenarioId)!;
  const simulation = simulationTabs.find((tab) => tab.reportScenarioId === scenarioId)!;
  const [feeds, setFeeds] = useState<CommunityPostData>(() => initialFeeds(preferredCategories, relay));
  const readOnly = vehicleScreen === "LIMITED";
  const driving = !readOnly && vehicleState === "driving";
  const drivingRestrictionState: DrivingRestrictionState = driving
    ? "DRIVING_RESTRICTED"
    : "UNRESTRICTED";
  const [openedReport, setOpenedReport] = useState<{ community: CommunityId; id: string } | null>(null);
  const [wakeListening, setWakeListening] = useState(false);
  const [wakeStatus, setWakeStatus] = useState("");
  const [ttsTestStatus, setTtsTestStatus] = useState("");
  const [ttsTesting, setTtsTesting] = useState(false);
  const [reportSpeechStatus, setReportSpeechStatus] = useState("");
  const reportSpeechController = useRef<AbortController | null>(null);
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
  const moreBusy = useRef(false);
  const online = useRef(!offline);
  online.current = !offline;
  const feed = feeds[selected];
  const visiblePosts = preferredPosts(feed.visible, preferredCategories);
  const pendingPosts = preferredPosts(feed.pending, preferredCategories);
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
    onPublished: (result, { mode, voiceInput, scriptedExample }) => {
      const post = relay.role === "front" && (mode === "voice" || voiceInput === "mic" || scriptedExample)
        ? makeFrontDemoPost(result, simulation.notification, !vehicleUnavailable)
        : result;
      updateFeed(post.community, (current) => ({
        ...current,
        all: [post, ...current.all],
        visible: [post, ...current.visible],
        scroll: 0,
      }));
      if (relay.role === "front") relay.publish({ post, simulation });
      if (voiceInput === "gleo" && gleoRequest.current) {
        window.GazeeGleo?.complete(gleoRequest.current, true);
        gleoRequest.current = null;
      }
      setSelected(post.community);
      window.scrollTo(0, 0);
      setViewState(scenario.simulation?.afterReportView ?? "normal");
      setToast("제보가 등록되었습니다.");
    },
  });
  const session = flow.session;
  const voiceSession = session?.mode === "voice" ? session : null;
  const touchSession = !readOnly && session?.mode === "touch" ? session : null;
  const blocked = driving || (!readOnly && !!voiceSession);
  const busy = !!session && ["listening", "processing", "success"].includes(session.phase);
  const speechActive = session?.phase === "listening" || session?.phase === "processing";
  const delivery = useNotificationDelivery({
    enabled: true,
    paused: vehicleScreen !== "NORMAL" || !!speechActive || wakeListening || ttsTesting,
  });
  const acceptGleo = useEffectEvent((requestId: string, report: GleoReportPayload) => {
    const details = report.location !== undefined || report.condition !== undefined || report.utterance !== undefined
      ? { location: report.location ?? "", condition: report.condition ?? "", utterance: report.utterance?.trim() || undefined }
      : undefined;
    const title = normalizeGleoReport(report.body ?? "")
      || normalizeGleoReport(details ? `${details.location} ${details.condition}` : "")
      || normalizeGleoReport(details?.utterance ?? "");
    // Filming build: accept partial Gleo reports in every scenario and demo role.
    // Keep empty-input validation and the existing platform interaction restrictions.
    const allowIncompleteDemoSpeech = true;
    const demo = gleoDemo?.scenarioId === scenarioId
      ? simulationTabs.find((tab) => tab.reportScenarioId === scenarioId && tab.reportMode === "voice")
      : undefined;
    const fixedScenario = matchesIncheonCongestion(details?.utterance, title) ? congestion
      : matchesInhaBlackIce(details?.utterance, title) ? blackIce : undefined;
    const reportScenario = fixedScenario ?? scenario;
    const scriptedExample = !!fixedScenario || (!!demo && matchesDemoUtterance(details?.utterance || title, scenario.exampleInput));
    if (!title && !scriptedExample && allowIncompleteDemoSpeech) {
      window.GazeeGleo?.complete(requestId, false);
      return;
    }
    const body = scriptedExample ? reportScenario.exampleInput : title;
    if (!flow.begin("voice", demo ? gleoDemo!.community : selected, reportScenario, body, "gleo", details, {
      scriptedExample,
      allowIncompleteDemoSpeech,
      simulationCategory: scriptedExample || demo ? reportScenario.category : undefined,
    })) {
      window.GazeeGleo?.complete(requestId, false);
      return;
    }
    gleoRequest.current = requestId;
    setGleoDemo(null);
    setWakeListening(false);
  });
  const readForGleo = useEffectEvent((requestId: string) => {
    const received = openedReport?.community === selected
      ? delivery.history[selected].find((item) => item.post.id === openedReport.id)
      : delivery.history[selected][0]
      ?? Object.values(delivery.history).flat().sort((a, b) => b.receivedAt - a.receivedAt)[0];
    window.GazeeGleo?.completeRead(requestId, received?.speech ?? "");
  });
  useEffect(() => {
    const bridge = window.GazeeGleo;
    if (!bridge) return;
    function receive(event: Event) {
      const { id, report } = (event as CustomEvent<{ id: string; report: GleoReportPayload }>).detail;
      acceptGleo(id, report);
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
    flow.begin("voice", selected, scenario, body, "mic");
  });
  const canListenForWake = vehicleScreen === "NORMAL" && driving && !voiceSession && !busy;
  useEffect(() => {
    if (!wakeListening) return;
    if (!canListenForWake) {
      setWakeListening(false);
      return;
    }
    return listenWithAppMic({
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
  const openedNotification = !driving && openedReport?.community === selected
    ? delivery.history[selected].find((item) => item.post.id === openedReport.id)
    : undefined;
  const displayedNotification = openedNotification ?? notification;
  useEffect(() => { setOpenedReport(null); }, [selected, driving, scenarioId]);
  const latestOwnPost = visiblePosts.find((post) => post.authorId === CURRENT_USER_ID);
  const publishedPost = latestOwnPost && (!notification || latestOwnPost.createdAt >= notification.receivedAt)
    ? latestOwnPost
    : undefined;
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
    setGleoDemo(null);
    // Receiving a report must not change the selected driving restriction mode.
    setOpenedReport(null);
    setViewState("normal");
    receivePost(event);
    window.scrollTo(0, 0);
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

  const receiveRelay = useEffectEvent(({ post, simulation }: RelayReport, distance: number) => {
    if (receivedRelayId.current === post.id) return;
    const event = makeRearNotification(post, distance, simulation.notification);
    if (!event) return;
    receivedRelayId.current = post.id;
    // The board already contains the published post. Keep its publication time
    // while showing the receiver's scripted card and playing its chime.
    delivery.receive(event);
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
              ...makeIncoming(boardSeeds[selected], selected, 1),
              ...prev[selected].pending,
            ].slice(0, 8),
          },
        })),
      mockConfig.refreshMs,
    );
    return () => clearInterval(id);
  }, [selected, offline]);
  useEffect(() => {
    if (offline) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const id = setTimeout(() => setLoading(false), mockConfig.delayMs);
    return () => clearTimeout(id);
  }, [selected, offline]);
  async function loadMore() {
    if (moreBusy.current || offline || loading || viewState !== "normal" || blocked) return;
    const target = selected;
    if (!nextPagePosts(preferredPosts(feeds[target].all, preferredCategories), feeds[target].visible).length) return;
    moreBusy.current = true;
    setLoadingMore(true);
    await wait(mockConfig.delayMs);
    if (online.current)
      updateFeed(target, (current) => ({
        ...current,
        visible: [...current.visible, ...nextPagePosts(preferredPosts(current.all, preferredCategories), current.visible)],
      }));
    moreBusy.current = false;
    setLoadingMore(false);
  }
  function applyNew() {
    if (offline || blocked) return;
    updateFeed(selected, (current) => ({
      ...current,
      all: [...current.pending, ...current.all].sort((a, b) => b.createdAt - a.createdAt),
      visible: [...preferredPosts(current.pending, preferredCategories), ...current.visible]
        .sort((a, b) => b.createdAt - a.createdAt),
      pending: [],
      scroll: 0,
    }));
    setToast("새로운 소식을 목록에 반영했어요.");
  }
  function removePost(id: string) {
    if (relay.role === "front") relay.removePublished(id);
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
    setScenarioId(id);
    setGleoDemo(null);
    const next = scenarios.find((item) => item.id === id)!;
    setFailAI(next.simulation?.failFirstReport ?? false);
  }
  function readReceivedReport() {
    if (!displayedNotification || ttsTesting || reportSpeechController.current || session || wakeListening || vehicleScreen !== "NORMAL") return;
    const controller = new AbortController();
    reportSpeechController.current = controller;
    setTtsTesting(true);
    setReportSpeechStatus("Pleos TTS 준비 중…");
    void playMockTTS(displayedNotification.speech, {
      signal: controller.signal, manual: true, sdkOnly: true,
      onProgress: setReportSpeechStatus,
      onStart: (engine) => setReportSpeechStatus(`제보 음성 안내 중 · ${engine}`),
    }).then((engine) => {
      if (!controller.signal.aborted) setReportSpeechStatus(`제보 음성 안내 완료 · ${engine}`);
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setReportSpeechStatus(`음성 안내 실패 · ${error instanceof Error ? error.message : "알 수 없는 오류"}`);
    }).finally(() => {
      if (reportSpeechController.current === controller) {
        reportSpeechController.current = null;
        setTtsTesting(false);
      }
    });
  }
  useEffect(() => {
    if (session || wakeListening || vehicleScreen !== "NORMAL") {
      reportSpeechController.current?.abort();
      setReportSpeechStatus("");
    }
  }, [session?.id, wakeListening, vehicleScreen]);
  useEffect(() => {
    setReportSpeechStatus("");
    return () => { reportSpeechController.current?.abort(); };
  }, [displayedNotification?.post.id, openedReport?.id, selected, scenarioId]);
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

  if (vehicleScreen === "DRIVING") {
    return (
      <VehicleRestrictionScreen
        mode={vehicleScreen}
        selected={selected}
        onSelect={setSelected}
        notification={notification}
        relay={relay}
      />
    );
  }

  return (
    <div className={inPleos ? "prototype-page pleos-app" : "prototype-page"} inert={readOnly || undefined}>
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
        <CommunityLayout
          vehicleState={vehicleState}
          readOnly={readOnly}
          time={clock.toLocaleTimeString("ko-KR", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })}
        >
          <main className="main-content" data-vehicle-screen={vehicleScreen} data-restriction-state={drivingRestrictionState}>
            <div className="page-heading">
              <div>
                <span className="eyebrow">
                  {driving ? "주행 모드" : "커뮤니티"}
                </span>
                <h1>{driving ? "운전에 집중하세요" : "지금, 내 주변 소식"}</h1>
                <p className="state-subtitle">
                  {readOnly
                    ? "글 작성과 화면 조작은 주차 후 사용할 수 있어요."
                    : driving
                    ? "새 제보는 알림음으로 알려드려요. 내용은 GLEO에게 물어보세요."
                    : inPleos
                      ? "Gleo에게 장소와 상황을 말해 제보할 수 있어요."
                      : "같은 길을 지나는 운전자들의 제보를 확인하세요."}
                </p>
              </div>
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
                ) : openedNotification ? null : (
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
                      <ReportEntry onClick={() => flow.begin("touch", selected, scenario, undefined, "mock", undefined, {
                        allowIncompleteDemoSpeech: relay.role === "front" && vehicleScreen === "NORMAL",
                      })} />
                    </div>
                    {offline && (
                      <div className="offline-banner" role="status">
                        <Icon name="wifi" size={17} />
                        <span>네트워크 연결 끊김 · 마지막 목록 유지</span>
                        <button onClick={() => setOffline(false)}>다시 연결</button>
                      </div>
                    )}
                    {!offline && viewState === "normal" && (
                      <NewPostNotification count={pendingPosts.length} onApply={applyNew} />
                    )}
                    <PostList
                      community={selected}
                      posts={visiblePosts}
                      readOnly={readOnly}
                      loading={loading || viewState === "loading"}
                      empty={viewState === "empty"}
                      offline={offline}
                      scrollTop={feed.scroll}
                      onScroll={(value) => {
                        if (!blocked)
                          updateFeed(selected, (current) => ({ ...current, scroll: value }));
                      }}
                      onMore={loadMore}
                      hasMore={nextPagePosts(preferredPosts(feed.all, preferredCategories), feed.visible).length > 0}
                      loadingMore={loadingMore}
                      onRetry={() => setOffline(false)}
                      onDelete={removePost}
                      canOpen={(post) => delivery.history[selected].some((item) => item.post.id === post.id)}
                      onOpen={(post) => {
                        if (blocked || readOnly) return;
                        setOpenedReport({ community: selected, id: post.id });
                        window.scrollTo(0, 0);
                      }}
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
              {!readOnly && voiceSession ? (
                <div className="report-overlay">
                  <VoiceReport
                    session={voiceSession}
                    community={communityName(voiceSession.community)}
                    onRetry={flow.retry}
                    onCancel={() => {
                      if (gleoRequest.current) window.GazeeGleo?.complete(gleoRequest.current, false);
                      gleoRequest.current = null;
                      flow.cancel();
                    }}
                  />
                </div>
              ) : (
                (driving || openedNotification) && (
                  <DrivingRestrictionPanel
                    communityName={community.name}
                    notification={displayedNotification}
                    publishedPost={driving ? publishedPost : undefined}
                    onBack={!driving ? () => setOpenedReport(null) : undefined}
                    playback={delivery.stateFor(displayedNotification?.post.id ?? "")}
                    speechAction={{
                      onPlay: readReceivedReport,
                      enabled: !!displayedNotification && !session && !wakeListening && !ttsTesting && vehicleScreen === "NORMAL",
                      status: reportSpeechStatus,
                      playing: !!reportSpeechController.current && ttsTesting,
                    }}
                    enabled
                    voiceAction={window.GazeeMic ? (
                      relay.role === "front" && !gleoDemo
                        ? {
                            label: "음성으로 제보",
                            hint: "마이크 버튼을 누르고 제보할 내용을 말해 주세요.",
                            onClick: () => {
                              setGleoDemo(null);
                              if (flow.begin("voice", selected, scenario, undefined, "mic", undefined, {
                                allowIncompleteDemoSpeech: true,
                              })) {
                                window.scrollTo(0, 0);
                              }
                            },
                          }
                        : {
                            label: wakeListening ? "음성 호출 끄기" : "음성 호출 켜기",
                            hint: wakeStatus || "마이크를 켜고 “제보할게”라고 말해 주세요.",
                            pressed: wakeListening,
                            onClick: () => setWakeListening((value) => !value),
                          }
                    ) : undefined}
                    onPlay={() => {
                      if (displayedNotification) delivery.retryChime(displayedNotification);
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
      {!readOnly && <>
      <DemoControls className="simulation-console" aria-label="시연 조작 영역">
        {inPleos && <summary>시연 조작 열기</summary>}
        <DemoVehicleControls relay={relay} />
        <div className="console-top">
          <div className="console-label">
            <span className="console-icon">
              <Icon name="flask" size={21} />
            </span>
            <div>
              <h2>시뮬레이션</h2>
              <p>역할·거리·가상 주행 상태를 조작하는 시연 전용 영역입니다.</p>
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
            <button type="button" className="receive-scenario-button" onClick={testTtsOutput} disabled={ttsTesting || busy || wakeListening}>
              <Icon name="speaker" size={17} />알림음 테스트
            </button>
            {ttsTestStatus && <span role="status">{ttsTestStatus}</span>}
            <button className="reset-demo-button" onClick={onReset}>
              <Icon name="refresh" size={16} />
              시연 초기화
            </button>
          </div>
          <button
            className="settings-toggle"
            onClick={() => setDemoOpen((value) => !value)}
            aria-expanded={demoOpen}
          >
            예외 상태 설정
            <Icon name="down" size={15} />
          </button>
        </div>
        <SimulationWorkspace
          scenarioId={scenarioId}
          disabled={!!session}
          canReport={!busy && !offline}
          canReceive={!offline && !session}
          onSelect={changeScenario}
          onGleo={window.GazeeGleo && vehicleScreen === "NORMAL" ? () => {
            setWakeListening(false);
            setOpenedReport(null);
            setGleoDemo(gleoDemo ? null : { scenarioId, community: selected });
            // Show the existing waiting card before the first report arrives.
            // Starting a Gleo demo does not switch roles or fabricate a report.
            if (driving && !gleoDemo) window.scrollTo(0, 0);
          } : undefined}
          gleoExample={gleoDemo ? simulationTabs.find((tab) => tab.reportScenarioId === gleoDemo.scenarioId)?.gleoExample : undefined}
          onReport={() => {
            setGleoDemo(null);
            if (simulation.reportMode !== "dictation") {
              flow.beginVoiceDemo(selected, scenario, simulation.speed);
              window.scrollTo(0, 0);
              return;
            }
            if (driving) setToast(DICTATION_REQUIRES_STOPPED);
            else if (session) setToast("작성 중인 제보를 먼저 등록하거나 취소해 주세요.");
            else {
              flow.beginDictationDemo(selected, scenario, simulation.speed);
              window.scrollTo(0, 0);
            }
          }}
          onReceive={receiveScenario}
        />
        {demoOpen && (
          <div className="console-details">
            <div className="notification-event-trace">
              <span>
                <Icon name="info" size={14} />
                수신 시뮬레이션은 현재 선택된 탭에만 전달합니다.
              </span>
              <span>시나리오 수신 → 제보 카드 표시 및 알림음 1회</span>
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
                    pending: [...makeIncoming(boardSeeds[selected], selected, 2), ...current.pending],
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
      </>}
      {!readOnly && toast && (
        <div className="toast" role="status">
          <Icon name="check" size={18} />
          {toast}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [vehicleScreen, setVehicleScreen] = useState<VehicleScreen>("NORMAL");
  const initialVehicleState = window.GazeeVehicle ? "parked" : "driving";
  const [vehicleState, setVehicleState] = useState<VehicleState>(initialVehicleState);
  const demoMotion = useRef<VehicleState | null>(null);
  useLayoutEffect(() => {
    const bridge = window.GazeeVehicle;
    if (!bridge) return;
    window.applyGazeeVehicleScreen = (mode) => {
      flushSync(() => setVehicleScreen(mode));
      return true;
    };
    window.applyGazeeDemoMotion = (state) => {
      demoMotion.current = state;
      setVehicleState(state);
    };
    bridge.ready();
    return () => {
      delete window.applyGazeeVehicleScreen;
      delete window.applyGazeeDemoMotion;
    };
  }, []);
  const [demoVersion, setDemoVersion] = useState(0);
  const [preferredCategories, setPreferredCategories] = useState<Category[] | null>(null);
  const [role, setRole] = useState<RelayDemo["role"]>("front");
  const [publishedReports, setPublishedReports] = useState<RelayReport[]>([]);
  const report = publishedReports[0] ?? null;
  const [distance, setDistance] = useState(850);
  useEffect(() => {
    if (role !== "rear" || !report) return;
    const targetDistance = report.simulation.notification.createEvent(report.post.community).distanceMeters;
    const timer = window.setTimeout(() => setDistance(targetDistance), REAR_APPROACH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [role, report]);

  const selectRole = useCallback((next: RelayDemo["role"]) => {
    if (!preferredCategories) return "app-not-ready";
    if (next === "rear" && !report) return "report-required";
    if (role !== next) {
      setDistance(850);
      setRole(next);
      window.scrollTo(0, 0);
    }
    return "ok";
  }, [preferredCategories, report, role]);
  useLayoutEffect(() => {
    if (!window.GazeeVehicle) return;
    window.selectGazeeDemoRole = selectRole;
    return () => { delete window.selectGazeeDemoRole; };
  }, [selectRole]);

  function reset() {
    setRole("front");
    setPublishedReports([]);
    setVehicleState(demoMotion.current ?? initialVehicleState);
    setDistance(850);
    setDemoVersion((value) => value + 1);
  }
  const showCommunity = preferredCategories !== null || vehicleScreen === "LIMITED";
  return (
    <>
      {!preferredCategories && (
        <div className={window.GazeeMic ? "pleos-app onboarding-host" : "onboarding-host"}
          style={vehicleScreen === "NORMAL" ? undefined : { display: "none" }}>
          <AppOnboarding onComplete={setPreferredCategories} />
        </div>
      )}
      {showCommunity ? (
        <RoadtownPrototype
          preferredCategories={preferredCategories ?? ["교통", "도로 위험", "주차", "지역 정보"]}
          vehicleScreen={vehicleScreen}
          vehicleState={vehicleState}
          setVehicleState={setVehicleState}
          key={`${demoVersion}-${role}`}
          onReset={reset}
          relay={{
            role,
            report,
            publishedReports,
            distance,
            publish: (newReport) => setPublishedReports((previous) => [newReport, ...previous]),
            removePublished: (id) => setPublishedReports((previous) =>
              previous.filter(({ post }) => post.id !== id)),
            selectRole,
          }}
        />
      ) : vehicleScreen === "DRIVING" ? <VehicleRestrictionScreen mode="DRIVING" /> : null}
    </>
  );
}
