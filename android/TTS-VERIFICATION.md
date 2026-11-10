# GAZEE 뒤차 자동 음성 안내 검증

2026-11-11 기준 로컬 작업 결과입니다.

## 기준 코드와 기존 변경 보존

- 저장소는 [AIM_PL_SUBMIT](https://github.com/jban1001/AIM_PL_SUBMIT)입니다.
- `git fetch origin` 후 로컬 HEAD와 `origin/main`이 모두 `29088171d6d94bfb982f64ccb4b067766a397347`임을 확인했습니다.
- 작업 시작 시 이미 수정된 7개 파일을 백업한 후 그 위에 필요한 변경을 추가했습니다.
- 기존 미추적 `android/app/src/main/assets/web/` 디렉터리는 보존했습니다. Gradle은 `app/build/generated/webAssets`에 현재 웹 코드를 빌드합니다.
- 초기 TTS 수정 단계에서는 Gleo Action 처리 코드와 `schema.json`을 기존 구현으로 유지했습니다. 이후 추가한 실시간 수신 제보 읽기는 아래 별도 항목에 기록했습니다. `GleoReportAction.java`의 작업 전후 SHA-256은 `BCC2F22F4E9EB63C9E489349F0CADAB473AA40AB9E6973CAB4C741519E344AE4`로 일치합니다.
- 변경 파일은 로컬에 준비되어 있습니다. GitHub 반영은 검토 및 승인 후 진행합니다.

## 음성 실행 흐름

```text
Gleo 음성 제보 → 기존 GAZEE_CREATE_REPORT → 앞차 등록 → Gleo 완료 응답
뒤차 450m 접근 → 카드 표시 → 수신 ID 중복 검사 → 음성 큐
→ GazeeSpeech 브리지 → Pleos TextToSpeech ON_DEVICE
→ 실패하면 설치된 Android 기본 TTS 엔진으로 한 번 전환
→ 재생 시작·완료 또는 오류를 카드와 시연 제어판에 표시
```

앞차와 뒤차 간 전달, 거리, 게시글 데이터와 Gemini 처리는 기존 단일 에뮬레이터의 메모리 기반 시연입니다. 실제 차량 두 대 사이의 서버 전송과 GPS 접근 판정은 이번 검증 범위에 포함되지 않습니다.

## 파일별 변경

| 파일 | 적용 내용 |
| --- | --- |
| `android/app/src/main/java/com/aim/gazee/PleosSpeech.java` | Java `illegal forward reference` 수정, Pleos ON_DEVICE 우선, Android TTS 대체 경로 보완, 엔진·원인·준비·시작·완료 이벤트, 시간 초과, 오디오 포커스 및 정리 처리 |
| `src/services/mockTTS.ts` | 실제 네이티브 이벤트와 재생 결과 연결, 사용 엔진 반환, 대체 원인 전달, 중복 종료 방지, 시작 없는 완료 거절 |
| `src/hooks/useNotificationDelivery.ts` | ID별 자동 안내 1회, 명시적 다시 듣기, 대기 제보 우선순위, 마이크·음성 테스트 중 대기, 실제 재생 결과 표시 |
| `src/domain/notifications.ts` | 대기 제보 우선순위와 재생 엔진·대체 원인 상태 정의 |
| `src/components/VoiceNotificationCard.tsx` | 사용 엔진·대체 원인, 완료 후 다시 듣기, 실패 후 다시 시도 표시 |
| `src/App.tsx` | 음성 출력 테스트, 중복 실행 방지, 제보 입력과 테스트 간 충돌 방지, 엔진과 원인을 완료 후에도 표시 |
| `tests/notifications.test.ts` | 무음 성공을 기대하던 기존 검사 수정, 네이티브 재생 이벤트·실패·취소·대기 우선순위 회귀 검사 |
| `android/build-apk.ps1` | Android Studio JDK 탐색 및 현재 프로세스 JAVA_HOME 설정, TypeScript 검사, Gradle 빌드, 선택적 설치·실행 |
| `android/README.md` | 빌드 명령, 실제 음성 시험 방법, 설치 엔진 조건 안내 |
| `android/app/src/main/AndroidManifest.xml` | 작업 시작 시 존재하던 Android TTS 검색용 `queries` 선언을 보존하고 설치 후 권한 확인 |
| `android/app/src/main/java/com/aim/gazee/MainActivity.java` | 작업 시작 시 존재하던 브리지 로그와 차량 UX 제한 검사를 보존 |

우선순위는 도로 위험, 교통, 주차, 지역 정보·기타 순서로 설정했습니다. 같은 범주는 가까운 거리, 같은 거리에서는 먼저 받은 제보가 우선입니다. 현재 재생 중인 문장을 완료한 뒤 대기열에서 선택하며, 제보의 중복 수신과 탭 변경은 재생을 다시 시작하지 않습니다.

## 빌드 환경

| 항목 | 확인 값 |
| --- | --- |
| JDK | `C:\Program Files\Android\Android Studio\jbr`, OpenJDK 21.0.10 |
| Android SDK | `C:\Users\JUN\AppData\Local\Android\Sdk`, 기존 `local.properties` 기준 |
| Android Gradle Plugin | 기존 9.2.1 |
| Gradle | 기존 Wrapper 사용 |
| Pleos TextToSpeech SDK | 기존 3.3.1 |
| AVD | Pleos_Connect_v2.1.0, API 34, x86_64 |
| 앱 | `com.aim.gazee`, 에뮬레이터 현재 사용자 10 |

JDK를 지정해 기존 코드를 빌드하자 `PleosSpeech.java`의 `illegal forward reference`가 추가로 발견됐습니다. watchdog 람다에서 뒤에 선언된 필드를 단순 이름으로 참조한 문제를 수정했습니다.

프로젝트 루트에서 다음을 실행하면 스크립트가 현재 프로세스의 JAVA_HOME을 설정하고 빌드합니다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\android\build-apk.ps1
```

설치와 실행까지 하려면 에뮬레이터를 켜고 실행합니다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\android\build-apk.ps1 -Install
```

APK는 `android/app/build/outputs/apk/debug/app-debug.apk`에 생성됩니다.

## 실제 음성 엔진 문제와 대체 경로

Pleos ON_DEVICE 초기화와 재생 요청은 성공했지만, 이후 `ON_DEVICE_ENGINE_ERROR`가 발생했습니다. 서비스 로그의 구체적 원인은 한국어 엔진의 `Failed to load MetaSpace byte pair encoder`입니다. `onStart` 이후에도 이 오류가 발생하므로 시작 이벤트만으로 재생 성공을 판단하지 않습니다.

초기 에뮬레이터에는 Android 기본 TTS로 정상 초기화되는 엔진이 없었습니다. Android TTS 대체 경로도 초기화 오류 -1을 반환했습니다.

실제 출력을 검증하기 위해 [F-Droid의 eSpeak 1.52.0](https://f-droid.org/packages/com.reecedunn.espeak/)을 에뮬레이터에 설치하고 사용자 10의 기본 TTS를 `com.reecedunn.espeak`로 설정했습니다. 이 APK는 GAZEE 코드에 포함하지 않았습니다. 다른 에뮬레이터에서도 Pleos 엔진이 실패하면 한국어 지원 Android TTS 엔진 설치와 기본 엔진 설정이 필요합니다. 실제로 확인한 뒤차 음성은 eSpeak의 합성 음성입니다.

공식 Pleos 문서는 ON_DEVICE 모드와 권한 및 이벤트를 설명합니다. Android 기본 TTS로의 전환을 Pleos가 공식 권장하거나 모든 차량에서 인증한다는 내용은 확인하지 못했습니다. 대체 경로는 Android 공식 API를 사용하며, 위 Pleos 에뮬레이터에서 호환성과 실제 출력을 확인했습니다.

## 최종 검증

| 항목 | 실제 결과 |
| --- | --- |
| TypeScript | `tsc --noEmit` 통과 |
| React | `npm run build` 통과, Gradle 내부 웹 번들 빌드도 통과 |
| 기존 및 회귀 테스트 | 26개 통과 |
| Java 및 APK | Gradle `:app:assembleDebug` 성공, APK 설치·앱 실행 성공 |
| 앞차 Gleo | 실제 Gleo 마이크 → `GAZEE_CREATE_REPORT` 수신 → 성공 Callback 확인 |
| Gleo 등록 완료 응답 | “제보가 등록되었어요” 응답 생성과 Gleo MP3 재생 완료 로그 확인 |
| 뒤차 접근 | 850m에서는 카드·음성 요청 없음, 450m에서 카드와 자동 음성 요청 1회 |
| Pleos 초기화 | 성공, 합성 단계의 ON_DEVICE_ENGINE_ERROR는 계속 재현 |
| Android 대체 TTS | eSpeak 한국어 엔진의 시작·완료 이벤트와 실제 출력 오디오 캡처 확인 |
| 중복 방지 | 탭 전환 후 복귀 시 추가 요청 0회, 같은 위험 제보 재수신 시 추가 요청 0회 |
| 실패와 재시도 | 기본 엔진을 임시로 동작하지 않는 서비스로 바꿔 오류·다시 시도 표시 확인, eSpeak 복구 후 재생 완료 |
| 수동 다시 듣기 | 완료된 제보에 대해 버튼으로 요청 1회 재실행 확인 |
| 연속 제보 | 주차 안내 재생 중 교통·지역·도로 위험을 수신, 주차 완료 후 도로 위험 → 교통 → 지역 순서와 각 완료 확인 |
| 음성 출력 테스트 | 요청된 한국어 문장을 재생, 엔진과 Pleos 실패 원인 표시 |
| Manifest 권한 | 설치된 앱의 TTS_SERVICE와 STT_SERVICE granted=true 확인, Android TTS queries 선언 확인 |
| 실제 차량 주행 | 검증하지 못함. 차량 P 상태에서 앱 내부 시연 주행 모드로 테스트 |

자동 음성 검증에는 Gleo를 거쳐 실제 등록된 “인천대로 진입지점이 막히고 있다” 제보를 사용했습니다. 앞차 회귀 검증의 입력은 Windows 한국어 합성 음성을 에뮬레이터 마이크에 넣어 진행했습니다. Gleo의 Action 처리와 응답은 실제 서비스에서 수행했으며, 뒤차 결과 오디오는 에뮬레이터 출력에서 직접 캡처했습니다.

최종 뒤차 자동 출력 캡처에는 593,054개의 0이 아닌 PCM 샘플이 있으며 peak=1434, RMS 약 140.04입니다. 이는 에뮬레이터의 출력 오디오가 생성됐음을 확인한 결과이며, 실제 차량 스피커의 측정 결과는 없습니다.

## 주행 UX 제한

현재 앱의 `CarUxRestrictions` 검사와 네이티브 잠금 동작을 유지합니다. 상태가 없거나 실제 주행 제한이 활성화되면 화면·마이크·음성을 제한하는 기존 정책이 적용됩니다. 이번에 검증한 자동 음성은 주차된 에뮬레이터의 앱 내부 시연 모드에서 동작합니다.

공식 문서에서 TTS 기능 제공을 확인했지만, 이 커뮤니티 WebView 앱의 실제 주행 중 상시 자동 안내를 승인한다는 근거는 확인하지 못했습니다. 실제 주행 지원에는 앱 분류·화면 및 서비스 실행 방식에 대한 Pleos 정책 검토와 실차 검증이 필요합니다.

## 공식 자료

- [Pleos TextToSpeech 모드 및 사용 순서](https://document.pleos.ai/docs/pleos-only/connect-sdk-pleos/TextToSpeech/intro)
- [Pleos TTS 권한](https://document.pleos.ai/en/docs/pleos-only/connect-sdk-pleos/TextToSpeech/declaring-permissions)
- [Pleos 재생 이벤트](https://document.pleos.ai/docs/pleos-only/connect-sdk-pleos/TextToSpeech/event-listeners)
- [Pleos 오류 코드](https://document.pleos.ai/api-reference/connect-sdk-pleos/TextToSpeech/error-code)
- [Android TextToSpeech와 Manifest queries](https://developer.android.com/reference/android/speech/tts/TextToSpeech)
- [AAOS 오디오 및 UX 제한](https://developer.android.com/training/cars/platforms/automotive-os)
- [AAOS 오디오 포커스](https://source.android.com/docs/automotive/audio/audio-focus)
- [Pleos 운전자 주의 분산 최소화 가이드](https://document.pleos.ai/docs/pleos-only/distribute/app-review-guide/review-driver-distraction-elements)

## ON_DEVICE 재시험과 Gleo 완료 응답 확인

2026-11-11 추가 시험입니다.

GAZEE의 WebView·음성 큐·Android 대체 엔진을 제외하고, Pleos TextToSpeech 3.3.1 `Mode.ON_DEVICE`만 호출하는 별도의 진단 APK를 빌드해 설치했습니다. SDK 초기화 성공 후 이벤트 리스너 등록, 언어 설정, `speak(text, true)` 순서를 사용했습니다.

| 시험 | 결과 |
| --- | --- |
| 한국어 `Locale.KOREA`, 짧은 문장 | ON_DEVICE_ENGINE_ERROR |
| Locale 설정 생략, 시스템 한국어 | ON_DEVICE_ENGINE_ERROR |
| 초기화 후 2초 대기 | ON_DEVICE_ENGINE_ERROR |
| Activity Context 사용 | ON_DEVICE_ENGINE_ERROR |
| 내비게이션 안내 오디오 속성 명시 | ON_DEVICE_ENGINE_ERROR |
| 영어 `Locale.US` | ON_DEVICE_ENGINE_ERROR |
| 스냅샷을 읽지 않는 콜드 부팅, 실행 메모리 8GB, 한국어 | ON_DEVICE_ENGINE_ERROR |
| 콜드 부팅 후 영어 | ON_DEVICE_ENGINE_ERROR |
| 공개 SDK의 화자 지정 `seoyoon` | ON_DEVICE_ENGINE_ERROR |
| 공개 SDK의 화자 지정 `haeun` | ON_DEVICE_ENGINE_ERROR |

모든 시험에서 SDK 초기화는 성공했지만 음성 합성 단계에서 실패했습니다. 콜드 부팅 뒤에도 Speech Service가 `Failed to load MetaSpace byte pair encoder`를 기록했습니다. 앱 호출 방식 조정으로 ON_DEVICE 출력을 복구하지 못했습니다. 영어에서도 실패하므로 현재 확인된 문제는 한국어 문장에만 한정되지 않습니다. 정확한 모델 파일·엔진 호환 문제의 원인 확정과 복구에는 Pleos 측 확인이 필요합니다.

설치된 이미지 버전은 공식 최신 릴리즈 노트의 Pleos Connect Emulator v2.1.0과 일치합니다. 메모리 8GB는 이번 실행에만 명령행 옵션으로 적용했으며 AVD 설정 파일을 변경하지 않았습니다. 독립 진단 앱은 시험 후 에뮬레이터에서 제거했습니다.

앞차에서 등록 화면만 표시되고 Gleo 완료 음성이 나오지 않은 사용자 시도의 로그에서는 다음 순서를 확인했습니다.

```text
14:19:49.908 Gleo Action accepted
14:19:51.035 end listening sound (outside click)
14:19:51.050 Gleo state Sleeping
14:19:51.422 GAZEE callback success
14:19:51.924 Reject AppActionResponse, status Sleeping
```

등록 성공과 Gleo 음성 전달 성공은 별도로 확인해야 합니다. 해당 시도에서는 Gleo 창 바깥 터치로 대화가 종료되어 GAZEE의 정상 성공 응답이 거절됐습니다. Gleo 창을 유지한 재시험에서는 다음을 확인했습니다.

```text
14:31:03.137 Gleo Action accepted
14:31:04.643 GAZEE callback success
14:31:05.884 Gleo 응답 문구 생성
14:31:12.334 Gleo MP3 재생 완료
```

응답 문구는 “가지 앱에 인천대로 진입 지점이 막히고 있다고 도로 제보를 등록할게요. 제보가 등록되었어요.”입니다. 마이크 입력에는 기존 합성 테스트 음성을 사용했고, Gleo 출력은 에뮬레이터 오디오에서 직접 캡처했습니다. 이번 Gleo 재시험을 위해 앱의 등록 처리 코드를 변경하지 않았습니다.

뒤차에 Pleos 서버 기반 음성 합성을 사용하려면 Playground My Project의 Client ID·Client Secret으로 앱을 등록하고 `onConnected()` 이후 합성을 요청해야 합니다. 현재 프로젝트에는 이 서버 TTS 앱 등록 설정이 없습니다. [공식 앱 등록 가이드](https://document.pleos.ai/docs/pleos-only/connect-sdk-pleos/TextToSpeech/app-registration)

## 새 AVD 초기 상태 추가 확인

사용자 요청에 따라 기존 사용자 데이터가 없는 임시 Pleos v2.1.0 AVD에서 ON_DEVICE 전용 시험을 진행했습니다. 한국어는 초기화 후 ON_DEVICE_ENGINE_ERROR로 실패했습니다. 이때 서비스 로그에서 한국어 모델 파일 `airspeech/ntn-bpe.ko.vbin`을 열지 못했으며 `ErrorNotExists`가 기록됐습니다. 기존 AVD의 MetaSpace 오류보다 직접적인 파일 누락 단서입니다.

영어 시험에서는 DONE 이벤트와 RMS 갱신 4회를 확인했으나 AudioTrack 관련 오류도 있어 실제 영어 음성 출력 성공으로 판정하지 않았습니다. 한국어 ON_DEVICE 재생은 해결되지 않았습니다. 현재 실패를 모든 언어와 모든 Pleos 환경에 일반화할 수 없습니다.

별도 음성 모델 도입은 사용자가 추후 판단하기로 했습니다. 추가 기능 구현을 종료하고 임시 AVD를 정리했으며 원래 AVD로 복귀했습니다.
## Gleo 실시간 수신 제보 읽기 시연

사용자가 녹음 재생 대신 수신 글마다 실제 Gleo 응답을 원한다고 확인하여 `GAZEE_READ_RECEIVED_REPORT` Action을 추가했습니다. `GleoReportAction.java`, `MainActivity.java`, `schema.json`, `src/App.tsx`를 수정했습니다. 위에 기록된 초기 GleoReportAction 해시 일치는 이 추가 구현 전 단계의 검증 결과입니다.

일반 Assist 호출 후 Callback 보내기는 Sleeping 상태에서 거절됐습니다. 에뮬레이터 명령으로 Gleo를 ListeningPassive 상태로 연 뒤 Callback을 보낸 시험도 거절됐습니다. 현재 시험에서 동작한 경로는 다음과 같습니다.

뒤차 450m 카드 수신 → PC 도우미가 수신 이벤트 감지 → 동일한 읽기 요청 한 문장을 가상 마이크로 입력 → Gleo가 새 읽기 Action 호출 → GAZEE가 고정된 수신 ID의 실제 제보를 반환 → Gleo가 실시간 음성 응답 생성·재생.

앞차의 실제 Gleo 등록 제보를 뒤차로 넘긴 시험에서 인천대로 제보를 읽었습니다. 이어 교통 제보 두 번과 주차 제보 한 번을 연속 수신한 시험에서는 교통과 주차를 각각 한 번씩 읽었습니다. 교통 읽기 요청 중 주차 글이 새로 들어와도 반환하는 제보 ID를 고정하여 순서와 내용이 일치했습니다.

실제 수집된 Gleo 응답은 다음과 같습니다.

- “가지 앱에서 방금 받은 도로 정보를 알려드릴게요. 전방 약 450미터, 성수대교 진입 구간에 교통 정체 제보가 있습니다.”
- “가지 앱에서 방금 받은 도로 정보를 알려드릴게요. 전방 약 450미터, 성수 공영주차장에 여유 공간이 있다는 제보가 있습니다.”

입력 음성은 읽기 요청 한 문장으로 고정되며 제보 본문을 포함하지 않습니다. 각 응답의 내용은 앱이 실제 수신 데이터에서 조회해 전달합니다. 두 응답의 MP3 재생 완료와 에뮬레이터 출력 오디오를 확인했습니다. 프론트 Gleo 등록 완료 응답도 다시 확인했고, APK 빌드·설치와 기존 테스트 26개가 통과했습니다.

이 기능은 Windows PC 시연 도우미, ADB, WebView 디버깅, 인증된 에뮬레이터 gRPC, Gleo 네트워크가 필요한 개발 시연입니다. APK 단독 무인 자동 호출은 검증되지 않았으며 실제 차량 P에서만 시험했습니다. 기존 CarUxRestrictions 검사와 Gleo 서명 권한 검사는 유지했습니다. 읽기 Action은 새 게시글을 등록하지 않습니다.
## 2026-11-11 최신 동작: 알림음 수신 + 사용자 요청 시 Gleo 읽기

이 절이 현재 수신 동작이다. 이전 ON_DEVICE/Android TTS 자동 낭독 및 PC 자동 Gleo 호출 실험은 과거 검증 기록이다.

### 구현

- 450m 수신은 기존 카드와 600ms 알림음만 실행한다. `NotificationChime.java`는 AudioTrack PCM과 USAGE_NOTIFICATION/SONIFICATION, 일시적 오디오 포커스를 사용한다. 시작·재생 위치 완료 이벤트를 JS로 반환하며, 포커스 거절·시간 초과·중단은 오류로 처리한다. 주행 UX 제한, 화면 이탈, 마이크 시작 시 중단한다. 추가 권한이나 서비스 서명 우회는 없다.
- `notificationChime.ts`는 GazeeChime 브리지를 사용한다. 웹 미리보기는 Web Audio 파형을 재생하며 미지원/자동재생 제한을 성공으로 처리하지 않는다. 이 경로는 TTS를 호출하지 않는다.
- `useNotificationDelivery.ts`는 ID 중복 방지, 범주/거리 우선순위 큐를 유지하며 알림음으로 수신을 알린다. 탭 전환·토글 켜기는 재생을 반복하지 않는다. 음성 제보/마이크 세션 중에는 신규 알림음을 대기시킨다.
- 카드에는 Gleo 요청 예시를 표시하고, 실패/중단 시 알림음 재시도만 제공한다. 제어판의 버튼은 '알림음 테스트'다. 설정은 '수신 알림음'이며 Gleo 읽기 요청과 독립적이다.
- Gleo CREATE/READ Action과 서명 권한 보호는 유지한다. READ는 가장 최근 수신 제보를 반환한다. 사용자 요청 예시는 “글레오, 지금 가지 앱에서 방금 받은 도로 제보를 알려줘.”이다. '가지'는 schema의 호출명이다.
- 이전 PC 도우미용 수신 이벤트와 대상 고정 이벤트 연결은 제거했다. APK가 Gleo를 자동 호출하지 않는다. 기존 PleosSpeech 진단 코드는 보존했지만 현재 수신/테스트 버튼에서 호출하지 않는다.

### 최종 검증 결과

- npm run build, TypeScript --noEmit, Node 테스트 31개 모두 성공.
- Windows Android Studio JBR를 사용하는 build-apk.ps1 -Install 성공, emulator-5554 사용자 10에 설치 및 실행.
- 최종 APK SHA256: 09CB1110FC69413B31599C255ED00C7EB4601CD7ED2163084866E6CBF588E587.
- 최종 APK 앞차 Gleo CREATE 수신 및 등록 성공 콜백 확인. 이전 녹음에서도 실제 등록 완료 응답을 캡처했다.
- 뒤차 850m에서는 카드 없음. 450m에서 원래 게시글 ID/제목을 유지한 카드 표시, AudioTrack started/done 각 1회 확인. 탭 왕복·동일 제보 재접근 후에도 이벤트 수 2개 유지.
- 최종 APK 현재 프로세스에서 제보 수신 시 GazeeSpeech.speak/Pleos TTS 호출 없음. 자동 Gleo 도우미 프로세스 없음.
- 알림음을 OFF한 상태에서 사용자의 읽기 요청을 Gleo에 전달하자 READ Action 성공, 실제 수신한 '인천대로 진입 지점이 막히고 있음'이 응답에 포함됐다. Gleo 출력: “가지 앱에서 받은 도로 제보를 알려드릴게요. 전방 약 450미터, 앞차 제보입니다. 인천대로 진입 지점이 막히고 있음.” MP3 재생 complete와 출력 PCM을 확인했다.
- Gleo 재검증 중 STT 서버 NETWORK_ERROR 1회 발생. 재요청에서 위 성공을 확인했다. 네트워크 오류를 앱 등록/읽기 성공으로 간주하지 않았다.
- 알림음 ON 복구 후 '알림음 테스트' 버튼의 AudioTrack started/done와 완료 상태 확인.
- 출력 녹음은 작업 공간 roadie-demo/gazee-rear-chime.wav 및 gazee-rear-requested-gleo.wav에 저장했다. Gleo 요청 테스트는 Windows 합성 음성을 에뮬레이터 마이크에 입력한 것이다. Gleo 응답 음성은 에뮬레이터의 실제 출력이며, Windows TTS로 대체하지 않았다. Gleo 호출창은 테스트에서 명시적으로 열었으며 실제 핫워드 검출 자체를 검증한 것은 아니다.

### 검증 범위

실제 차량 상태 P에서 앱 내부의 주행 모드와 앞차/뒤차 역할·거리·게시글 공유를 시뮬레이션했다. 실제 두 차량 간 통신, 실제 주행 시 허용 범위, 생산 차량 스피커 출력은 검증하지 않았다. 기존 CarUxRestrictions 보호를 유지했다. Gleo 읽기는 Gleo 서비스/네트워크 상태의 영향을 받는다. 게시글 정리와 차량 근거는 기존 Mock 동작이다.

참조: https://developer.android.com/reference/android/media/AudioTrack , https://developer.android.com/reference/android/media/AudioAttributes#USAGE_NOTIFICATION
