import { Icon } from "./Icon";

export function MockNavigation({ approached }: { approached: boolean }) {
  const distance = approached ? 450 : 850;
  return (
    <aside
      className={`mock-navigation ${approached ? "approached" : ""}`}
      aria-label="Mock 내비게이션"
    >
      <div className="navigation-header">
        <div>
          <Icon name="route" size={19} />
          <span>내비게이션</span>
        </div>
        <span>MOCK NAV</span>
      </div>
      <div className="navigation-turn">
        <div className="turn-direction">
          <Icon name="arrow" size={28} />
        </div>
        <div>
          <b>
            {distance} <span>m</span>
          </b>
          <p>성수대교 진입부 방면</p>
        </div>
        <span className="navigation-route-number">61</span>
      </div>
      <div className="navigation-map">
        <svg
          viewBox="0 0 360 590"
          role="img"
          aria-label="성수대교 진입부 접근 상황을 표현한 시연용 모의 지도"
          preserveAspectRatio="xMidYMid slice"
        >
          <defs>
            <pattern
              id="nav-blocks"
              x="0"
              y="0"
              width="82"
              height="64"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(-16)"
            >
              <rect x="7" y="6" width="66" height="48" rx="5" fill="#e6e7e3" />
              <path d="M0 0h82v64" fill="none" stroke="#fafbf8" strokeWidth="8" />
            </pattern>
            <filter id="nav-shadow">
              <feDropShadow dx="0" dy="3" stdDeviation="4" floodOpacity=".12" />
            </filter>
          </defs>
          <rect width="360" height="590" fill="url(#nav-blocks)" />
          <path
            d="M-60 385C100 345 235 490 410 345"
            stroke="#c6dce3"
            strokeWidth="114"
            fill="none"
          />
          <path
            d="M-40 225 400 145M40-50 150 650M280-30 210 650"
            stroke="#fbfcf9"
            strokeWidth="17"
            fill="none"
          />
          <path d="M-30 293C90 228 188 276 390 215" stroke="#fdfefb" strokeWidth="25" fill="none" />
          <path
            d="M172 650 201 335Q207 289 152 269L111 228"
            stroke="#fcfcfa"
            strokeWidth="25"
            fill="none"
          />
          <path
            d="M172 650 201 335Q207 289 152 269L111 228"
            stroke="#d9c5ed"
            strokeWidth="12"
            fill="none"
          />
          <path
            d="M172 650 201 335Q207 289 152 269L111 228"
            stroke="#9b72c8"
            strokeWidth="6"
            fill="none"
          />
          <path d="M184 500 196 368" stroke="#f0e8f8" strokeWidth="2" strokeDasharray="5 7" />
          <text x="35" y="96" fill="#a8a9a2" fontSize="12">
            서울숲
          </text>
          <text x="251" y="126" fill="#a8a9a2" fontSize="12">
            성수동
          </text>
          <text x="37" y="432" fill="#91b0ba" fontSize="13" letterSpacing="8">
            한강
          </text>
          <text
            transform="translate(247 440) rotate(-84)"
            fill="#abafb0"
            fontSize="10"
            letterSpacing="2"
          >
            성수대교
          </text>
          <g transform="translate(111 227)" filter="url(#nav-shadow)">
            <circle r="20" fill="#fff" stroke="#dac8ec" />
            <path d="m-5 7 2-17h12v10H-3" fill="none" stroke="#a17ac7" strokeWidth="2" />
            <circle cx="-3" cy="-10" r="2" fill="#a17ac7" />
          </g>
          <g
            className="navigation-car-marker"
            transform={approached ? "translate(197 356)" : "translate(184 486)"}
            filter="url(#nav-shadow)"
          >
            <circle r="29" fill="#aa88d5" fillOpacity=".12" />
            <circle r="20" fill="#fff" />
            <path d="m0-13 11 22L0 5-11 9Z" fill="#9b70c9" />
          </g>
        </svg>
        <span className="navigation-map-label">성수대교 진입부</span>
        {approached && (
          <div className="navigation-distance">
            <span className="status-dot" />
            위험 구간 약 450 m 앞 · Mock 이벤트
          </div>
        )}
      </div>
      <div className="navigation-footer">
        <div>
          <Icon name="flag" size={16} />
          <span>성수대교 진입부로 이동 중</span>
          <span>{approached ? "450 m" : "850 m"}</span>
        </div>
        <p>
          도로·거리·차량 위치는 모두 시연용입니다.
          <br />
          실제 내비게이션·위치·차량 SDK와 연결되지 않습니다.
        </p>
      </div>
    </aside>
  );
}
